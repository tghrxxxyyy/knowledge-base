> 对应 Linux 内核 Documentation（mm/）与 Silberschatz《Operating System Concepts》「Frame Allocation」。

## 一、背景与挑战
回收一个页前，内核必须知道「哪些页表项正指向它」，才能安全地解除映射（unmap）并置脏/写回。若逐进程扫描页表代价为 O(进程数×页表项)，不可接受。挑战是建立从物理页到其所有虚拟映射的反向索引。

## 二、核心原理
反向映射（reverse mapping, rmap）为每个可被回收的页维护一个映射者列表。匿名页通过 anon_vma 链（anon_vma_chain）记录所有可能映射它的 VMA；文件页通过 address_space->i_mmap 区间树记录映射它的 VMA。回收时调用 try_to_unmap 沿 rmap 遍历，对每个 PTE 清 accessed/dirty 并解除，从而让页可被 freed。

## 三、形式化与数学基础
设物理页帧 f 被进程集合 P = {p_1,…,p_k} 映射，每进程映射次数 c_i ≥ 0。页的映射计数（不是引用计数 _refcount）满足：
```
mapcount(f) = Σ_{i=1..k} c_i
```
仅当 mapcount(f) == 0 时该页才能从 LRU 摘下并释放。引用计数 _refcount 则统计「内核各处持有该页结构的句柄数」，二者正交：mapcount 描述用户态映射，_refcount 描述内核态持有。

## 四、代码实现
```c
// mm/rmap.c 中沿 rmap 解除映射（简化）
bool try_to_unmap(struct page *page, enum ttu_flags flags)
{
    struct rmap_walk_control rwc = {
        .rmap_one = try_to_unmap_one,
        .arg = (void *)flags,
    };
    if (PageAnon(page))
        rmap_walk_anon(page, &rwc, true);   // 走 anon_vma 链
    else
        rmap_walk_file(page, &rwc, true);   // 走 address_space->i_mmap
    return !page_mapcount(page);            // mapcount 归零才成功
}
```

## 五、与其他技术对比
- 正向映射（页表）：虚→物，O(1) 查，但反向查询难。
- 反向映射 rmap：物→虚，回收必需，额外内存维护。
- 全局扫描：正确性易但 O(N) 太慢，已被 rmap 取代。

## 六、常见误区
- 误区：mapcount 为 0 即可释放页。还需 _refcount 归零（无内核持有者）。
- 误区：rmap 只用于匿名页。文件页用 i_mmap 反向映射，同样靠 rmap 框架。

## 七、与开源书/权威来源对应
- Silberschatz《Operating System Concepts》讨论帧分配与页表遍历。
- Linux 内核 Documentation/admin-guide/mm/numa-mapping.rst 提及 rmap。
- GitHub remzi-arpacidusse/ostep-code 的 vm-* 示例展示页表结构。

## 八、面试题
1. mapcount 与 _refcount 的区别？
2. 匿名页的反向映射靠什么数据结构？
3. 为什么回收前必须 try_to_unmap？

## 九、演进与趋势
早期 2.4 用单向 anon_vma，会误扫无关进程；2.6.34 引入 anon_vma_chain 实现「与创建顺序无关」的精确反向映射，大幅降低回收时的无效扫描。

## 十、小结
rmap 以少量常驻内存为代价，把「回收前解除所有映射」从 O(N) 降为 O(实际映射数)，是页回收正确性与性能的关键。
