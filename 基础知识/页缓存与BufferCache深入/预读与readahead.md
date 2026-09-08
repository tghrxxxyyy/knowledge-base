> 对应 Bryant & O'Hallaron《CSAPP》「Virtual Memory」与 Linux 内核 Documentation（block/）。

## 一、背景与挑战
顺序读文件时若每次只读一页，会产生大量小 IO 与高延迟。利用局部性，提前读入后续页可隐藏磁盘延迟。挑战是预测「接下来会读哪些页」且不过度预读浪费内存与带宽。

## 二、核心原理
页缓存的 readahead 机制在顺序访问时，按「当前窗口 + 前瞻窗口」成批读入。内核跟踪每个文件读的连续性，若检测到顺序模式，则把 readahead 窗口成倍扩大（直到上限）；遇到随机访问则收缩或关闭预读。预读页标记为 PG_readahead 标记，下次访问命中即触发下一轮。

## 三、形式化与数学基础
设当前窗口起点 s、大小 w，前瞻窗口大小 lookahead l（l < w）。当访问到达前瞻边界：
```
next_readahead: 读 [s + w, s + w + l)
grow:  w = min(w * 2, max_readahead)
shrink (随机):  w = initial_small
```
命中率与浪费比：
```
useful = |accessed within window| / |prefetched|
```
目标最大化 useful 同时限制内存占用。

## 四、代码实现
```c
// mm/readahead.c（简化）
static unsigned long ondemand_readahead(struct address_space *mapping,
                                        struct file_ra_state *ra, pgoff_t offset)
{
    if (offset == ra->start + ra->size) {        // 顺序命中
        ra->size = min(ra->size << 1, max_readahead);
        return ra_submit(ra, mapping, offset);    // 触发预读
    }
    // 随机/首次：小窗口
    ra->size = VM_READAHEAD_PAGES;
    ra->start = offset;
    return ra_submit(ra, mapping, offset);
}
```

## 五、与其他技术对比
- 无预读：每页一次 IO，延迟高。
- 固定预读：简单但浪费（随机负载）或不足（大顺序）。
- 自适应 on-demand readahead：按访问模式伸缩，最优折中。

## 六、常见误区
- 误区：预读一定提升性能。对纯随机读，预读浪费带宽。
- 误区：预读会覆盖应用读。它只填充缓存，未访问的预读页可被回收。

## 七、与开源书/权威来源对应
- Bryant & O'Hallaron《CSAPP》第 9 章讲「高速缓存与局部性」，预读即磁盘级空间局部性利用。
- Linux 内核 mm/readahead.c 实现 ondemand_readahead。
- GitHub Hansimov/csapp 的「存储器层次」实验。

## 八、面试题
1. 为什么顺序读受益预读而随机读不受益？
2. 预读窗口如何自适应调整？
3. 预读页若未被访问会怎样？

## 九、演进与趋势
从简单顺序检测到「上下文预读」「随机混合并发预读」，并支持 mmap 下的 fault-around 预读；与 IO 调度器的合并/排序协同减少寻道。

## 十、小结
readahead 利用空间局部性自适应批量预取后续页，用少量内存/带宽换取顺序读延迟的显著下降。
