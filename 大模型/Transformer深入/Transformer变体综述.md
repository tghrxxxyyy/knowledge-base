# Transformer 变体综述

> 对应 Vaswani et al. 2017 Attention 与 LLaMA / Qwen 技术报告。

## 一、背景与挑战

自 2017 年原 Transformer 提出后，架构演化出三条主线：仅编码器、仅解码器、编码器-解码器。不同结构适配不同任务（理解 vs 生成 vs 序列到序列）。理解这条演化主线，能帮助我们在选型时厘清「为什么当今对话大模型几乎都是 decoder-only」，以及现代 LLM 在原始架构上做了哪些关键替换。

## 二、核心原理

主演化脉络：

1. **原始 Transformer（2017）**：编码器-解码器，正弦绝对位置编码，Post-Norm。
2. **BERT（2018）**：仅编码器（encoder-only），双向掩码语言建模，擅长 NLU/理解。
3. **GPT 系列**：仅解码器（decoder-only），因果注意力，自回归预训练，擅长生成。
4. **T5 / BART**：编码器-解码器，序列到序列统一框架。
5. **现代 LLM（LLaMA / Qwen / GLM 等）**：decoder-only + Pre-Norm + RoPE + RMSNorm + SwiGLU + 分组查询注意力（GQA）。

现代模型并非简单堆参数，而是把多个「工程更优」的组件组合：更稳的归一化、更好的位置编码、更省显存的前馈与注意力变体。

一个常被追问的点是：为何 decoder-only 最终胜出？原因包括——自回归生成天然契合「预测下一个 token」的预训练目标，训练信号最稠密；结构最简单、最易扩展与并行；且因果注意力避免信息泄漏，配合 RLHF 等后训练更顺。encoder-decoder 在翻译等严格序列映射任务仍有价值，但通用对话场景 decoder-only 收益最高。

## 三、形式化与数学基础

- 因果注意力掩码保证位置 $i$ 只关注 $j \le i$：
  $$
  \text{score}_{ij} = \frac{q_i k_j^\top}{\sqrt{d}} \quad \text{若 } j \le i \text{ 否则 } -\infty
  $$
- SwiGLU 前馈：
  $$
  \text{FFN}(x) = \big(\text{Swish}(xW_1)\odot xW_2\big) W_3,\quad \text{Swish}(z)=z\sigma(z)
  $$
- GQA 把 $h$ 个查询头分组共享 $g$ 组 KV 头（$g \ll h$），在显存与质量间折中。

## 四、代码实现

一个现代 decoder-only 块的极简骨架：

```python
import torch.nn as nn

class ModernBlock(nn.Module):
    def __init__(self, d, n_heads, n_kv, d_ff):
        super().__init__()
        self.norm1 = nn.RMSNorm(d)
        self.attn = nn.MultiheadAttention(d, n_heads,
                                          kv_heads=n_kv)  # GQA
        self.norm2 = nn.RMSNorm(d)
        self.ff = SwiGLU(d, d_ff)
    def forward(self, x, mask):
        x = x + self.attn(self.norm1(x), self.norm1(x),
                          self.norm1(x), attn_mask=mask, is_causal=True)
        x = x + self.ff(self.norm2(x))
        return x
```

## 五、与其他技术对比

| 维度 | BERT | GPT/LLaMA |
|------|------|-----------|
| 结构 | encoder-only | decoder-only |
| 注意力 | 双向 | 因果 |
| 任务 | 理解/NLU | 生成/NLG |
| 位置编码 | 可学习绝对 | RoPE |
| 归一化 | LayerNorm | RMSNorm(Pre) |
| 前馈 | ReLU-FFN | SwiGLU |

## 六、常见误区

- 认为「参数越多越好」而忽视架构组件（RoPE、GQA、SwiGLU）的边际贡献。
- 误以为 BERT 类结构适合做生成；双向注意力会「偷看」未来，不适合自回归。
- 把 encoder-decoder 当成「万能结构」，其实纯生成场景 decoder-only 更简洁高效。

## 七、与开源书·权威来源对应

- Vaswani et al., *Attention Is All You Need*, 2017。
- Devlin et al., *BERT*, 2018；Radford et al., *GPT* 系列。
- Touvron et al., *LLaMA*；Bai et al., *Qwen* 技术报告（现代组件来源）。
- Shazeer, *GLU Variants Improve Transformer*（SwiGLU）。

## 八、面试题

- 为什么当今主流对话大模型几乎都是 decoder-only？
- SwiGLU 相比 ReLU-FFN 有何改进？
- GQA 解决了什么问题，代价是什么？

## 九、演进与趋势

架构创新趋于「局部微调」：更高效的注意力（MQA/GQA）、更省的前馈（SwiGLU/GLU）、更好的位置编码（RoPE 及其外推变体）、混合专家（MoE）稀疏化。未来或在「统一多模态」与「极长上下文」上继续演化。

值得补充的是，现代架构还在朝稀疏化（MoE，仅激活部分专家）与多模态统一（共享编码器/解码器处理文本、图像、音频）方向演进，进一步突破 dense 模型的参数-算力权衡。

## 十、小结

Transformer 变体的主线是「任务驱动的结构选择 + 工程组件的持续替换」。现代 LLM 收敛到 decoder-only，并用 Pre-Norm、RoPE、RMSNorm、SwiGLU、GQA 这套组合在稳定性、显存与质量间取得平衡。
