# 哈希连接HashJoin

> 对应 Garcia-Molina《Database Systems: The Complete Book》第 14 章（Hash Join），以及 cmu-db/15445-course（hash join lecture）。

## 一、背景与挑战
在内存充足时，哈希连接通常在等值连接上比 SMJ/NLJ 更快：一侧建哈希表，另一侧探测。难点在内存不足时的分区（grace hash join）与倾斜处理。

## 二、核心原理
- 构建阶段：选较小表为构建输入，按连接键哈希建内存哈希表。
- 探测阶段：扫描另一表，对每行哈希后在表中找匹配。
- 内存不足：两表按同一哈希函数分区到磁盘，再对每对分区做内存 hash join（grace）。

## 三、形式化与数学基础
理想内存代价：
$$ Cost = |R| + |S| \quad (\text{构建+探测各扫一遍}) $$
Grace 分区（k 个分区）：
$$ Cost = 3(|R|+|S|) \quad (\text{写+读两表+探测}) $$
平均探测：
$$ probes = |S|,\quad bucket\_collision \propto \frac{|R|}{Buckets} $$

## 四、代码实现
```c
// 内存哈希连接（仅示意）
void hash_join(Row* R, int nR, Row* S, int nS) {
    HashTab h = build(R, nR);            // 小表建哈希表
    for (int i = 0; i < nS; i++) {       // 大表探测
        for (Row* m = h.lookup(S[i].k); m; m = m->next)
            if (m->k == S[i].k) emit(m, &S[i]);
    }
}
```

## 五、与其他技术对比
Hash Join 在等值连接且内存足时通常最快；SMJ 适合已排序/范围；NLJ 适合索引探查。倾斜键会让某桶过大，需特殊处理（如广播倾斜键）。

## 六、常见误区
1) 构建表选错——应选小表建哈希。
2) 忽视倾斜导致某桶退化成链表。
3) 内存不足未分区——OOM 或疯狂 spill。

## 七、与开源书/权威来源对应
- Garcia-Molina《Database Systems: The Complete Book》第 14 章。
- cmu-db/15445-course（hash join）。
- Vonng/ddia 第 3 章。

## 八、面试题
1) 为什么构建表选小表？
2) Grace Hash Join 何时触发？
3) 如何处理连接键倾斜？

## 九、演进与趋势
Radix/矢量哈希、GPU 哈希连接、自适应倾斜缓解、与向量化执行融合。

## 十、小结
Hash Join 以“构建+探测”在等值连接上高效，分区与倾斜处理决定其在大数据下的成败。
