# 自然梯度与KL散度

> 对应 Amari 信息几何；KL 散度作为黎曼度量。

## 一、背景与挑战

为何用 KL 而非欧氏距离衡量参数邻域，需要几何解释。

## 二、核心原理

KL 散度在参数空间诱导 Fisher 度量；自然梯度即在该度量下的最速下降方向，等价于极小化带 KL 约束的损失。

## 三、数学形式

局部 $\text{KL}(p_\theta\|p_{\theta+\delta})\approx\frac12\delta^\top G\delta$；自然梯度使 $\delta\propto -G^{-1}\nabla\mathcal L$。

## 四、代码实现

```python
# 等价约束优化：min <g,δ> s.t. δᵀGδ ≤ ε
delta = - (2*eps / (g@ng)) ** 0.5 * ng
```

## 五、与其他对比

- 与 权重衰减深入 的 KL 约束（如 RLHF）同思想。
- 与 二阶优化深入 视角不同（KL vs loss）。

## 六、常见误区

- 混淆 KL 方向（对称破缺）。
- 以为小 KL 即小参数距离，二者无关。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 自然梯度为何联系 KL？答：KL 局部 Hessian 即 Fisher，自然梯度是在 KL 度量下的最速下降。

## 九、演进

KL 度量 → Fisher → 自然梯度算法。

## 十、小结

KL 度量为自然梯度提供几何基础，统一了二阶与分布视角。
