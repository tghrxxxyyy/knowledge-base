# 归一化位置 Pre-Norm vs Post-Norm

> 对应 Xiong et al., *On Layer Normalization in the Transformer Architecture* (ICML 2020)；Ba et al. LayerNorm 原始工作；GPT-2/3（Pre-Norm）、原始 Transformer（Post-Norm）、以及大模型训练稳定性相关讨论；见「Transformer深入/PreNorm和PostNorm对比」的深化实操版。深层 Transformer 能否训起来的第一道门闩。

## 一、背景与挑战

Transformer 残差块里的 LayerNorm 可以放在子层**之前**（Pre-Norm）或**之后**（Post-Norm）：

```text
Post-Norm:  x ← LN(x + F(x))
Pre-Norm:   x ← x + F(LN(x))
```

原论文是 Post-Norm；GPT 系与绝大多数现代大模型是 Pre-Norm。表面只是 LN 位置，实质影响：

1. **梯度尺度随深度**：Post-Norm 无 warmup 时，深层梯度易发散或消失，训练早期 loss spike；
2. **有效学习率**：Pre-Norm 残差主路径未被 LN 缩放，更深网络更「像宽 ResNet」，优化更稳；
3. **表达上限**：有工作认为 Post-Norm 理论表达略强，但难训抵消优势；
4. **初始化与 warmup 敏感度**：Post-Norm 强依赖 warmup 与精细 $\eta$，Pre-Norm 对大 batch 长程预训练更宽容。

大模型把「能否稳定训 10B+」放在「最后 0.1% 评测分」之前，因此 Pre-Norm（及其变体 Pre-RMSNorm）成为默认。

## 二、核心原理

### 2.1 梯度流对比

考虑恒等残差：Pre-Norm 时输出对输入的雅可比含有近似 $\prod (I + \partial F/\partial x)$ 的结构，**主路径是恒等映射**，LN 只作用在分支输入，梯度可沿残差直通。Post-Norm 把 LN 夹在残差输出上，深度 $L$ 后信号方差经历 $L$ 次归一化再缩放，早期参数小/大时梯度统计剧烈，需要 warmup 把「有效步长」从很小爬升。

Xiong et al. 的分析：Post-Norm 在线性化假设下，梯度范数随深度的上界依赖初始化尺度与 LN 参数，不当初始化导致前向/反向爆炸；Pre-Norm 的残差路径把这一风险大幅压低。

### 2.2 变体家族

| 名称 | 形式 | 代表 |
| --- | --- | --- |
| Post-LN | $\mathrm{LN}(x+F(x))$ | 原始 Transformer |
| Pre-LN | $x+F(\mathrm{LN}(x))$ | GPT-2/3、多数 LLM |
| DeepNorm | 残差缩放 $\alpha$ + LN 调整 | DeepNet（很深时） |
| Sandwich-Norm | 分支前后都 LN | 部分视觉/稳定化尝试 |
| Pre-RMSNorm | 无均值中心化的 RMS 归一化 | LLaMA 系（更省） |

RMSNorm 去掉减均值，只除 RMS，数值稳且算得快，成为 Llama/Qwen 等标配，可视为 Pre-Norm 精神的精简实现。

### 2.3 工程默认

- 预训练大模型：**Pre-LN / Pre-RMSNorm** + warmup + 余弦衰减 + grad clip；
- 从零训深 Transformer 且坚持 Post-LN：必须充分 warmup、小心初始化，收益不明显；
- 微调已预训练权重：**不要改 LN 位置**，否则分布错位。

## 三、形式化与数学基础

Pre-Norm 块（忽略偏置）：

$$ x_{l+1}=x_l+F\big(\mathrm{LN}(x_l);\theta_l\big) $$

残差展开：

$$ x_L=x_0+\sum_{l=0}^{L-1}F(\mathrm{LN}(x_l);\theta_l) $$

输出对 $x_0$ 的导数含单位阵 $\partial x_L/\partial x_0 = I + \sum(\cdots)$，信息与梯度都有直达通路。

Post-Norm：

$$ x_{l+1}=\mathrm{LN}\big(x_l+F(x_l;\theta_l)\big) $$

展开后是 **$L$ 层 LN 的复合**，没有干净的恒等主路径；小扰动经多层 LN 的统计变换后，有效步长对初始化/学习率极敏感。

LN 本身（对特征维）：

$$ \mathrm{LN}(x)=\gamma\odot\frac{x-\mu}{\sqrt{\sigma^2+\epsilon}}+\beta $$

Pre 与 Post 改变的是 **$F$ 看到的输入分布**与 **残差流上是否叠 LN**，二者对优化几何的影响完全不同。

## 四、代码实现

```python
import torch
import torch.nn as nn

class PreNormBlock(nn.Module):
    def __init__(self, d, f):
        super().__init__()
        self.ln = nn.LayerNorm(d)   # 或 RMSNorm
        self.f = f
    def forward(self, x):
        return x + self.f(self.ln(x))

class PostNormBlock(nn.Module):
    def __init__(self, d, f):
        super().__init__()
        self.ln = nn.LayerNorm(d)
        self.f = f
    def forward(self, x):
        return self.ln(x + self.f(x))

# RMSNorm（LLaMA 风格）
class RMSNorm(nn.Module):
    def __init__(self, d, eps=1e-6):
        super().__init__()
        self.w = nn.Parameter(torch.ones(d))
        self.eps = eps
    def forward(self, x):
        var = x.float().pow(2).mean(-1, keepdim=True)
        x = x * torch.rsqrt(var + self.eps)
        return (self.w.float() * x).type_as(self.w)
```

排障：深层从零训练发散 → 先检查是否误用 Post-Norm、warmup 是否过短、初始化是否过大；改 LN 位置前后对比 gradient norm 与 loss 方差即可复现差异。

## 五、与其他技术对比

| 策略 | 稳定性 | 表达/上限 | 实现复杂度 | 大模型采用 |
| --- | --- | --- | --- | --- |
| Pre-LN | 好 | 够用 | 低 | **主流** |
| Post-LN | 差（需 warmup） | 理论略强 | 低 | 少 |
| DeepNorm | 很深时稳 | 可扩展深度 | 中 | 特定深度网络 |
| 无 LN + 更强正则 | 不稳 | 变差 | — | 不采用 |

与 **学习率 warmup**：Post-Norm 更依赖 warmup；Pre-Norm 仍建议 warmup，但容忍更短。与 **Zero Init 输出投影**：与 Pre-Norm 叠加可让深层初始为恒等，进一步稳。

## 六、常见误区

1. **位置随便选，代码能跑就行**——从零深网时 Post-Norm 可能直接训崩，不只是分差。
2. **Post-Norm 一定更好看指标**——上限优势在难训面前通常不成立。
3. **微调时可以「改进」成 Pre-Norm**——权重分布绑定原结构，乱改等于换模型。
4. **LN 与 BN 类似可互换**——LN 沿特征归一、BN 沿 batch，序列模型几乎不用 BN。
5. **Pre-Norm 免 warmup**——大 batch/大学习率仍建议 warmup + clip。

## 七、与开源书·权威来源对应

- Ba et al., *Layer Normalization*。
- Xiong et al., ICML 2020（Pre/Post 数值与优化分析）。
- GPT-2/3、LLaMA、PaLM 等报告中的架构小节。
- d2l-zh Transformer 章节；《Deep Learning》归一化相关。
- DeepNet（DeepNorm）论文。

## 八、面试题

**1. 为何大模型偏好 Pre-Norm？**  
要点：残差主路径无 LN 缩放，梯度直通、深层训练稳、对初始化与 warmup 更宽容；Post-Norm 理论表达略强但难训，工程上不划算。

**2. 写出 Pre/Post 公式并说明梯度差异。**  
要点：Pre 是 $x+F(LN(x))$，展开有恒等和；Post 是 $LN(x+F(x))$，$L$ 次归一化复合，梯度尺度更敏感。

**3. RMSNorm 与 LayerNorm 差别？**  
要点：RMSNorm 仅除均方根、不减均值，参数更少、更快，LLaMA 系常用，仍放在 Pre 位置。

**4. 什么时候会考虑 Post-Norm 或 DeepNorm？**  
要点：复现原论文、极深网络用 DeepNorm 类缩放、或研究初始化-归一化交互时；生产大模型默认 Pre。

**5. 如何实验验证 LN 位置的影响？**  
要点：同数据同超参，只改 LN 位置，画 train loss 与 grad norm 曲线；Post 无 warmup 更易爆，Pre 更平滑。

## 九、演进与趋势

- **Pre-RMSNorm 成为默认**：减计算、稳数值，与 SwiGLU、RoPE 组成现代 LLM「架构套餐」。
- **归一化与并行**：张量并行下 LN 统计的同步与序列并行归一化是实现细节热点。
- **更少归一化**：部分工作探索 QK-Norm、无 bias、更深无 LN 残差，目标是减融合 kernel 开销。
- **稳定性工具链**：grad clip、µP 参数化、fused optimizer 与 LN 位置共同构成「训得起来」系统工程。

## 十、小结

Pre-Norm vs Post-Norm 表面是 LN 放哪，深层是**残差流上有没有恒等主路径**。大模型用 Pre-Norm/RMSNorm 换训练稳定性与工程宽容度，几乎放弃 Post-Norm 的理论表达微弱优势。记住公式、梯度流直觉、以及「微调勿改结构」三条，就能解释绝大多数「为什么我的深 Transformer 训不稳」问题。
