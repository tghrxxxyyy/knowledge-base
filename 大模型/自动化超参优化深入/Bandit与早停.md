# Bandit与早停（Hyperband/ASHA）

> 对应 Li et al., *Hyperband*, 2017；ASHA 2018。

## 一、背景与挑战

完整训练每配置成本高；需早停差配置把算力留给优者。

## 二、核心原理

资源分配（Successive Halving）：多臂Bandit式逐轮淘汰最差一半，把资源集中优配置。

## 三、数学形式

预算 $R$，最少资源 $r$，淘汰率 $\eta$；并行评估 $n=\lceil\log_\eta(R/r)\rceil$ 轮。

## 四、代码实现

```python
from ray.tune import ASHAScheduler
sched = ASHAScheduler(max_t=100, grace_period=10, reduction_factor=3)
```

## 五、与其他对比

- 比纯贝叶斯更省（靠早停），常与贝叶斯结合（BOHB）。
- 与 训练不稳定诊断深入 共享早停逻辑。

## 六、常见误区

- grace_period 太小误杀慢热配置。
- 忽视随机种子导致早停不稳。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- Hyperband 思想？答：逐轮减半淘汰，资源向优配置集中。

## 九、演进

Random → Successive Halving → Hyperband → ASHA/BOHB。

## 十、小结

Bandit+早停把算力聚焦潜力配置，是大规模 HPO 的性价比之选。
