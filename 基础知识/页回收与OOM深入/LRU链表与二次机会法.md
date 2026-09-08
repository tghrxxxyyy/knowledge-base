> 对应 Linux 内核 Documentation（vm/）与 Silberschatz《Operating System Concepts》「页置换」章节。

## 一、背景与挑战
物理内存页数量远小于进程总需求，内核必须在页分配失败前主动回收「冷」页。朴素 LRU 需要全局时间戳，开销高且无法区分文件页与匿名页的不同回收费效。挑战在于：如何在无全局时钟的前提下，近似「最近最少使用」，同时避免只因一次性扫描而误回收热页。

## 二、核心原理
Linux 把每节点（pglist_data）的可回收页组织成 lruvec，其中包含五条 LRU 链表：匿名页的 active/inactive 两条，文件页的 active/inactive 两条，以及不可回收链表。页通过 mark_page_accessed 三态机（0→1→2）累积访问证据：从 inactive 提升到 active 需要两次访问，从而过滤一次性扫描抖动。二次机会法的本质是「用引用位充当是否给予第二次保留机会的标志」，时钟指针扫过时若引用位为 1 则清位并跳过，为 0 才回收。

## 三、形式化与数学基础
设页 p 的访问位为 r(p) ∈ {0,1}，时钟指针每轮扫描成本与链表长度 n 成正比。近似 LRU 年龄可用 refault 距离建模：当页被回收后再次访问，其 refault 距离 D 等于两次访问间被置换的页数。内核 refault detection 用下列关系判断 inactive 是否过小：
```
workingset_size ≈ Σ refault_dist_i   (新近回收又被访问的页)
```
当 refault 比例升高，shrink_active_list 会把更多 active 页降级到 inactive，等价于增大 LRU 窗口。

## 四、代码实现
```c
// 简化自 mm/vmscan.c 的二次机会扫描
static unsigned long shrink_page_list(struct list_head *page_list,
                                      struct scan_control *sc)
{
    struct page *page;
    list_for_each_entry(page, page_list, lru) {
        if (PageWriteback(page))   // 正在写回，给第二次机会
            continue;
        if (page_referenced(page, 0, sc->target_mem_cgroup, &vm_flags))
            continue;              // 有近期引用，保留
        if (try_to_unmap(page, TTU_IGNORE_ACCESS) == SWAP_AGAIN)
            continue;
        if (pageout(page, mapping) == PAGE_ACTIVATE)
            continue;
        __remove_from_page_cache(page);  // 真正回收
    }
    return nr_reclaimed;
}
```

## 五、与其他技术对比
- 精确 LRU：需每访问更新全局顺序，硬件/软件代价高，内核不采用。
- FIFO：无视访问频率，belady 异常明显。
- CLOCK（二次机会）：O(n) 平摊、无需全局排序，是内核近似实现的基础。
- 双时钟（active/inactive）：在 CLOCK 之上叠加「年龄分层」，比单链表更抗扫描。

## 六、常见误区
- 误区一：LRU 链表是全局唯一的一条。实际按节点、按类型分裂成多条。
- 误区二：引用位由软件实时维护。实际多由 CPU 的 accessed 位硬件置位，内核只清位。
- 误区三：active 链表里的页永远不被回收。压力足够大时 shrink_active_list 会主动降级。

## 七、与开源书/权威来源对应
- Silberschatz《Operating System Concepts》第 9 章「Virtual Memory」给出 clock 算法原型。
- Linux 内核 Documentation/admin-guide/mm/ 中「active/inactive」与「refault」说明。
- GitHub remzi-arpacidusse/ostep-code 的 paging-* 示例演示置换策略。

## 八、面试题
1. 为什么 Linux 区分 active 与 inactive 两条文件页链表？
2. 二次机会法如何避免一次性顺序扫描污染 LRU？
3. refault distance 增大说明工作集发生了什么变化？

## 九、演进与趋势
早期内核用单条 LRU + 全局扫描，2.6 引入 active/inactive 分层，后续加入 per-memcg lruvec 与 refault detection（J. Corbet 记录的 workingset 补丁）。方向是让回收决策基于「工作集大小」而非固定比例。

## 十、小结
LRU 链表与二次机会法用硬件访问位 + 年龄分层，在极低开销下逼近 LRU 语义；active/inactive 分裂与 refault 检测是内核在「局部性」与「公平性」之间的核心折中。
