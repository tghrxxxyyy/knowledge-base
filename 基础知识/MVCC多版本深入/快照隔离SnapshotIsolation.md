# 快照隔离SnapshotIsolation

> 对应 Berenson et al. 1995, *A Critique of ANSI SQL Isolation Levels*（Snapshot Isolation 形式化），以及 Kleppmann《Designing Data-Intensive Applications》第 7 章。

## 一、背景与挑战
可串行化（Serializability）实现成本高。快照隔离提供“每个事务看到一致性快照”的较弱保证，避免了脏读、不可重复读与幻读，但存在写倾斜（write skew）这一非串行化异常。

## 二、核心原理
事务开始时获得一个快照版本号（如快照的已提交最大事务 ID）。整个事务期间都读该快照，写生成新版本。提交时检查：是否与并发已提交事务写入了“读写冲突”的数据（first-committer-wins），冲突则中止。

## 三、形式化与数学基础
SI 可避免的异常：脏读、丢失更新、不可重复读、幻读。但不能避免写倾斜。冲突检测：
$$ \text{abort if } \exists T' \text{ committed, } T' \text{ wrote a read-by-}T \text{ item} $$
快照读取条件（见上一文档可见性式），事务开始快照：
$$ snap_T = \max\{ xmin(C) \mid C \text{ committed before } T \} $$

## 四、代码实现
```python
# first-committer-wins 提交校验（仅示意）
def commit(txn):
    for item in txn.write_set:
        if item in txn.read_set:
            holder = latest_committer[item]
            if holder and holder != txn and holder.committed_before(txn):
                return ABORT          # 写倾斜/冲突，中止
    return COMMIT
```

## 五、与其他技术对比
Read Committed 每次读最新；Repeatable Read 防不可重复读但实现各异；SI 提供快照但允许写倾斜；Serializable 通过 SSI 或 2PL 杜绝写倾斜。

## 六、常见误区
1) 认为 SI 等于可串行化——写倾斜证明其不等价。
2) 把 SI 当作“无锁”——提交仍需冲突检测。
3) 误以为快照永远一致——仅对启动时刻一致。

## 七、与开源书/权威来源对应
- Berenson et al. 1995（SI 与 ANSI 批判）。
- Kleppmann《Designing Data-Intensive Applications》第 7 章。
- Vonng/ddia 第 7 章。

## 八、面试题
1) SI 能避免哪些异常，不能避免哪个？
2) 什么是写倾斜？举例。
3) first-committer-wins 如何工作？

## 九、演进与趋势
可串行化快照隔离（SSI，PostgreSQL 实现）、基于冲突图的检测、硬件时钟（TS 序）优化。

## 十、小结
SI 以快照换取高并发与无读阻塞，但写倾斜揭示其非串行化；生产常用 SSI 补足正确性。
