# P-Tuning 与 Prompt Tuning 对比

> 对应 Liu et al., *P-Tuning*, 2021、Lester et al., *Prompt Tuning*, 2021 与 Li & Liang, *Prefix-Tuning*, 2021。

## 一、背景与挑战

传统「提示工程」依赖人类编写的自然语言模板（硬提示），质量高度依赖经验和试错，且无法在连续空间寻优。如何让模型「自己学会」最优提示？soft-prompt 系列方法应运而生：把提示表示为可训练的连续向量，与离散 token 嵌入处于同一空间，通过反向传播直接优化。P-Tuning、Prompt Tuning 与 P-Tuning v2 是其中代表，旨在以极少参数激活大模型的少样本能力。

## 二、核心原理

- **P-Tuning**（Liu et al., 2021）：用一个可训练的小编码器（如 LSTM/MLP，称为 Prompt Encoder）生成连续的提示嵌入，再拼接到输入离散嵌入之前，仅优化编码器参数。
- **Prompt Tuning**（Lester et al., 2021）：最为简洁，直接把软提示 $P\in\mathbb{R}^{k\times d}$ 作为可优化参数，不经过编码器，所有训练信号直接落到这 $k$ 个向量上。
- **Prefix Tuning**（Li & Liang, 2021）：把可训练前缀施加在**每一层**注意力的键/值上，而非仅输入嵌入层。
- **P-Tuning v2**：将提示加到每一层（接近 Prefix 的思路），使小模型也能获得稳定收益。

## 三、形式化与数学基础

设输入序列嵌入为 $X\in\mathbb{R}^{n\times d}$，软提示为 $P\in\mathbb{R}^{k\times d}$。Prompt Tuning 把输入变为拼接：

$$
\tilde X = [P;\, X] \in \mathbb{R}^{(k+n)\times d}
$$

训练目标仍为自回归似然，仅优化 $P$：

$$
\mathcal{L} = -\sum_{t} \log p_\theta(x_t \mid [\tilde X]_{<t};\ \theta_{\text{frozen}},\ P_{\text{trainable}})
$$

P-Tuning 中 $P = \text{Encoder}_\phi(\text{pseudo\_tokens})$，优化的是 $\phi$ 而非直接优化 $P$。Prefix Tuning 则在每层 $l$ 维护前缀 $P^{(l)} = [P_K^{(l)}; P_V^{(l)}]$，注意力计算时将其并入键与值。

## 四、代码实现

```python
from peft import PromptTuningConfig, get_peft_model, TaskType

cfg = PromptTuningConfig(
    task_type=TaskType.CAUSAL_LM,
    prompt_tuning_init="TEXT",
    prompt_tuning_init_text="把下面的句子分类为正面或负面：",
    num_virtual_tokens=20,
    tokenizer_name_or_path="meta-llama/Llama-2-7b",
)
model = get_peft_model(base, cfg)
model.print_trainable_parameters()   # 仅软提示可训练
```

## 五、与其他技术对比

| 方法 | 提示生成方式 | 作用层 | 小模型表现 | 可训练参数量 |
|------|--------------|--------|------------|--------------|
| P-Tuning | 编码器生成 | 输入嵌入 | 一般 | 编码器参数 |
| Prompt Tuning | 直接优化向量 | 输入嵌入 | 需大模型才接近全参数 | $k\times d$ 极小 |
| Prefix Tuning | 直接优化 | 每层 K/V | 较好 | 每层前缀 |
| P-Tuning v2 | 直接优化 | 所有层 | 好 | 多层前缀 |

## 六、常见误区

- 认为软提示「可读」：软提示是连续不可解释的嵌入，不能直接当自然语言使用。
- 在小模型上直接用 Prompt Tuning 期望媲美全参数：Lester et al. 指出需足够大模型（如 10B+）才接近全参数效果。
- 软提示长度 $k$ 越大越好：过长易过拟合且挤占有效上下文。
- 把 P-Tuning 与 Prefix Tuning 混为一谈：前者提示只在输入层、后者贯穿各层注意力。

## 七、与开源书·权威来源对应

- Liu et al., *GPT Understands, Too*（P-Tuning）, 2021（arXiv:2103.10385）。
- Lester et al., *The Power of Scale for Parameter-Efficient Prompt Tuning*, 2021（arXiv:2104.08691）。
- Li & Liang, *Prefix-Tuning: Optimizing Continuous Prompts*, 2021（arXiv:2101.00190）。
- Hugging Face PEFT 文档：https://github.com/huggingface/peft

## 八、面试题

- 为何大模型下 Prompt Tuning 才接近全参数效果，小模型却不行？
- P-Tuning 的 Prompt Encoder 起什么作用？去掉它会变成哪种方法？
- 软提示与硬提示（自然语言模板）的本质区别是什么？
- Prefix Tuning 与 P-Tuning v2 有何联系？

## 九、演进与趋势

从 P-Tuning 的编码器思路，到 Prompt Tuning 的极简直优，再到 P-Tuning v2 / Prefix 的多层施加，软提示方法逐步逼近 Adapter 的精度同时保留「零主干改动」优势。后续工作探索提示初始化（TEXT 初始化）、提示重参数化与多任务提示共享。以官方最新文档为准。

**实践要点：**

- 软提示长度 $k$ 建议从 10~20 起步网格搜索；过长易过拟合且挤占有效上下文，过短表达力不足。
- 用任务相关自然语言做 TEXT 初始化软提示，常比随机初始化收敛更快、更稳定。
- 推理时软提示作为前缀拼入输入，新增的 $k$ 个位置会带来轻微延迟，批量时可接受。
- 多任务场景下可为每个任务维护独立软提示，共享主干，实现低成本任务隔离与切换。

## 十、小结

P-Tuning 与 Prompt Tuning 用连续可训练提示以极小代价激活大模型能力；选型上大模型优先 Prompt Tuning，追求跨层控制力则用 Prefix/P-Tuning v2。
