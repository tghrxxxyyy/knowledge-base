# 嵌套循环连接NLJ

> 对应 Garcia-Molina《Database Systems: The Complete Book》第 14 章（join algorithms），以及 cmu-db/15445-course（join algorithms lecture）。

## 一、背景与挑战
连接是查询中最昂贵的操作之一。嵌套循环连接（NLJ）思想最简单：对驱动表每行，去探查被驱动表匹配行，适合小表驱动大表或已有索引的场景。

## 二、核心原理
- 朴素 NLJ：双重循环，对外表每行扫描内表全表，$O(|R|\cdot|S|)$。
- 索引 NLJ（INLJ）：若内表连接键有索引，探查变为索引查找，复杂度降为 $O(|R| \cdot \log|S|)$。
- 块 NLJ：按块批量探查，减少内表扫描次数。

## 三、形式化与数学基础
朴素代价（以页为单位，缓冲 $B$）：
$$ Cost = |R| + |R| \cdot |S| \quad (\text{无索引}) $$
索引 NLJ：
$$ Cost = |R| + |R| \cdot (h + 1) $$
其中 $h$ 为内表索引高度。块 NLJ：
$$ Cost \approx |R| + \lceil |R|/B_R \rceil \cdot |S| $$

## 四、代码实现
```c
// 索引嵌套循环连接（仅示意）
void index_nlj(Table* R, Index* idxS, S_Table* S) {
    for (Row* r = R->first(); r; r = r->next()) {      // 驱动 R
        for (Row* s = idxS->lookup(r->join_key); s; s = s->next_match())
            emit(r, s);                                // 索引探查 S
    }
}
```

## 五、与其他技术对比
NLJ 在小表/有索引时高效；大表无索引时远慢于 Hash/SMJ。INLJ 是 OLTP 中点查连接的常用方式。

## 六、常见误区
1) 认为 NLJ 总是最慢——有索引时很优。
2) 选错驱动表——应小表驱动。
3) 忽略缓冲对块 NLJ 的影响。

## 七、与开源书/权威来源对应
- Garcia-Molina《Database Systems: The Complete Book》第 14 章。
- cmu-db/15445-course（join algorithms）。
- Vonng/ddia 第 3 章。

## 八、面试题
1) 为什么索引 NLJ 比朴素 NLJ 快？
2) 如何选驱动表？
3) 块 NLJ 优化点？

## 九、演进与趋势
批量 INLJ、向量化 NLJ、与缓存友好的探查顺序。

## 十、小结
NLJ 的优劣取决于内表是否有索引与驱动表大小；INLJ 是 OLTP 连接的基石。
