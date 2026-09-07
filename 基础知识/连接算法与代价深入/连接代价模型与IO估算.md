# 连接代价模型与IO估算

> 对应 Garcia-Molina《Database Systems: The Complete Book》第 14、16 章（代价估算），以及 cmu-db/15445-course（cost model lecture）。

## 一、背景与挑战
优化器需在多种连接算法/顺序中选最小代价。代价模型以页 IO 与元组数、选择率、缓冲大小为输入，估算每种计划的成本。

## 二、核心原理
代价以“随机 IO 数 + 顺序 IO 数 × 权重”计量。关键输入：表基数 $|R|$、页数 $P_R$、选择率 $\sigma$、连接结果大小（由连接选择性估计）。统计信息（直方图、Min/Max、NDV）支撑估计质量。

## 三、形式化与数学基础
选择率与结果估计：
$$ |R \bowtie_{R.a=S.b} S| \approx |R| \cdot |S| \cdot \frac{1}{\max(NDV(R.a), NDV(S.b))} $$
IO 代价（以 Hash Join 为例）：
$$ Cost \approx P_R + P_S + spill\_factor $$
页数估算：
$$ P = \lceil |R| \cdot row\_size / page\_size \rceil $$

## 四、代码实现
```python
# 连接结果基数估计（仅示意）
def estimate_join_card(R, S, ndv_a, ndv_b):
    sel = 1.0 / max(ndv_a, ndv_b)     # 连接选择性
    return R.card * S.card * sel
```

## 五、与其他技术对比
基于规则的优化（RBO）不估代价；基于代价的优化（CBO）依赖统计。统计过期会导致错选算法/顺序，需定期 ANALYZE。

## 六、常见误区
1) 认为优化器永远选最优——依赖统计准确性。
2) 忽略缓冲命中降低真实 IO。
3) 误以为行数即代价——页 IO 更关键。

## 七、与开源书/权威来源对应
- Garcia-Molina《Database Systems: The Complete Book》第 16 章。
- cmu-db/15445-course（cost-based optimization）。
- Vonng/ddia 第 3 章。

## 八、面试题
1) 连接结果基数如何估算？
2) 为什么统计信息重要？
3) 代价模型主要输入？

## 九、演进与趋势
机器学习代价估计、动态采样、自适应重优化。

## 十、小结
代价模型把“算法/顺序选择”转化为可比较的数字，其准确依赖统计与选择率估计。
