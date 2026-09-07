# DORA指标与交付效能

> 对应 Kim et al. 2016 (Accelerate / The DevOps Handbook)。

## 一、背景与挑战
"团队效率高不高"常被主观感受主导，缺乏可比较、可改进的量化标准，改进无从下手。

## 二、核心原理
DORA 用四个关键指标衡量交付效能：部署频率、变更前置时间、变更失败率、服务恢复时间（MTTR）。高效能团队四项均显著更优。

## 三、形式化与数学基础
指标集合 M = {DF, LT, CFR, MTTR}。效能档位由 M 的分位决定：精英组 DF 按需多次/日，LT < 1 小时，CFR 0-15%，MTTR < 1 小时。

## 四、代码实现
```python
# 从部署与事件系统聚合 DORA
df = count(deploys(last_7d))
lt = median(merged_at - first_commit for pr in prs)
cfr = failed_deploys / total_deploys
mttr = median(resolved_at - opened_at for incidents)
```

## 五、与其他技术对比
相比代码行数等虚荣指标，DORA 聚焦价值流动与稳定性；它是结果指标而非过程指标。

## 六、常见误区
- 用个人产量（提交数）代替团队交付效能。
- 只看频率不顾失败率，高频但脆弱。

## 七、与开源书/权威来源对应
Accelerate (2016) 通过多年实证研究建立了 DORA 指标体系。

## 八、面试题
为什么 DORA 选这四个指标？前置时间与周期时间的区别？

## 九、演进与趋势
DORA 四象限细化为更多维度（如可靠性），并与 SLO 结合。

## 十、小结
DORA 用四项客观指标把"效能"从感性讨论变为可度量、可改进的工程主题。
