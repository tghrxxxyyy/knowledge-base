# AutoML 零代码实践

> 见「自动化机器学习深入/AutoML总览」；Auto-Sklearn/FLAML/TPOT 等。

## 一、背景与挑战

让非专家也能训好模型。

## 二、核心原理

封装数据清洗、特征、模型、调参成黑盒：`auto_ml.fit(X,y)` 内部跑元学习（用历史任务初始化）+ 搜索，返回最优 pipeline。Auto-Sklearn 用元学习+贝叶斯；FLAML 轻量快速；TPOT 用遗传编程。

## 三、关键要点

- 元学习加速冷启动。
- 计算预算需设上限。

## 四、代码实现

```python
from flaml import AutoML
aml = AutoML(); aml.fit(X, y, task="classification", time_budget=60)
```

## 五、与其他对比

- 手写 pipeline 灵活；AutoML 省心。

## 六、常见误区

- 零代码即零干预——问题定义仍须人。

## 七、与开源书对应

- d2l-zh: https://github.com/d2l-ai/d2l-zh
- AutoML 工具文档。

## 八、面试题

- AutoML 如何用元学习加速？

## 九、演进

手工 → 库封装 → 元学习驱动。

## 十、小结

AutoML，把 ML 变「傻瓜」。
