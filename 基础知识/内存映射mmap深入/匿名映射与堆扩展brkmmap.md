# 匿名映射与堆扩展brkmmap

> 对应 Bryant & O'Hallaron《CSAPP》第 9 章与 Kerrisk《The Linux Programming Interface》第 7 章。

## 一、背景与挑战
进程需动态分配内存：`brk`/`sbrk` 扩展堆，或 `mmap` 匿名映射。二者底层都是向内核要虚拟内存，但粒度与用途不同，malloc 内部混用。

## 二、核心原理
`brk` 移动堆顶 `program_break`，连续扩展数据段，适合小块；`mmap(MAP_ANONYMOUS)` 在地址空间任意处建独立 VMA，适合大块或独立释放。glibc malloc 对 >128 KiB 用 mmap，小块用 brk 管理空闲链表。

## 三、形式化与数学基础
堆区：$[heap_{base}, brk]$。分配 $x$：若 $brk + x \le threshold$ 则 $brk \mathrel{+}= x$，否则 `mmap` 新区域。总虚拟占用：
$$V = (brk - heap_{base}) + \sum mmap\_regions$$
二者均初始为零页（COW 零页），物理占用按需增长。

## 四、代码实现
```c
// 大块内存直接匿名映射，munmap 即可整体释放
void *big = mmap(NULL, 1<<24, PROT_READ|PROT_WRITE,
                 MAP_PRIVATE|MAP_ANONYMOUS, -1, 0);
big[0] = 1;            // 缺页分配
munmap(big, 1<<24);
```

## 五、与其他技术对比
brk 连续、碎片难释放；mmap 独立 VMA 释放干净但 VMA 数量多。相较栈，堆/ mmap 显式管理、可很大。

## 六、常见误区
误以为 malloc 必用 brk：大块走 mmap。误以为 free 一定还内存给系统：brk 小块仍在堆。误以为匿名映射立即占物理内存：缺页才占。

## 七、与开源书/权威来源对应
CSAPP 9.9 动态内存分配；Kerrisk 第 7 章 malloc 家族与 mmap 匿名区；OSTEP 内存分配章。

## 八、面试题
问：malloc 何时用 mmap 而非 brk？答：超过阈值（默认 128KiB）的大块。问：brk 与 mmap 释放差异？

## 九、演进与趋势
jemalloc/tcmalloc 用多尺寸 arena 减少锁竞争；THP 让大匿名映射自动用大页。

## 十、小结
brk 管连续堆、mmap 管大块匿名区，二者按需零页分配共同支撑动态内存。
