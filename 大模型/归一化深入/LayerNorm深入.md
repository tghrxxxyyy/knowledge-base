# LayerNorm 深入

> 对应 Ba et al. 2016 *Layer Normalization*；实践参见《动手学深度学习》与 *Attention Is All You Need*（Transformer）相关实现。

## 一、背景与挑战

BatchNorm 依赖 batch 维统计，在序列模型（RNN/Transformer）中存在两难：序列长度可变、batch 常较小，且训练/推理的 batch 结构不一致会让归一化不稳定。LayerNorm（LN）提出对**单个样本的所有特征维度**做归一化，完全与 batch 无关，因而成为 RNN 与 Transformer 的标准配置。它的核心价值是「对任意 batch 大小、任意序列长度都稳定」。

## 二、核心原理

对单个样本的特征向量 $x\in\mathbb{R}^d$，计算该向量自身的均值与方差，标准化后再用可学习 $\gamma,\beta$ 缩放平移：

$$\mu = \frac{1}{d}\sum_{i=1}^d x_i, \qquad \sigma^2 = \frac{1}{d}\sum_{i=1}^d (x_i-\mu)^2$$

$$\hat{x}_i = \frac{x_i-\mu}{\sqrt{\sigma^2+\epsilon}}, \qquad y_i = \gamma_i \hat{x}_i + \beta_i$$

由于统计量来自样本自身，LN 在训练与推理时行为一致，无需维护全局滑动平均，这是它相对 BN 的工程优势。

## 三、形式化与数学基础

LN 对每个样本的整条特征做单位化，使其二阶统计量归一：

$$\mathbb{E}_i[\hat{x}_i] = 0, \quad \mathrm{Var}_i[\hat{x}_i] = 1$$

在 Transformer 中，LN 通常作用于最后一维（特征维，如 `normalized_shape=hidden_dim`）。与 BN 跨样本耦合的梯度不同，LN 的梯度仅在一个样本内部计算，batch 维度彼此独立，因此可天然支持动态 batch 与变长序列（配合 padding mask）。

## 四、代码实现

```python
import torch
import torch.nn as nn

ln = nn.LayerNorm(normalized_shape=512, eps=1e-5)
x = torch.randn(4, 10, 512)        # (batch, seq_len, hidden)
out = ln(x)

# 手写等价实现（沿最后一维）
def layer_norm(x, gamma, beta, eps=1e-5):
    mu = x.mean(-1, keepdim=True)
    var = x.var(-1, keepdim=True, unbiased=False)
    return (x - mu) / torch.sqrt(var + eps) * gamma + beta
```

## 五、与其他技术对比

| 方法 | 归一化维度 | 依赖 batch | 训练/推理一致 | 典型场景 |
|------|------------|------------|---------------|----------|
| BatchNorm | 跨 batch 同通道 | 是 | 否 | CNN |
| LayerNorm | 单样本全特征 | 否 | 是 | Transformer/RNN |
| GroupNorm | 单样本分组 | 否 | 是 | 小 batch CV |

LN 因「与 batch 无关 + 训练推理一致」，成为序列模型首选。

## 六、常见误区

- 误区一：LN 归一化到均值 0 会丢失信息。可学习 $\gamma,\beta$ 恢复了表示容量。
- 误区二：LN 与 BN 只是维度不同。LN 还带来训练/推理一致性与变长友好，对 Transformer 至关重要。
- 误区三：LN 放哪都行。它与残差的位置（Pre/Post-Norm）显著影响深层稳定性，见「归一化位置 Pre-Norm vs Post-Norm」。

## 七、与开源书·权威来源对应

- Ba et al., *Layer Normalization*, 2016.
- Vaswani et al., *Attention Is All You Need*, 2017（Transformer 采用 LN）。
- d2l-zh 归一化章节：https://zh.d2l.ai/

## 八、面试题

- 为何 Transformer 用 LN 而非 BN？从 batch 无关、变长、训练推理一致说明。
- LN 的均值方差来自哪里？为什么推理时不需要滑动平均？
- LN 中 $\gamma,\beta$ 的作用是什么？没有它们会怎样？

## 九、演进与趋势

(1) LN 是 Transformer 的默认归一化，但在大模型中被 RMSNorm 部分取代（见 RMSNorm 深入）。(2) Pre-Norm 成为深层 Transformer 主流放置方式。(3) 出现对 LN 计算效率的优化（融合 kernel）。(4) 在混合架构（如 Mamba、状态空间模型）中 LN 仍被广泛采用。LN 与 RMSNorm 之争本质是「是否保留中心化」的效率权衡。

## 十、小结

LayerNorm 通过对单个样本的全部特征维度归一化，彻底摆脱对 batch 的依赖，并做到训练/推理行为一致，因而成为序列模型与 Transformer 的支柱。它的可学习缩放平移保障了表示容量，而与残差的位置组合（Pre/Post-Norm）进一步决定了深层网络的稳定性。
