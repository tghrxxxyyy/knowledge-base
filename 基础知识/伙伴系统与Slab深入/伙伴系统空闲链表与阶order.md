# 伙伴系统空闲链表与阶order

> 对应 Tanenbaum《Modern Operating Systems》与 Silberschatz《Operating System Concepts》。

## 一、背景与挑战
伙伴系统需要为每个阶维护空闲块集合，并能在分配/释放时快速定位与合并。数据结构设计直接影响分配延迟。

## 二、核心原理
系统维护 $MAX\_ORDER$ 个空闲链表，第 $o$ 个链表挂所有 $2^o$ 页的空闲块。每个块的头几字节（或页描述符）记录阶与状态。分配从目标阶向上找，释放向下合并。

## 三、形式化与数学基础
空闲集合划分：

$$ \mathcal{F} = \bigcup_{o=0}^{MAX\_ORDER-1} F_o,\quad F_o = \{ \text{blocks of } 2^o \text{ pages} \} $$

分配复杂度：

$$ T_{alloc} = O(MAX\_ORDER) $$

因最多扫描各阶一次并拆分。合并同理为 $O(MAX\_ORDER)$。

## 四、代码实现
免费区结构（Linux 风格）：

```c
struct free_area {
    struct list_head free_list[MIGRATE_TYPES];
    unsigned long nr_free;
};

struct zone {
    struct free_area free_area[MAX_ORDER];
};
```

分配扫描：

```c
for (o = order; o < MAX_ORDER; o++)
    if (zone->free_area[o].nr_free)
        return take_block(o);
```

## 五、与其他技术对比
单链表空闲块需遍历，伙伴系统按阶索引实现快速定位；与对象池的自由链表不同，伙伴操作的是页阶块；每阶多迁移类型链表进一步细分。

## 六、常见误区
认为只有一个全局链表，实际按阶（及迁移类型）分桶；认为 nr_free 包含已拆分部分，实际只计当前阶空闲块；忽略 zone 划分（DMA/Normal/Movable）。

## 七、与开源书/权威来源对应
Linux mm/page_alloc.c 与 mmzone.h；Tanenbaum 与 Silberschatz 描述伙伴结构；OSTEP 涉及内存分配。

## 八、面试题
为何按阶分链表；MAX_ORDER 含义；分配最坏复杂度；zone 与 free_area 关系。

## 九、演进与趋势
每阶按迁移类型细分减少不可移动碎片；内存热插拔调整 zone 边界。

## 十、小结
伙伴系统用按阶索引的空闲链表组织页块，使分配与合并在常数阶数内完成，是页级内存管理的高效骨架。
