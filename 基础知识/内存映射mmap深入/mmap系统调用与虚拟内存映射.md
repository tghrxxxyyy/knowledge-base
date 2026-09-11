# mmap系统调用与虚拟内存映射

> 对应 Kerrisk《The Linux Programming Interface》第 49 章与 Bryant & O'Hallaron《CSAPP》第 9 章虚拟内存。

## 一、背景与挑战

传统的 `read`/`write` 每次都要把数据在用户缓冲区与内核页缓存之间拷贝，且每次调用伴随一次用户态/内核态切换。对大文件或高频访问，这些拷贝与切换成为瓶颈。`mmap` 的思路是把文件或匿名内存直接投影进进程虚拟地址空间，让用户态用指针直接访问，从而消除显式拷贝、减少系统调用次数。

难点在于理解它不是「读文件到内存」，而是「建立地址到文件的映射关系」：真正的数据搬运由缺页异常在首次访问时按需触发。

## 二、核心原理

`mmap` 在进程虚拟地址空间中创建一段 VMA，并在其中建立「虚拟页 → 文件偏移或物理帧」的映射关系。要点：

1. 映射建立时不读取文件内容，也不分配物理页，只是登记映射；
2. 首次访问某页时触发缺页异常，内核从页缓存（必要时从磁盘读入）取得页并建立 PTE；
3. 返回的指针可像数组一样直接解引用，访存由 MMU 完成地址翻译；
4. `munmap` 解除映射，`msync` 负责把共享改动写回文件。

参数语义：`prot` 指定权限，`flags` 指定共享/私有与是否匿名，`offset` 必须页对齐，`length` 会被向上取整到页。

## 三、形式化与数学基础

设虚拟地址 $v$ 落在 VMA 区间 $[start, end)$ 内，文件映射的地址翻译为：

$$ \text{phys}(v) = \text{file\_page}\!\left(\text{off} + (v - \text{start})\right) $$

匿名映射则

$$ \text{phys}(v) = \begin{cases} \text{zero\_page} & \text{尚未写} \\ \text{新分配帧} & \text{已写（COW）} \end{cases} $$

页表项记录的物理帧号与权限：

$$ \text{PTE}(v) = \langle\, \text{pfn},\; R/W/X,\; \text{present} \,\rangle $$

有效访问时间体现了缺页代价：

$$ EAT = (1-p)\,T_{hit} + p\,T_{fault}, \qquad T_{fault} = T_{disk} + T_{map} $$

其中 $p$ 为缺页率，局部性原理使顺序/局部访问下 $p$ 很小。

## 四、代码实现

```c
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>

int main(void) {
    int fd = open("data.bin", O_RDONLY);
    if (fd < 0) return 1;

    struct stat st;
    if (fstat(fd, &st) != 0) return 2;

    /* 建立映射：此刻并未读取文件内容 */
    char *p = mmap(NULL, (size_t)st.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
    if (p == MAP_FAILED) return 3;

    /* 首次访问触发缺页，由内核读盘填充页缓存 */
    unsigned long sum = 0;
    for (off_t i = 0; i < st.st_size; i += 4096) {
        sum += (unsigned char)p[i];
    }

    munmap(p, (size_t)st.st_size);
    close(fd);
    printf("checksum=%lu\n", sum);
    return 0;
}
```

`offset` 必须是页大小（通常 4096）的整数倍，否则 `mmap` 返回 `MAP_FAILED`。

## 五、与其他技术对比

| 方式 | 拷贝次数 | 系统调用 | 缓存行为 | 适用场景 |
| --- | --- | --- | --- | --- |
| `read`/`write` | 2 次（页缓存↔用户） | 每次调用 | 走页缓存，可控 | 顺序流、小文件 |
| `mmap` 文件映射 | 0 次显式拷贝 | 建立一次 | 走页缓存，缺页触发 | 大文件随机访问 |
| `O_DIRECT` | 0 次（直达设备） | 每次调用 | 绕过页缓存 | 数据库自管缓存 |
| `mmap` 匿名 | 0 | 建立一次 | 零页 + COW | 大块内存分配 |

## 六、常见误区

- 认为 `mmap` 会立即读盘：只是建立映射，缺页时才读。
- 认为 `mmap` 总比 `read` 快：小文件或随机冷读可能因频繁缺页而更慢。
- 认为 `munmap` 保证落盘：共享映射需 `msync`，私有映射根本不落盘。
- 忽略 `offset` 的页对齐要求：未对齐会直接失败。
- 认为映射长度可任意：会被向上取整，且跨越文件末尾的访问会触发 SIGBUS。

## 七、与开源书·权威来源对应

CSAPP 第 9 章讲解 mmap 与地址翻译；Kerrisk《The Linux Programming Interface》第 49 章覆盖标志、对齐、同步与边界语义。具体内核版本行为以官方最新文档为准。

## 八、面试题

- 问：mmap 与 read 的本质差别？答：mmap 建立地址映射实现零拷贝访问，read 需把数据拷进用户缓冲。
- 问：`MAP_PRIVATE` 写会怎样？答：触发 COW，产生进程私有副本，文件不变。
- 问：地址翻译的粒度？答：页级，PTE 负责映射与权限。
- 问：访问映射区外的文件尾部会怎样？答：可能触发 SIGBUS。

## 九、演进与趋势

`userfaultfd` 把缺页处理交给用户态，支撑虚拟机与内存压缩；大页/透明大页降低 TLB 压力；`map_files` 等接口便于调试与检查映射。具体能力以官方最新文档为准。

## 十、小结

mmap 用 VMA 把文件或匿名内存投影到虚拟地址空间，靠缺页按需填充，是零拷贝访问的基石。牢记三点：映射不等于读盘、权限影响写语义、对齐与边界决定正确性。
