# AutoML 总览

> 对应 d2l-zh；Hutter et al., *AutoML Book*, 2019；Feurer & Hutter, 2019 综述。

## 一、背景与挑战

机器学习 pipeline 含大量人工决策（特征/模型/超参），能否自动化？

## 二、核心原理

AutoML 自动完成：**超参优化（HPO）**、**特征工程**、**模型选择**、甚至**架构搜索（NAS）**与**联合优化**。目标是给定数据与资源，自动产出高性能模型，降低 ML 门槛。

## 三、关键要点

- HPO 是核心最成熟模块。
- 需平衡搜索成本与收益。

## 四、代码实现

```python
from optuna import create_study
study.optimize(objective, n_trials=100)
```

## 五、与其他对比

| 模块 | 自动化程度 |
|------|------------|
| HPO | 高 |
| 特征 | 中 |
| 架构 | 中 |

## 六、常见误区

- AutoML 替代数据科学家——仍需问题定义。

## 七、与开源书对应

- Hutter et al., 2019.
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 八、面试题

- AutoML 主要含哪些模块？

## 九、演进

HPO → 特征自动化 → NAS 联合。

## 十、小结

让 ML，自动起来。
