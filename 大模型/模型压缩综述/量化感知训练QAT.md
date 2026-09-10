# 量化感知训练 QAT

> 对应 Jacob et al. 2017 量化感知训练与 Bengio 2015  Straight-Through Estimator。

## 一、背景与挑战

当 PTQ 在低比特（如 4-bit 及以下）下精度损失过大，或目标硬件对量化误差极敏感时，需要让模型在训练阶段就「看见」量化误差，主动调整权重以适应低比特表示——这就是量化感知训练（Quantization-Aware Training, QAT）。它在前向传播中插入「伪量化（fake quant）」节点，模拟量化—反量化的舍入与截断，使反向传播照常进行、权重逐步移动到对量化更鲁棒的区域。代价是 QAT 需要训练数据、算力与时间，成本远高于 PTQ，因此适用边界是「PTQ 不够、又必须低比特」的场景。

## 二、核心原理

QAT 的核心是「前向模拟、反向直通」。前向时，对权重 $W$ 与激活 $a$ 先量化再反量化：

$$\tilde W = s_W(q_W),\quad \tilde a = s_a(q_a)$$

其中 $q = \text{quant}(x; s)$ 为量化到整数再反量化回浮点。模型用 $\tilde W,\tilde a$ 计算损失，从而把量化误差纳入梯度。反向时，由于量化（取整、clamp）几乎处处不可导，使用直通估计器（Straight-Through Estimator, STE）令梯度「跳过」量化节点：

$$\frac{\partial \mathcal{L}}{\partial x} \approx \frac{\partial \mathcal{L}}{\partial \tilde x}$$

即把对 $\tilde x$ 的梯度直接赋给 $x$，使权重在训练中朝「落在量化网格附近」的方向更新，最终量化后权重本就贴近量化格点，精度损失更小。

## 三、形式化与数学基础

伪量化算子：

$$Q(x; s, b) = s \cdot \text{clip}\left(\left\lfloor\frac{x}{s}\right\rceil, -2^{b-1}, 2^{b-1}-1\right)$$

STE 的反向定义为：

$$\frac{\partial Q}{\partial x} = \mathbf{1}\left[-2^{b-1} \le \frac{x}{s} \le 2^{b-1}-1\right]$$

（区间内梯度为 1，越界为 0，近似不可导点）。训练目标在量化约束下最小化损失：

$$\min_\theta \mathcal{L}(Q(W;\theta), Q(a))$$

由于权重已适配网格，部署时直接取整即可，避免 PTQ 的舍入冲击。

## 四、代码实现

```python
import torch, torch.nn as nn

class FakeQuant(nn.Module):
    def __init__(self, bits=4):
        super().__init__(); self.bits = bits
        self.register_buffer("scale", torch.tensor(1.0))

    def forward(self, x):
        qmax = 2 ** self.bits - 1
        # 对称量化示意
        self.scale = x.abs().max() / (qmax / 2)
        q = (x / self.scale).round().clamp(-qmax//2, qmax//2)
        return q * self.scale   # 反量化，梯度经 STE 直通

class QATLinear(nn.Linear):
    def __init__(self, in_f, out_f, bits=4):
        super().__init__(in_f, out_f)
        self.wq = FakeQuant(bits)

    def forward(self, x):
        return nn.functional.linear(self.wq(self.weight), x)  # 简化示意
```

## 五、与其他技术对比

| vs PTQ | 精度 | 成本 | 数据 |
|--------|------|------|------|
| PTQ | 中/高 | 低 | 少量标定 |
| QAT | 高 | 高 | 全训练 |

QAT 以训练成本换取更低比特下的精度上限。

## 六、常见误区

- 以为 QAT 总是优于 PTQ：若 PTQ 已满足精度，QAT 的成本是浪费。
- 忽略 STE 的梯度误差：STE 是近似，极端学习率下可能不稳定。
- 量化范围不更新：scale 应在训练中随分布调整，固定会拖累。
- 只在权重做 QAT：激活量化同样关键，尤其长尾激活。

## 七、与开源书·权威来源对应

- Jacob et al., *Quantization and Training of Neural Networks with Low Precision* (2017) 提出 QAT 与伪量化。
- Bengio et al., *Estimating or Propagating Gradients Through Stochastic Neurons* (2013/2015) 提供 STE 思想。
- HuggingFace transformers / torch.ao 提供 QAT 工具，以官方最新文档为准。

## 八、面试题

1. QAT 为何通常比 PTQ 精度高？
2. 什么是伪量化（fake quant）？为何前向插入它？
3. STE 解决了量化的什么可微性问题？
4. 何时该用 QAT 而非 PTQ？

## 九、演进与趋势

- 从「全模型 QAT」走向「仅敏感层 QAT + 其余 PTQ」的混合策略，降成本。
- 结合 LSQ（可学习 scale）让量化参数随训练联合优化。
- QAT 与蒸馏结合，用大模型做教师补偿低比特损失。

## 十、小结

QAT 通过在前向插入伪量化、反向用 STE 直通，让模型在训练中适应低比特网格，从而以更高的训练成本换取比 PTQ 更优的精度下限。适用场景是 PTQ 无法满足的低比特或高敏感部署，实践中常只对敏感层做 QAT 以平衡成本。
