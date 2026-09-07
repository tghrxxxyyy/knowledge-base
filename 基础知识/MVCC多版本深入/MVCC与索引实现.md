# MVCC与索引实现

> 对应 cmu-db/15445-course（MVCC 索引/版本存储 lecture），以及 Kleppmann《Designing Data-Intensive Applications》第 7 章。

## 一、背景与挑战
MVCC 让同一逻辑行有多个版本，索引如何指向版本成为难题：索引项是指向“最新版本”还是“版本链头”？这直接影响点查、范围查与回收的复杂度。

## 二、核心原理
两种主流方案：
- 索引指向版本链头（PostgreSQL 堆表+索引引用堆元组，HOT 优化同页更新免建新索引项）。
- 索引直接存版本（如 VoltDB/某些 LSM 引擎把版本链放在索引内）。
InnoDB 采用聚簇索引 + undo 回滚构造旧版本；二级索引通过回表判断可见性。

## 三、形式化与数学基础
索引查找 + 可见性验证开销：
$$ Cost = O(\log Index) + O(chain\_len) $$
HOT（Heap Only Tuple）使同页更新不新增索引项：
$$ k_{index\_entries} \ \text{不随同页更新增长} $$
版本链长为 $c$ 时，最坏可见性扫描 $O(c)$。

## 四、代码实现
```c
// 索引命中后回堆验证可见性（仅示意）
Tuple* index_lookup(Index* ix, Key k, txn_t snap) {
    RID rid = ix->find(k);                 // 索引指向堆位置
    Version* v = heap_chain(rid);
    return find_visible(v, snap);          // 沿版本链找可见版本
}
```

## 五、与其他技术对比
堆表+索引引用方案索引稳定但需回表；索引内嵌版本省回表但索引膨胀、回收难。LSM 二级索引还需处理墓碑与版本。

## 六、常见误区
1) 认为索引能直接看到“正确版本”——常需回表验证。
2) 忽略二级索引的可见性延迟。
3) 误以为 MVCC 不影响索引结构——它深刻影响。

## 七、与开源书/权威来源对应
- cmu-db/15445-course（MVCC 与索引）。
- Kleppmann《Designing Data-Intensive Applications》第 7 章。
- Vonng/ddia 第 7 章。

## 八、面试题
1) 为什么 PostgreSQL 索引指向堆而非版本？
2) HOT 优化解决什么？
3) 二级索引如何保证 MVCC 可见性？

## 九、演进与趋势
多版本索引（如 PostgreSQL 的 zheap/undo 化）、LSM 上 MVCC 索引、HTAP 行列共享版本。

## 十、小结
MVCC 与索引耦合紧密：索引指向策略决定回表成本与回收难度，是存储引擎设计的核心权衡。
