# 匿名映射与堆扩展brkmmap

> 对应 Bryant & O'Hallaron《CSAPP》第 9 章与 Kerrisk《The Linux Programming Interface》第 7 章。

## 一、背景与挑战

进程需要动态内存：程序运行时才知道要分配多少，且分配与释放的顺序不确定。系统提供了两条底层路径——用 `brk`/`sbrk` 移动堆顶来连续扩展数据段，或用 `mmap(MAP_ANONYMOUS)` 在地址空间任意处建立独立映射。二者都是「向内核申请虚拟内存」，但粒度、释放方式与碎片特性不同。

`malloc` 并非只用一种：glibc 对小块走 `brk` 管理的空闲链表，对大块直接用 `mmap`。理解这套混合策略，是解释「为什么 free 之后内存没还给系统」等常见困惑的关键。

## 二、核心原理

**brk 路径**：内核维护 `program_break` 指针，`brk(x)` 把它移动到 $x$，从而连续地扩大或缩小堆区 $[heap_{base}, brk)$。好处是连续、页表集中；坏处是只能整体回缩，小块释放难以归还内核。

**mmap 匿名路径**：`mmap(..., MAP_PRIVATE|MAP_ANONYMOUS, -1, 0)` 在地址空间任意空闲处建立独立 VMA，初始内容全零。释放用 `munmap` 可整块归还，但每个映射占一个 VMA，数量过多会增加内核开销。

**malloc 的分流**：glibc 对大于阈值（常见为 128 KiB，可调）的请求走 `mmap`，小于的走 `brk` 维护的 arena。两种来源都按需分页，首次访问才真正分配物理帧。

## 三、形式化与数学基础

堆区范围 $[heap_{base}, brk)$。一次大小为 $x$ 的请求：

$$ \text{allocate}(x) = \begin{cases} brk \leftarrow brk + x & \text{若 } brk + x \le \text{threshold} \\ mmap(x) & \text{否则} \end{cases} $$

进程的总虚拟占用：

$$ V_{virt} = (brk - heap_{base}) + \sum_i \text{size}(mmap_i) $$

但虚拟占用不等于物理占用。匿名页初始映射到全局零页（只读），首次写触发 COW 分配真实帧，故：

$$ V_{phys} \approx \sum_{\text{已写页}} 4096 \text{ 字节} \le V_{virt} $$

这解释了 `malloc(1GB)` 后并不会立即吃掉 1 GB 物理内存。

## 四、代码实现

```c
#include <sys/mman.h>
#include <unistd.h>
#include <string.h>
#include <stdio.h>

int main(void) {
    size_t n = 1 << 24;   /* 16 MiB */

    /* brk 路径：连续扩展堆，适合小块、释放后仍留堆内 */
    void *heap = sbrk(0);
    if (sbrk(4096) == (void *)-1) return 1;

    /* mmap 匿名路径：独立 VMA，munmap 可整体归还 */
    char *big = mmap(NULL, n, PROT_READ | PROT_WRITE,
                     MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (big == MAP_FAILED) return 2;

    big[0] = 1;           /* 首次写触发缺页，分配物理帧 */
    memset(big + (1 << 20), 2, 4096);

    munmap(big, n);       /* 整块释放，归还物理内存 */
    printf("heap base=%p\n", heap);
    return 0;
}
```

生产中优先用 `malloc`/`calloc`，它们已在内部按大小选择 brk 或 mmap 路径。

## 五、与其他技术对比

| 路径 | 连续性 | 释放粒度 | 碎片特性 | 适用规模 |
| --- | --- | --- | --- | --- |
| `brk`/`sbrk` | 连续扩展堆 | 难单独归还 | 易产生堆内碎片 | 小块 |
| `mmap` 匿名 | 独立 VMA | 可整块 `munmap` | 碎片少，VMA 数多 | 大块 |
| `malloc` 小对象 | 由 brk 池管理 | free 回空闲链表 | 依赖分配器策略 | 通用 |
| `malloc` 大对象 | 直接 mmap | free 触发 munmap | 干净 | 大块 |
| 栈 | 连续自动管理 | 自动 | 无 | 小且生命周期短 |

## 六、常见误区

- 认为 `malloc` 必然用 `brk`：大块会走 `mmap`，这是默认阈值行为。
- 认为 `free` 一定把内存还给系统：来自 brk 的小块仍留在堆中，可能只标记为空闲。
- 认为匿名映射立即占物理内存：初始是零页映射，写时才按需分配。
- 认为 brk 和 mmap 分配的内存可以混用释放：必须与分配来源对应。
- 忽略 VMA 数量上限：大量小 `mmap` 会触发 `vm.max_map_count` 限制。

## 七、与开源书·权威来源对应

CSAPP 第 9 章讲解动态内存分配、碎片与分配器实现；Kerrisk《The Linux Programming Interface》第 7 章覆盖 malloc 家族与匿名映射；OSTEP 的内存分配章节提供了分配策略的对比视角。具体阈值与行为以官方最新文档为准。

## 八、面试题

- 问：`malloc` 何时用 mmap 而非 brk？答：请求超过阈值（常见 128 KiB）的大块走 mmap。
- 问：brk 与 mmap 释放差异？答：brk 难以单独归还小块，mmap 可用 munmap 整块归还。
- 问：`malloc(1GB)` 会立即占 1GB 物理内存吗？答：不会，匿名页按需分页，写时才分配。
- 问：为何 `free` 后 RSS 没下降？答：内存可能来自 brk 池，被分配器保留复用。

## 九、演进与趋势

jemalloc/tcmalloc 用多尺寸 arena 与线程本地缓存减少锁竞争与碎片；透明大页（THP）让大匿名映射自动使用 2 MiB 大页以降低 TLB 压力；内存回收依赖 `madvise(MADV_DONTNEED)` 主动归还。具体实现以官方最新文档为准。

## 十、小结

brk 管连续堆、mmap 管大块匿名区，malloc 按大小在两者间分流。共同点是**虚拟分配、物理按需**：理解这一点就能解释内存占用的诸多反直觉现象。
