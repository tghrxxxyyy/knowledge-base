# KFAC 优化器

> 对应 Martens & Grosse, *Optimizing Neural Networks with Kronecker-factored Approximate Curvature*, 2015；与 二阶预条件优化器总览深入 衔接。

## 一、背景与挑战

全 Fisher 矩阵过大；KFAC 用 Kronecker 积分解耦各层，使预条件可行。

## 二、核心原理

假设层输入/梯度统计独立，Fisher 近似为 $\widehat F = A\otimes B$，逆可借 Kron 分解高效求得。

## 三、数学形式

$\widehat F^{-1}=A^{-1}\otimes B^{-1}$；更新 $\Delta\theta = -\eta\,\widehat F^{-1}\nabla\mathcal L$。

## 四、代码实现

```python
invA = inv(A); invB = inv(B)
step = lr * kron(invA, invB) @ grad
```

## 五、与其他对比

- 与 Shampoo深入 都做矩阵预条件，KFAC 源于自然梯度/Fisher，Shampoo 源于张量分解。
- 与 自然梯度深入 同源。

## 六、常见误区

- 假设过强致近似偏差，深度网络下累积。
- Fisher 估计滞后，需周期性刷新。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- KFAC 为何高效？答：Kronecker 分解把大 Fisher 逆拆为两个小矩阵逆，复杂度骤降。

## 九、演进

牛顿 → 自然梯度 → KFAC → 近似 KFAC 变体。

## 十、小结

KFAC 借 Kron 分解逼近自然梯度，兼顾二阶信息与计算可行。
