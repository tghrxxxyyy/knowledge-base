# LLaMA 架构要点

> 对应 Touvron et al., *LLaMA: Open and Efficient Foundation Language Models*, 2023（arXiv:2302.13971）及 LLaMA-2（2023）。属模型架构演进板块，作为现代开源 LLM 的参考架构。

## 一、背景与挑战

GPT-3 级别模型多闭源、且训练/推理成本高。LLaMA 的目标是以**更小算力训练出更强基础模型**，并把架构「工程化到极致」，成为开源社区的参照模板。它在标准 decoder-only Transformer 上做了一系列已被研究证明有益的微改：归一化改用 RMSNorm、位置编码改用 RoPE、FFN 改用 SwiGLU、并引入分组查询注意力（GQA）省 KV。挑战：如何在「不引入新不稳定因素」的前提下，把这些组件稳妥组合。

## 二、核心原理

LLaMA 相对原始 Transformer 的改动可概括为「四处优化」：
1. **Pre-Norm + RMSNorm**：去掉均值中心化的 LayerNorm，仅做均方根缩放，计算更省、数值更稳。
2. **RoPE（旋转位置编码）**：用旋转矩阵把位置信息注入注意力，天然支持相对位置与长外推。
3. **SwiGLU FFN**：门控前馈（见本板块 SwiGLU 文档）。
4. **GQA（分组查询注意力）**：把多个查询头共享少量 KV 头，显著降低长上下文下的 KV 内存与显存带宽压力。

这些改动彼此正交，组合后在不牺牲质量的前提下提升训练效率与推理吞吐，使 7B–70B 模型可在相对有限算力下复现。

## 三、形式化与数学基础

层结构（Pre-Norm 残差）逐层：

$$
x_{l+1}=x_l + \text{SwiGLU}\big(\text{RMSNorm}(x_l + \text{Attn}_{\text{RoPE}}(\text{RMSNorm}(x_l)))\big)
$$

RMSNorm（无偏置、无均值）：

$$
\text{RMSNorm}(x)=\frac{x}{\sqrt{\frac{1}{d}\sum_i x_i^2+\epsilon}}\,\gamma
$$

RoPE 对查询/键做旋转：

$$
q_m = R_{\Theta,m}\, W_q x_m,\quad k_n = R_{\Theta,n}\, W_k x_n
$$

注意力得分含相对位置信息：$q_m^\top k_n = (R_m q)^\top(R_n k) = q^\top R_{n-m} k$。GQA 令 KV 头数 $h_{kv}<h_q$，每 $h_q/h_{kv}$ 个查询共享一组 KV，KV 缓存降为原来的 $h_{kv}/h_q$。

## 四、代码实现（核心块）

```python
class LLaMABlock(nn.Module):
    def __init__(self, d, n_head, n_kv, d_ff):
        super().__init__()
        self.attn = nn.MultiheadAttention(d, n_head,
                     num_kv_heads=n_kv)        # GQA：kv 头少于 q 头
        self.ffn  = SwiGLUFFN(d, d_ff)         # 见 SwiGLU 文档
        self.ln1  = RMSNorm(d)
        self.ln2  = RMSNorm(d)

    def forward(self, x):
        h = x + self.attn(self.ln1(x))         # RoPE 在 attn 内施加
        return h + self.ffn(self.ln2(h))
```

## 五、与其他技术对比

| 组件 | 原始 Transformer | LLaMA | 收益 |
|------|-----------------|-------|------|
| 归一化 | LayerNorm(post) | RMSNorm(pre) | 更稳更省 |
| 位置编码 | 绝对嵌入 | RoPE | 长外推好 |
| FFN | ReLU | SwiGLU | 表达更强 |
| 注意力 | MHA | GQA(大模型) | 省 KV |

LLaMA 是「标准组件的择优组合」，而非全新结构。

## 六、常见误区

- 以为 LLaMA 是「全新架构」：实为成熟组件的组合优化。
- 忽略 GQA 对推理显存的关键作用，照搬 MHA 导致长上下文 OOM。
- 把 RMSNorm 当 LayerNorm 直接替换却漏掉 $\gamma$ 缩放，数值失衡。
- 误用绝对位置编码替代 RoPE，损失外推能力。

## 七、与开源书·权威来源对应

- Touvron et al., *LLaMA*, 2023；*Llama-2*, 2023（Meta）。
- 衍生：Mistral（滑窗 + GQA）、Qwen、Yi 等均以 LLaMA 为模板。
- 本知识库「SwiGLU与激活」「架构选型指南」「RetNet」互为补充。

## 八、面试题

- LLaMA 相比原始 Transformer 做了哪些改动？各自解决什么问题？
- RoPE 为何比绝对位置编码更适合长外推？
- GQA 如何降低推理成本？与 MQA 的区别？
- 为何说 LLaMA 是「开源模型的事实模板」？

## 九、演进与趋势

LLaMA 之后，开源模型普遍沿用其模板并做增量：Mistral 引入滑动窗口注意力（SWA）降长序列成本；后续版本普遍标配 GQA 与 RoPE 的 NTK-aware 外推；MoE 化（Mixtral）在 SwiGLU 专家上叠稀疏。架构创新趋于「局部优化」而非颠覆，重点在注意力效率、长上下文与训练数据/配方。LLaMA 的核心遗产是：把一套被验证的组件固化成社区通用蓝图。

## 十、小结

LLaMA 是在标准 decoder-only Transformer 上做的「工程择优组合」：Pre-Norm+RMSNorm、RoPE、SwiGLU、GQA 四处改动分别提升稳定性、长外推、表达力与推理效率。它几乎不引入新结构，却因组合得当成为开源 LLM 的事实模板，后续 Mistral、Qwen、Yi 等皆承其形。理解 LLaMA 即理解了当代开源模型的主流骨架。
