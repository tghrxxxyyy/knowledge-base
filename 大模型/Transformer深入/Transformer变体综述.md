# Transformer 变体综述

> 梳理从原始 Transformer 到现代 LLM 架构的演化主线。

## 一、主线演化

1. **原始 Transformer**(2017)：编码器-解码器，正弦编码。
2. **GPT 系列**：仅解码器(decoder-only)，因果注意力，自回归预训练。
3. **BERT**：仅编码器(encoder-only)，双向掩码语言建模。
4. **T5/BART**：编码器-解码器，序列到序列。
5. **现代 LLM**(LLaMA/Qwen/GLM)：decoder-only + Pre-Norm + RoPE + RMSNorm + SwiGLU + 分组查询注意力(GQA)。

## 二、关键架构选择

| 维度 | BERT | GPT/LLaMA |
|------|------|-----------|
| 结构 | encoder-only | decoder-only |
| 注意力 | 双向 | 因果 |
| 任务 | 理解/NLU | 生成/NLG |
| 位置编码 | 可学习绝对 | RoPE |

## 三、面试题

- 为什么当今主流对话大模型几乎都是 decoder-only？
- SwiGLU 相比 ReLU-FFN 有何改进？
