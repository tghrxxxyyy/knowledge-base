# 页缓存PageCache与地址空间

> 对应 Bovet & Cesati《Understanding the Linux Kernel》第 15 章页缓存与 Love《Linux Kernel Development》第 16 章页缓存与页回写。

## 一、背景与挑战
每次 `read/write` 都访问磁盘会使吞吐受限于 I/O 延迟（毫秒级）。页缓存把文件数据以页（通常 4 KiB）为单位缓存在内存，使重复访问变为内存速度（百纳秒级）。

## 二、核心原理
每个 `inode` 关联一个 `address_space`（`inode->i_mapping`），管理该文件所有缓存页，以基数树（radix/xarray）按文件偏移索引。读时若页缺失则从磁盘读入并缓存；写时默认"写回"（write-back）先改内存页标脏，由 flusher 线程周期性或内存压力时回写磁盘。

## 三、形式化与数学基础
缓存命中率 $h$ 下平均读延迟：
$$T_{avg} = h \cdot T_{mem} + (1-h) \cdot T_{disk}$$
写回使写延迟由 $T_{disk}$ 降为 $T_{mem}$；脏页比例须受 `dirty_ratio` 限制以避免丢失过多。回写触发：$dirty > dirty\_background\_ratio$ 唤醒 flusher。

## 四、代码实现
```c
// 文件映射读：命中页缓存则零拷贝
void *addr = mmap(NULL, len, PROT_READ, MAP_PRIVATE, fd, 0);
// 或 read 触发文件页填充 address_space
char buf[4096];
read(fd, buf, sizeof(buf));   // 缺页时 fill 进 page cache
```

## 五、与其他技术对比
相较 buffer cache（早期按块缓存），页缓存按页且统一了文件与内存映射。相较数据库自建缓存，页缓存通用但缺针对性淘汰策略，故大库常走 `O_DIRECT` 绕过。

## 六、常见误区
误以为写立即落盘：默认写回，掉电可能丢数据，`fsync` 才强制。误以为 `O_DIRECT` 一定更快：对小随机 I/O 反而因绕过缓存变慢。误以为 `drop_caches` 影响文件内容：只清缓存，数据仍在磁盘。

## 七、与开源书/权威来源对应
OSTEP 第 22 章"Cache and VM"与 Bovet & Cesati 第 15 章均给出页缓存结构与回写机制；Kerrisk 详述 `posix_fadvise`。

## 八、面试题
问：`read` 后立刻 `read` 同段为何快？答：命中 page cache。问：如何保证持久化？答：`fsync`/`fdatasync` 冲刷脏页与元数据。

## 九、演进与趋势
xarray 取代 radix tree 提升并发；多队列回写（cgroup 限速）与 `folio` 大页缓存减少元数据开销。

## 十、小结
页缓存是"用内存换 I/O"的核心，理解命中率、脏页回写与 `mmap` 共享是性能调优基础。
