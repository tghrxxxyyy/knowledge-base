# RMSNorm

> 对应 Zhang & Sennrich, *Root Mean Square Layer Normalization*, 2019（用于 T5）；被 LLaMA 等广泛采用。

## 一、背景与挑战

标准 LayerNorm 需计算均值与方差两步，且有平移参数；能否更省计算又保持稳定？

## 二、核心原理

RMSNorm 去掉均值中心化，仅用均方根（RMS）缩放：对每样本用 $1/RMS(x)$ 归一，再乘以可学习缩放 $\gamma$。省去减均值，计算更轻，且在 LLM 中表现良好。

## 三、数学形式

$RMS(x)=\sqrt{\frac1H\sum_j x_j^2+\epsilon}$；$\hat x_i = \frac{x_i}{RMS(x)}\cdot \gamma_i$。无 $\beta$ 偏移项。

## 四、代码实现

```python
class RMSNorm(nn.Module):
    def __init__(self, d, eps=1e-6): self.g = nn.Parameter(torch.ones(d)); self.eps=eps
    def forward(self, x):
        r = x.pow(2).mean(-1, keepdim=True).add(self.eps).sqrt()
        return x / r * self.g
```

## 五、与其他对比

- 与 LayerNorm 相比省去减均值，速度更快、参数更少（无 $\beta$）。
- 与 Pre-LN 配合成为现代 LLM 主流归一方式。

## 六、常见误区

- 误以为 RMSNorm 等价 LayerNorm；它不做中心化，分布形态不同。
- 漏加 $\epsilon$ 致零向量除零。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- RMSNorm 相比 LayerNorm 优势？答：省去均值中心化，计算更轻、参数更少，且 LLM 中表现好。

## 九、演进

LayerNorm → RMSNorm(T5) → LLaMA 等大规模采用。

## 十、小结

RMSNorm 以更简的统计量换取效率，已成为现代大模型默认归一方案。
