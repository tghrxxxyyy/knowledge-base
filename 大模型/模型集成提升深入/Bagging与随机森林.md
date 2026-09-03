# Bagging 与随机森林

> 见「模型集成提升深入/集成学习总览」；Breiman, *Random Forests*, 2001。

## 一、背景与挑战

决策树易过拟合、不稳定。

## 二、核心原理

Bagging 对训练集自助采样（bootstrap）训练多树，预测平均/投票。随机森林额外在每节点随机选特征子集，增强多样性，显著降低方差、抗过拟合。

## 三、数学形式

`f = (1/M)Σ f_m`，f_m 为第 m 棵树的预测。

## 四、代码实现

```python
from sklearn.ensemble import RandomForestClassifier
rf = RandomForestClassifier(n_estimators=200)
```

## 五、关键要点

- 特征随机性增多样。
- 树数足够即可，无需剪太多。

## 六、与其他对比

- 单树不稳；RF 稳。

## 七、常见误区

- RF 不会过拟合——极端树数仍略过拟合。

## 八、与开源书对应

- Breiman, 2001.
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 九、面试题

- 随机森林为何随机选特征？

## 十、演进

Bagging → RF → 极端随机树。

## 十一、小结

乱中取胜，平均即稳。
