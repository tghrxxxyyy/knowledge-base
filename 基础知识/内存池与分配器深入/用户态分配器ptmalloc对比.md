# 用户态分配器ptmalloc对比

> 对应 Bryant & O'Hallaron《CSAPP》与 CyC2018/CS-Notes。

## 一、背景与挑战
glibc 的 ptmalloc2 是常见用户态分配器，需兼顾多线程、碎片与性能。理解其结构才能解释「内存为何不还给系统」「多线程为何变慢」等现象。

## 二、核心原理
ptmalloc 维护一个主分配区与若干非主分配区（每区一把锁），用空闲 chunk 的隐式/显式链表组织。小对象用 fastbins（不合并、快）、unsorted/bin 链表管理；大对象用 mmap 直接映射。线程优先用自身 arena 以减少锁竞争。

## 三、形式化与数学基础
chunk 元数据含大小与前后向指针，bins 为按尺寸分组的链表。分配查找：

$$ \text{alloc}(s): \text{find bin } b \text{ with chunk} \ge s;\ \text{split if needed} $$

碎片度量：

$$ \text{frag} = 1 - \frac{\text{used}}{\text{allocated from OS}} $$

高 frag 表示大量无法归还的小空闲块。

## 四、代码实现
典型行为与陷阱：

```c
void *p = malloc(16);    // 从 arena/fastbin
free(p);                 // 可能留在 fastbin，不立即归还系统
void *big = malloc(1<<20); // 大块走 mmap，free 直接 munmap
```

ptmalloc 的 chunk 头部（简化）：

```c
struct malloc_chunk {
    size_t size;          // 含头部与标志
    struct malloc_chunk *fd, *bk;  // 空闲时链表指针
};
```

## 五、与其他技术对比
ptmalloc 多线程有锁竞争；tcmalloc/jemalloc 用每线程缓存与尺寸分类大幅降低竞争与碎片；内核 slab 思想类似但运行在特权态。理解差异有助于性能调优。

## 六、常见误区
认为 free 一定把内存还给系统，实际常留在空闲链表；认为多线程 malloc 无锁，ptmalloc 的 arena 仍有锁；忽略内存对齐与最小块尺寸造成的内部碎片。

## 七、与开源书/权威来源对应
Bryant & O'Hallaron《CSAPP》第 9 章详解动态内存分配与隐式空闲链表；CyC2018/CS-Notes 有用户态分配器对比；Hansimov/csapp 提供实验代码。

## 八、面试题
fastbin 作用；为何大块用 mmap；arena 与线程关系；与 tcmalloc 区别。

## 九、演进与趋势
jemalloc/tcmalloc 在高并发服务成主流；mimalloc 以低开销与确定性回收受关注。

## 十、小结
ptmalloc 以 arena、bins 与 mmap 混合策略在通用场景下平衡性能，但其锁与碎片特性促使专用分配器在并发场景取而代之。
