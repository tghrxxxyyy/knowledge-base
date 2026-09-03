# AutoML 与大模型

> 见「自动化机器学习深入/AutoML总览」与「大模型工程落地」；大模型时代的 AutoML 转向。

## 一、背景与挑战

大模型训练贵，调参/数据配比自动化价值高。

## 二、核心原理

AutoML 用于：超参（LR 调度/批大小/权重衰减）自动搜、数据配比优化（DoReMi）、提示/指令自动搜索、适配器配置搜索。训练一次成本极高，故多保真度与早停尤为重要。

## 三、关键要点

- 大模型 AutoML 重在省训练成本。
- 数据配比/课程是新兴热点。

## 四、代码实现

```python
# 自动搜最优数据混合权重
weights = search(doremi_objective)
```

## 五、与其他对比

- 小模型 AutoML 调架构；大模型调配方。

## 六、常见误区

- AutoML 只调小模型——大模型也需。

## 七、与开源书对应

- Xie et al., DoReMi, 2023.
- llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- 大模型时代 AutoML 关注什么？

## 九、演进

架构 AutoML → 配方 AutoML → 提示 AutoML。

## 十、小结

大模型，也需「自动调」。
