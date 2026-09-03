# SAM算法原理

> 对应 Foret et al., ICLR 2021 的两次前向算法。

## 一、背景与挑战

直接计算内层 max 需二阶信息；SAM 用一阶梯度近似，使额外成本仅一次前向/反向。

## 二、核心原理

先对当前参数求梯度并归一化得到扰动方向，施加扰动后做第二次前向，用扰动点损失反传更新参数。

## 三、数学形式

扰动 $\hat\varepsilon=\rho\frac{g}{\|g\|},\ g=\nabla_\theta\mathcal L(\theta)$；更新 $\theta\leftarrow\theta-\eta\,\nabla_{\theta+\hat\varepsilon}\mathcal L(\theta+\hat\varepsilon)$。

## 四、代码实现

```python
logits = model(x); loss = crit(logits, y)
loss.backward(create_graph=True)
grad = {p: p.grad.clone() for p in params}
for p in params:
    p.data.add_(rho * grad[p] / (grad[p].norm() + 1e-12))
# 第二次前向/反向后恢复并 step
```

## 五、与其他对比

- 与 二阶优化深入 相比，SAM 不显式求 Hessian。
- 与 自适应学习率深入 可叠加（SAM+Adam）。

## 六、常见误区

- 忘记 `create_graph=True` 导致无法二次反传。
- 在 BN 等统计量上施加扰动引发歧义，应只扰动权重。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 为何 SAM 需两次前向？答：一次求扰动方向，一次在扰动点计算更新梯度。

## 九、演进

一次近似 → 多步扰动 → 与锐度谱度量结合。

## 十、小结

SAM 以一阶近似实现极小极大优化，额外成本可控而收益显著。
