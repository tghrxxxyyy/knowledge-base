# 从 Transformer 到 GPT

> 对应 Vaswani et al., *Attention Is All You Need*, 2017（NeurIPS）与 Radford et al., GPT 系列（GPT-1/2/3, 2018–2020）。属模型架构演进板块。

## 一、背景与挑战

2017 年之前，序列建模主力是 RNN/LSTM，其**串行依赖**难以并行、长程梯度易消失。Transformer 用自注意力（self-attention）取代循环，实现全序列并行与任意距离直连。但原始 Transformer 是 encoder-decoder 结构，偏重翻译等「输入—输出」配对任务。GPT 系列的关键决策是：**只保留 decoder-only 的因果结构**，把它推向「通用自回归生成」，并用海量文本预训练。挑战在于：如何既保留注意力的表达力，又让架构易于规模化与高效推理。

## 二、核心原理

GPT 的 decoder-only 结构核心要素：
1. **因果自注意力（causal attention）**：每个位置只能看左侧（含自身），用下三角掩码保证自回归无信息泄漏。
2. **Pre-Norm 残差堆叠**：层归一化（LayerNorm/RMSNorm）放在子层之前，配合残差连接，训练更稳、更深。
3. **位置编码**：原始 GPT 用可学习绝对位置嵌入；后续（GPT-NeoX、LLaMA）改用 RoPE 等相对/旋转编码以支持更长外推。
4. **自回归预训练目标**：标准语言建模 $\max \sum \log P(x_t\mid x_{<t})$。

相比 encoder-decoder，decoder-only 把「理解」与「生成」统一在同一前向过程，且对 KV Cache 极友好（见下述）。

## 三、形式化与数学基础

缩放点积注意力：

$$
\text{Attention}(Q,K,V)=\text{softmax}\!\left(\frac{QK^\top}{\sqrt{d_k}}+M\right)V
$$

其中因果掩码 $M$ 为下三角：$M_{ij}=-\infty$（当 $j>i$），否则 $0$。GPT 的逐 token 目标：

$$
\mathcal{L}_{\text{LM}}=-\sum_{t=1}^{T}\log P_\theta(x_t\mid x_1,\dots,x_{t-1})
$$

解码层（Pre-Norm）可写为：

$$
x_{l+1}=x_l + \text{FFN}\big(\text{Norm}(x_l + \text{Attn}(\text{Norm}(x_l)))\big)
$$

注意力的并行度为序列长度 $T$，复杂度 $O(T^2 d)$，相比 RNN 的 $O(T d^2)$ 更易在长序列上并行。

## 四、代码实现

```python
import torch.nn as nn

class CausalSelfAttention(nn.Module):
    def __init__(self, d_model, n_head):
        super().__init__()
        self.qkv = nn.Linear(d_model, 3*d_model)
        self.proj = nn.Linear(d_model, d_model)
        self.n_head = n_head

    def forward(self, x):
        B, T, D = x.shape
        q, k, v = self.qkv(x).chunk(3, dim=-1)
        q = q.view(B, T, self.n_head, D//self.n_head).transpose(1, 2)
        # 因果掩码：下三角
        scores = (q @ k.transpose(-2, -1)) / (D**0.5)
        scores = scores.masked_fill(
            torch.triu(torch.ones(T, T, dtype=torch.bool), 1), float("-inf"))
        out = (scores.softmax(-1) @ v)
        return self.proj(out.transpose(1, 2).reshape(B, T, D))
```

## 五、与其他技术对比

| 结构 | 注意力 | 并行度 | 生成友好 | 代表 |
|------|--------|--------|---------|------|
| RNN/LSTM | 无 | 低(串行) | 中 | 早期 Seq2Seq |
| Encoder-Decoder | 双向+因果 | 高 | 中 | T5, BART |
| Decoder-only | 因果 | 高 | 强 | GPT, LLaMA |
| Encoder-only | 双向 | 高 | 弱(非生成) | BERT |

decoder-only 因「统一生成范式 + KV Cache 友好」成为当代 LLM 主流。

## 六、常见误区

- 认为「encoder 双向理解更强，所以更适合一切」：生成任务需因果，双向会泄漏未来。
- 忽略因果掩码，导致训练—推理不一致（泄漏）。
- 把绝对位置嵌入当最优，未意识到长外推需 RoPE/ALiBi 等。
- 误以为 GPT 只是「去掉 encoder 的 Transformer」——预训练目标与规模化策略同样关键。

## 七、与开源书·权威来源对应

- Vaswani et al., *Attention Is All You Need*, 2017。
- Radford et al., *Improving Language Understanding by Generative Pre-Training* (GPT-1, 2018)、GPT-2 (2019)、GPT-3 (2020)。
- 本知识库「Transformer深入」「从零实现GPT」提供逐层实现与细节。

## 八、面试题

- GPT 为何选 decoder-only 而非 encoder-decoder？
- 因果掩码的作用是什么？缺失会导致什么？
- 自回归预训练目标与 BERT 的 MLM 有何本质差异？
- decoder-only 为何对 KV Cache 友好？这对推理意味着什么？

## 九、演进与趋势

从 Transformer 到 GPT 的「做减法 + 规模化」路线定义了现代 LLM：后续 LLaMA 用 RoPE/RMSNorm/SwiGLU/GQA 优化细节（见本板块）；GPT-3 证明「few-shot + 规模化」涌现能力；推理模型（o1/R1）在 decoder-only 骨架上叠加「思考 token」。架构层面的演进重点转向注意力效率（FlashAttention、MQA/GQA）、位置编码外推与稀疏化，而「decoder-only 自回归」主干十余年未被撼动。

## 十、小结

GPT 在 Transformer 基础上采取 decoder-only 因果结构，用因果掩码保证自回归、Pre-Norm 堆叠保证深度、语言建模目标统一「理解—生成」，并因对 KV Cache 友好而成为规模化首选。从 Transformer 到 GPT 的关键不是简单删减，而是「架构简化 + 规模化预训练」的工程决策，奠定了此后所有主流开源/闭源 LLM 的骨架。
