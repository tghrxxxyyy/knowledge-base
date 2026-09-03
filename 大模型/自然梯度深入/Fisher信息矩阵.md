# Fisher信息矩阵

> 对应 Amari 1998；以及 Martens & Grosse, 2015 对 Fisher 的深度学习使用。

## 一、背景与挑战

自然梯度需 Fisher 矩阵 $G$，其定义与估计是落地的关键。

## 二、核心原理

Fisher 是似然对数梯度的二阶矩，也是 KL 散度的局部 Hessian；对模型 $p_\theta$，矩估计可用样本梯度外积。

## 三、数学形式

$G=\mathbb E_{x\sim p_{data}}\big[\nabla\log p_\theta(x)\nabla\log p_\theta(x)^\top\big]\approx\frac1n\sum\nabla\log p_\theta(x_i)\nabla\log p_\theta(x_i)^\top$。

## 四、代码实现

```python
Fish = (grad.logp @ grad.logp.T) / n   # 经验 Fisher
```

## 五、与其他对比

- 与 二阶优化深入 Hessian 互为近似（在监督下接近）。
- 与 权重衰减深入 都作用于梯度空间。

## 六、常见误区

- 经验 Fisher 与真实 Fisher（含期望于模型分布）有别。
- 小样本估计噪声大需平滑。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Fisher 与 Hessian 关系？答：在指数族/监督设定下 Fisher≈损失 Hessian，但定义来自 KL 度量。

## 九、演进

解析 Fisher → 经验估计 → 块对角/K-FAC。

## 十、小结

Fisher 是自然梯度的度量核心，估计质量决定方向正确性。
