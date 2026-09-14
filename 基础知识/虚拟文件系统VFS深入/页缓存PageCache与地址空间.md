# 页缓存PageCache与地址空间

> 对应 Bovet & Cesati《Understanding the Linux Kernel》第 15 章「页缓存」与第 16 章「页回写」，以及 Love《Linux Kernel Development》中关于页缓存与回写的章节。

## 一、背景与挑战
若每次 `read`/`write` 都直达存储设备，吞吐将完全受制于 I/O 延迟：内存访问约百纳秒量级，机械盘寻道为毫秒量级，NVMe 随机读也在数十微秒量级，两者相差三到六个数量级。此外，文件被反复访问、被多进程共享、或先写后读的场景极为普遍，重复的物理 I/O 是纯浪费。
页缓存（page cache）以「用内存换 I/O」为核心：把文件内容以页（通常 4 KiB）为单位缓存在内存中，使重复访问转化为内存访问。这带来三个必须解决的难题：**一致性**（写何时落盘）、**回收策略**（内存压力下淘汰谁）、以及**与用户态映射的协同**（`mmap` 与 `read` 如何共享同一份数据）。

## 二、核心原理
每个 inode 通过 `i_mapping` 关联一个 `struct address_space`，它是「一个文件所有缓存页」的管理中心：
- `i_pages`：以文件页偏移为索引的 **xarray**（早期为基数树 radix tree），提供 $O(\log n)$ 查找与插入，并支持 RCU 无锁读取；
- `a_ops`：`address_space_operations` 函数表（`read_folio`、`writepages`、`write_begin`/`write_end`、`direct_IO`、`invalidate_folio` 等），把通用逻辑下沉到具体文件系统；
- `i_mmap`：反向映射树，用于在回收某页时找到所有映射它的页表项（rmap）并解除映射；
- `nrpages`、`dirty` 等计数，参与全局与 memcg 级脏页统计。
当前内核以 **folio** 为基本单位（一个 folio 可含多个连续页，即大页缓存），以减少元数据与遍历开销。
**读路径**：`read` 进入 `generic_file_read_iter` → `filemap_read` → 在 xarray 中查找目标 folio；命中则 `copy_to_user`，未命中则触发**预读（readahead）**并等待 `read_folio` 完成。预读窗口由 `file_ra_state` 维护，顺序访问时按倍数增长至上限 `ra_pages`，随机访问则收缩为单页。
**写路径**：`write` 进入 `generic_perform_write` → `write_begin`（在页缓存准备空间）→ `copy_from_user` → `write_end` → `folio_mark_dirty`。默认的**写回（write-back）**策略意味着 `write` 返回时数据仅在内存中，掉电会丢失，必须 `fsync`/`fdatasync` 才保证持久化。
**回写路径**：每个块设备有对应的 `bdi_writeback` 与 flusher 线程。触发条件为三类：周期超时（`dirty_expire_centisecs`）、脏页比例越限（后台阈值 `dirty_background_ratio` 唤醒 flusher）、以及同步请求（`fsync`、`sync_file_range`）。写回期间页被标记为 writeback，直到 I/O 完成才允许淘汰——脏页与正在写回的页都不能直接回收。
**与 `mmap` 的协同**：`mmap` 把页缓存 folio 直接映射进进程页表。`MAP_SHARED` 下写页等同于修改页缓存，其他 `read` 立即可见；`MAP_PRIVATE` 下写触发 COW，拿到的私有副本不影响页缓存与文件。页被映射时通过 `i_mmap` 建立反向映射，回收时必须先解除所有页表映射（并同步 TLB）再释放。

## 三、形式化与数学基础
设内存访问延迟 $T_{mem}$、设备访问延迟 $T_{disk}$、命中率 $h$，则平均读延迟：

$$ T_{avg} = h \cdot T_{mem} + (1 - h) \cdot T_{disk} $$

当 $h \to 1$ 时 $T_{avg} \to T_{mem}$。命中率取决于工作集与缓存容量的关系，LRU 类策略在「工作集可容纳」时表现良好。
写回把写延迟从 $T_{disk}$ 降为 $T_{mem}$，代价是引入丢失窗口。为让窗口有界，内核施加两级水位：

$$ dirty > dirty\_background\_ratio \cdot Mem \Rightarrow \text{唤醒 flusher 异步回写} $$
$$ dirty > dirty\_ratio \cdot Mem \Rightarrow \text{阻塞新的写入者（throttle）} $$

最老的脏页超过 `dirty_expire_centisecs` 必然被回写。回收侧区分两类页：干净且可解除映射的页可立即丢弃，脏页必须回写后才能回收。预读窗口可建模为 $W_{n+1} = \min(2 W_n, W_{max})$（顺序命中），随机访问时重置为单页。

## 四、代码实现
```c
#include <fcntl.h>
#include <sys/mman.h>
#include <unistd.h>

int prime_cache(int fd) {
    char buf[4096];
    ssize_t n = read(fd, buf, sizeof(buf));   /* 缺页时 fill 进 page cache */
    return n > 0 ? 0 : -1;
}

int map_read(int fd, size_t len) {
    void *addr = mmap(NULL, len, PROT_READ, MAP_PRIVATE, fd, 0);
    if (addr == MAP_FAILED) return -1;
    volatile char c = ((char *)addr)[0];      /* 触发映射建立与缺页填充 */
    (void)c;
    /* 只有 MAP_SHARED 的写才影响页缓存与文件；MAP_PRIVATE 走 COW */
    return munmap(addr, len);
}

int persist(int fd) {
    return fdatasync(fd);                     /* 数据 + 必要元数据落盘 */
}
```

通过 `posix_fadvise` 影响页缓存与预读行为，或直接绕过缓存：

```c
posix_fadvise(fd, 0, 0, POSIX_FADV_SEQUENTIAL);   /* 增大预读窗口 */
posix_fadvise(fd, 0, 0, POSIX_FADV_RANDOM);       /* 关闭预读 */
posix_fadvise(fd, 0, 0, POSIX_FADV_DONTNEED);     /* 丢弃干净页 */
posix_fadvise(fd, 0, 0, POSIX_FADV_WILLNEED);     /* 异步预取 */

int dfd = open("raw.bin", O_RDWR | O_DIRECT);     /* 绕过页缓存，需对齐 */
```

```bash
# 观察页缓存与回写状态
grep -E '^(Cached|Dirty|Writeback)' /proc/meminfo
cat /proc/vmstat | grep -E '^(nr_dirty|nr_writeback)'
sync && echo 3 > /proc/sys/vm/drop_caches    # 只清干净页，不影响磁盘数据
```

## 五、与其他技术对比
| 维度 | 页缓存（write-back） | 早期 buffer cache | `O_DIRECT` | DAX | 应用自建缓存 |
| --- | --- | --- | --- | --- | --- |
| 缓存粒度 | folio（可多页） | 以块为单位 | 无缓存 | 无内存副本 | 自定义 |
| 与 `mmap` 统一 | 是（同一份页） | 否，需额外拷贝 | 不适用 | 是 | 否 |
| 一致性模型 | 写后读一致，落盘异步 | 写后读一致 | 每次直达设备 | 直达持久内存 | 应用维护 |
| 典型优势 | 通用、命中率高 | 兼容块设备接口 | 延迟可控、避免双重缓冲 | 消除拷贝与缺页 | 针对访问模式优化 |
| 典型代价 | 掉电丢窗口、脏页抖动 | 双重缓存 | 需对齐、小随机更慢 | 依赖持久内存硬件 | 可能与内核缓存重复占用 |

与数据库自建缓存相比，页缓存通用且能被多进程共享（同一份页），但淘汰策略与访问语义不可控，因此 Oracle/PostgreSQL 这类系统常以 `O_DIRECT` 绕过页缓存、自管缓冲区池，避免「双重缓存」导致有效内存减半，以及 `write` 与 `fsync` 语义不清。

## 六、常见误区
- **以为 `write` 返回即落盘**：默认写回策略下数据仅在内存；`rename` 覆盖配置文件的惯用法还需 `fsync` 目录才能保证崩溃一致性。
- **以为 `O_DIRECT` 一定更快**：它绕过缓存与预读，小随机 I/O 通常更慢，且要求缓冲区、偏移、长度对齐。
- **以为 `drop_caches` 会破坏文件**：它只丢弃干净页（脏页先被回写），数据仍在设备上，但会显著降低后续性能。
- **以为 `MAP_PRIVATE` 的写会写回文件**：写触发 COW，只影响本进程的私有副本。
- **以为 `mmap` 与 `read` 看到两份数据**：二者共享同一页缓存，`MAP_SHARED` 的写会立即被 `read` 观察到。
- **忽略跨页越界访问**：`mmap` 后在文件最后一页内读取末尾之后字节得到 0，跨到下一页则收到 `SIGBUS`（`BUS_ADRERR`）而非 `SIGSEGV`。

## 七、与开源书·权威来源对应
- Bovet & Cesati《Understanding the Linux Kernel》第 15 章给出 `address_space`、基数树索引与页缓存查找，第 16 章讲解回写与 flusher 机制。
- Love《Linux Kernel Development》关于页缓存与页回写的章节说明 `write_begin`/`write_end`、脏页标记与回收协同。
- Remzi & Andrea《Operating Systems: Three Easy Pieces》的缓存与文件系统章节从课程视角解释命中率与写回权衡。
- Drepper《What Every Programmer Should Know About Memory》给出缓存层次与内存带宽的数量级参考，可对照理解内存与设备的差距。
- Kerrisk《The Linux Programming Interface》详述 `posix_fadvise`、`sync_file_range`、`fsync`/`fdatasync` 的语义差异；内核文档 `Documentation/admin-guide/sysctl/vm.rst` 是参数含义的权威来源，具体默认值以官方最新文档为准。

## 八、面试题
1. **连续两次 `read` 同一段数据，第二次为什么快？**
   要点：第一次触发缺页与预读，把文件页填充进该 inode 的 `address_space`；第二次在 xarray 中命中，只做 `copy_to_user`。
2. **`write` 之后 `read` 能立刻看到数据，但掉电会丢，为什么？**
   要点：写先改页缓存并标脏，读路径查同一份页缓存，因此逻辑立即可见；持久化由后台回写完成，存在丢失窗口，需 `fsync`。
3. **`mmap` 与 `read` 的一致性如何保证？**
   要点：两者操作同一份页缓存；`MAP_SHARED` 的写立即反映，`MAP_PRIVATE` 的写触发 COW 不影响缓存与文件。
4. **大页缓存（large folio）为什么能提升性能？**
   要点：减少 xarray 元数据与遍历次数、降低缺页与 TLB 压力、便于顺序预读；代价是内存碎片与部分写需要拆 folio。
5. **数据库为什么常用 `O_DIRECT`？**
   要点：避免与自建缓冲池形成双重缓存、精确控制落盘时机与顺序、绕开内核回写调度；代价是需自行处理对齐、预读与一致性。

## 九、演进与趋势
页缓存的演进方向是「更少元数据、更好并发、更细控制」：基数树替换为 xarray 并支持 RCU 无锁查找；`folio` 统一单页与多页处理，为大页缓存铺路；反向映射从 per-page 精确 rmap 发展到 PTE 区间遍历（`rmap_walk`），在大页与内存密集型负载下把映射遍历成本降一个数量级。回写侧引入 cgroup 级限速（`io.max`），使脏页回写可被配额化。存储侧，`iomap` 取代 `buffer_head` 路径、`DAX` 让持久内存在 `mmap` 下直接寻址。随着持久内存与 NVMe 延迟继续下降，「缓存与持久层的界限」会越来越模糊，但「用内存换 I/O」与写回引入的一致性权衡仍将成立。

## 十、小结
页缓存以 `address_space` 为中心，用 xarray 索引文件页、用 `a_ops` 下沉文件系统差异、用反向映射支持 `mmap` 与回收协同，把重复的文件访问从设备延迟降到内存延迟。读写路径分别通过预读与写回获得吞吐，代价是掉电丢失窗口与脏页抖动，需要 `fsync` 与水位参数配合治理。理解「`read`/`write`/`mmap` 共享同一份页缓存」与「写回不等于落盘」这两点，就掌握了文件 I/O 性能与一致性的核心。
