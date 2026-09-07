# MVCC基本原理与版本链

> 对应 Reed 1978, *Concurrency Control by Validation*（多版本思想），以及 Berenson et al. 1995, *A Critique of ANSI SQL Isolation Levels*。

## 一、背景与挑战
传统锁并发下读会阻塞写、写会阻塞读。MVCC（多版本并发控制）通过为数据保存多个版本，使读访问某一历史快照、写生成新版本，从而读写互不阻塞，大幅提升并发度。

## 二、核心原理
每行/记录维护版本链：每个版本带创建事务 ID（xmin）与删除事务 ID（xmax，未删除则为 ∞）。读事务依据自身快照的可见性规则沿版本链找到对自己可见的版本。写则追加新版本并链接到链头。

## 三、形式化与数学基础
可见性基本式（简化）：
$$ \text{visible}(v, T) \iff xmin(v) < T_{snapshot} \ \text{and}\ (xmax(v) = \infty \ \text{or}\ xmax(v) > T_{snapshot}) $$
版本链按 xmin 降序排列，查找为链表遍历：
$$ v_0 \to v_1 \to \dots \to v_n $$

## 四、代码实现
```c
// 沿版本链找可见版本（仅示意）
Version* find_visible(Version* head, txn_t snap) {
    for (Version* v = head; v; v = v->next) {
        if (v->xmin < snap && (v->xmax == INF || v->xmax > snap))
            return v;                 // 该版本对快照 snap 可见
    }
    return NULL;
}
```

## 五、与其他技术对比
纯锁并发读写互斥；MVCC 读写不阻塞但需版本管理与清理。OCC（乐观并发）在提交时校验，适合低冲突；MVCC 更适合读多写少。

## 六、常见误区
1) 认为 MVCC 完全无锁——写写仍需锁/冲突检测。
2) 忽略版本膨胀——无 GC 会无限增长。
3) 误以为快照总是最新——取决于隔离级别。

## 七、与开源书/权威来源对应
- Reed 1978（多版本并发控制）。
- Berenson et al. 1995（ANSI 隔离级别批判）。
- Vonng/ddia 第 7 章（事务隔离与 MVCC）。

## 八、面试题
1) MVCC 如何实现读写不阻塞？
2) xmin/xmax 的作用？
3) 版本链过长会有什么问题？

## 九、演进与趋势
多版本索引（如 PostgreSQL HOT）、undo 版 MVCC（MySQL）、基于时间旅行的版本检索、与 HTAP 行列混存结合。

## 十、小结
MVCC 用“版本链 + 快照可见性”解耦读写，是如今年化并发的默认选择，代价是版本管理与回收。
