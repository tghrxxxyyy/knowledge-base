# 因果追踪与ROME定点编辑

> 对应 Meng et al., *ROME*, NeurIPS 2022；Geva et al., EMNLP 2021（FFN 键值视角）。

## 一、背景与挑战

若中间层前馈是键值记忆，就应能通过一次秩一更新把「某主体某关系」的值改写为新对象，且不影响其他键的读出。

## 二、核心原理

ROME 分两步：先用因果追踪确定目标层，再在该层前馈第二层权重上做闭式秩一更新。

- 键 $k^\ast$ 取主体最后一个 token 在该层的输入表示，值 $v^\ast$ 通过优化使新对象概率最大。
- 更新在协方差白化空间内进行，使改动对其他键的干扰最小化，从而保住局部性。

## 三、数学形式

$$W'=W+\frac{(v^\ast-Wk^\ast)\,(C^{-1}k^\ast)^{\top}}{(C^{-1}k^\ast)^{\top}k^\ast},\qquad C=\mathbb{E}\big[kk^{\top}\big]$$

该式是带约束最小二乘的闭式解：在满足 $W'k^\ast=v^\ast$ 的同时最小化 $\lVert W'-W\rVert$ 的白化范数。

## 四、代码实现

```python
import torch
def rome_update(W, k_star, v_star, C_inv):
    u = C_inv @ k_star
    denom = float(u @ k_star)
    return W + torch.outer(v_star - W @ k_star, u) / denom
W = torch.randn(64, 128); k = torch.randn(128); v = torch.randn(64)
print(rome_update(W, k, v, torch.eye(128)).shape)
```

## 五、与其他对比

- 与微调对照：秩一闭式更新无需梯度多步，速度快且可精确控制被满足的约束。
- 与 批量编辑MEMIT 衔接：MEMIT 把同一思路扩展到多事实多层的联合求解。

## 六、常见误区

- 认为编辑成功即知识被正确重写；等价问法与多跳推理常未同步更新。
- 忽略 $C$ 的估计质量；协方差样本不足会导致局部性显著变差。

## 七、与开源书对应

- rasbt/LLMs-from-scratch（MLP 权重形状与前向路径）：https://github.com/rasbt/LLMs-from-scratch
- d2l-zh（最小二乘与线性代数基础）：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- ROME 的秩一更新解决什么优化问题？答：在满足新键值映射约束下最小化白化范数的权重改动。
- 为什么要用协方差逆？答：把更新方向投到低冲突子空间，降低对其他键读出的干扰。

## 九、演进

FFN 键值假说 → 因果追踪定层 → 秩一闭式编辑 → 批量与序列编辑扩展。

## 十、小结

ROME 把「知识在 FFN 里」这一假说变成可执行的闭式编辑，是定位与干预结合的范例。
