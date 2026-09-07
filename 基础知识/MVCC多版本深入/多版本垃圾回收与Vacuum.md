# 多版本垃圾回收与Vacuum

> 对应 Vonng/ddia 第 7 章（MVCC 与回收讨论），以及 Kleppmann《Designing Data-Intensive Applications》第 7 章。

## 一、背景与挑战
MVCC 持续产生新版本，旧版本在不再被任何活跃快照需要后成为“死版本”。若不及时回收，表与索引膨胀、扫描变慢、磁盘耗尽。

## 二、核心原理
垃圾回收（GC/Vacuum）识别满足“对任何活跃/未来快照均不可见”的版本并回收。判断依据：全局最老活跃事务快照 $X_{old}$，凡 $xmax < X_{old}$ 且已提交/中止的版本可清理。PostgreSQL 的 autovacuum 还会顺带更新统计信息与回收空间。

## 三、形式化与数学基础
可回收条件：
$$ \text{dead}(v) \iff xmax(v) < X_{old} \ \text{and}\ xmax(v) \text{ 已提交或中止} $$
其中 $X_{old}$ 为当前最老活跃事务/快照的边界。膨胀比：
$$ B = \frac{Size_{live} + Size_{dead}}{Size_{live}} $$
维护目标：$B \to 1^+$。

## 四、代码实现
```c
// 简化真空：清理不再可见的版本（仅示意）
void vacuum(Version* head, txn_t x_old) {
    Version** pp = &head;
    while (*pp) {
        Version* v = *pp;
        if (v->xmax != INF && v->xmax < x_old && committed_or_aborted(v->xmax)) {
            *pp = v->next;   // 从版本链摘除并释放
            free(v);
        } else {
            pp = &v->next;
        }
    }
}
```

## 五、与其他技术对比
PostgreSQL 行级 vacuum 兼做统计；MySQL InnoDB 靠 undo 链 + purge 线程回收；RocksDB 靠 compaction 合并版本。延迟回收会放大读代价。

## 六、常见误区
1) 认为 MVCC 无空间代价——版本堆积即膨胀。
2) 长事务阻碍 vacuum——其快照使大量版本“仍可见”。
3) 误以为 vacuum 会锁表——现代为在线渐进。

## 七、与开源书/权威来源对应
- Vonng/ddia 第 7 章。
- Kleppmann《Designing Data-Intensive Applications》第 7 章。
- cmu-db/15445-course（版本管理）。

## 八、面试题
1) 什么版本可安全回收？
2) 为什么长事务会拖慢 vacuum？
3) vacuum 与 analyze 的区别？

## 九、演进与趋势
增量 vacuum、基于可见性映射（VM）的快速跳过、面向 HTAP 的版本生命周期管理。

## 十、小结
GC/Vacuum 是 MVCC 的“清道夫”：及时回收死版本以维持性能与空间，核心判据是最老活跃快照边界。
