# GradNorm 梯度范数平衡

> 对应 Chen et al., 《GradNorm》, 2018。

## 一、背景与挑战

不同任务梯度范数差异大；需使各任务以相近速率学习。

## 二、核心原理

以任务损失下降速率（相对初始）为目标，动态调任务权重，使各任务梯度范数趋近整体平均。

## 三、数学形式

目标 $\|G_t\|\cdot w_t \propto \mathbb E[\|G\|]\cdot (r_t)^{\alpha}$，$r_t$ 为相对下降率；$w_t$ 由梯度更新。

## 四、代码实现

```python
grad_norm = [g.norm() for g in task_grads]
target = mean_grad * (rel_descent ** alpha)
w = grad_norm / target
```

## 五、与其他对比

- 与 不确定性加权深入（目标不同）对照。
- 与 多任务梯度平衡总览 衔接。

## 六、常见误区

- $\alpha$ 控平衡强度需调。
- 频繁更新权重致抖。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- GradNorm 做什么？答：按各任务相对下降速率调权重，使梯度范数趋于一致、平衡学习速率。

## 九、演进

手工权重 → GradNorm → 结合不确定加权。

## 十、小结

GradNorm 以梯度范数一致化平衡任务学习率，简单有效。
