# Boosting 方法

> 见「模型集成提升深入/集成学习总览」；Freund & Schapire, *AdaBoost*, 1997；Chen & Guestrin, *XGBoost*, 2016。

## 一、背景与挑战

弱分类器（略优于随机）如何变强？

## 二、核心原理

Boosting 串行：每轮提高前轮错分样本权重，训练新弱学习器聚焦难例，最终加权组合。GBM 用梯度下降方式逐步加树拟合残差；XGBoost/LightGBM 加了二阶导、正则与工程优化，成为表格数据 SOTA。

## 三、数学形式

加法模型：`F_m = F_{m-1} + η·h_m`，h_m 拟合负梯度（残差）。

## 四、代码实现

```python
import xgboost as xgb
bst = xgb.train({"eta":0.1}, dtrain, num_boost_round=100)
```

## 五、关键要点

- 对学习率 η 敏感。
- 表格数据常优于深度学习。

## 六、与其他对比

- Bagging 并行；Boosting 串行聚焦难例。

## 七、常见误区

- Boosting 必过拟合——有正则可控。

## 八、与开源书对应

- Chen & Guestrin, 2016.
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 九、面试题

- GBDT 如何拟合残差？

## 十、演进

AdaBoost → GBDT → XGBoost/LightGBM。

## 十一、小结

聚焦难例，逐个击破。
