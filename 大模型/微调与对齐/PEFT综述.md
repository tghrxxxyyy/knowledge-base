# PEFT 参数高效微调综述

> 对应 llm-course「Model Fine-tuning / PEFT」与 Hugging Face PEFT 库。

## 一、背景与挑战

预训练大模型参数规模从亿级到千亿级，全参数微调（Full FT）需要为每任务保存一份完整权重，显存占用随参数量线性增长。典型痛点有四：其一，优化器状态（Adam 的动量、方差）与梯度使训练显存约为推理的 12–16 倍；其二，每任务一份全量权重，多任务服务存储爆炸；其三，小数据上全参数微调易过拟合与灾难性遗忘；其四，跨任务切换需要重新加载权重，延迟高。PEFT 的目标是用极少的可训练参数达到接近全参数微调的效果，使单卡也能微调大模型、单基座可挂多适配器。

## 二、核心原理

PEFT 的核心观察来自「内在低维假设」：Aghajanyan et al.(2020) 指出大模型在任务适配时其权重变动存在于一个极低的子空间中，因此无需改动全部参数。PEFT 冻结主干，仅训练注入的少量参数 $\Delta\theta$，满足 $|\Delta\theta| \ll |\theta|$。主流路线分为四类：

- **Adapter 类**：在 Transformer 子层后插入瓶颈 MLP，仅训练这些小模块。
- **低秩类**：以 LoRA / QLoRA 用低秩矩阵表示权重增量。
- **软提示类**：Prompt Tuning、Prefix Tuning、P-Tuning 在输入或各层注入可学习连续向量。
- **激活缩放类**：(IA)³ 仅学习缩放激活的向量，参数量极小。

## 三、形式化与数学基础

设基座参数 $\theta_0$ 冻结，引入可训练增量 $\Delta\theta$。全参数微调即 $\theta = \theta_0 + \Delta\theta$ 全量更新；PEFT 限制 $\Delta\theta$ 为结构化稀疏。

**LoRA**：对权重矩阵 $W \in \mathbb{R}^{d\times k}$ 做低秩分解

$$
W = W_0 + \Delta W = W_0 + B A,\quad B\in\mathbb{R}^{d\times r},\ A\in\mathbb{R}^{r\times k},\ r\ll \min(d,k)
$$

前向输出为 $h = W_0 x + B A x$。可训练参数仅 $r(d+k)$，当 $r=8, d=4096$ 时占比约 $0.4\%$。

**Adapter**：瓶颈变换 $h = W_{up}\,\sigma\!\left(W_{down}\,\text{LayerNorm}(x)\right) + x$，其中 $W_{down}: d\to b,\ W_{up}: b\to d,\ b\ll d$（如 $b=64$）。

**Prompt Tuning**：输入拼接软提示 $P\in\mathbb{R}^{k\times d}$，前向变为 $h = f_\theta([P; x])$。

## 四、代码实现

```python
from peft import LoraConfig, get_peft_model, TaskType

cfg = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=8, lora_alpha=16, lora_dropout=0.05,
    target_modules=["q_proj", "v_proj"],
    bias="none",
)
model = get_peft_model(base_model, cfg)
model.print_trainable_parameters()   # 约 0.x% 可训练
```

```python
# 推理前合并低秩增量，消除额外延迟
merged = model.merge_and_unload()
```

## 五、与其他技术对比

| 方法 | 训练参数占比 | 推理额外延迟 | 是否需要参考模型 | 典型场景 |
|------|--------------|--------------|------------------|----------|
| 全参数 FT | 100% | 无 | 无 | 数据充足、分布差异大 |
| Adapter | ~1–3% | 串行有延迟 | 无 | 多任务、抗遗忘 |
| LoRA | ~0.1–1% | 可合并消除 | 无 | 通用首选 |
| Prefix/Prompt | <1% | 序列变长 | 无 | 大模型少样本 |
| (IA)³ | 极小 | 无 | 无 | 轻量激活缩放 |

## 六、常见误区

- 认为 PEFT 永远弱于全参数 FT：多数下游任务差距可忽略，仅在极大专属数据集上略逊。
- 盲目增大秩 $r$：低秩假设下过大 $r$ 易过拟合且背离 PEFT 初衷。
- 忽略 `target_modules`：只改 FFN 或只改注意力层影响不同，需按模型结构选择。
- 多任务切换未显式 `unload`：适配器叠加会互相污染输出。
- 把软提示当作自然语言模板：软提示是连续不可解读的嵌入，不等于可写提示词。

## 七、与开源书·权威来源对应

- mlabonne/llm-course「PEFT」：https://github.com/mlabonne/llm-course
- Hugging Face PEFT：https://github.com/huggingface/peft
- Hu et al., *LoRA: Low-Rank Adaptation*, 2021；Houlsby et al., *Adapter*, 2019；Lester et al., *Prompt Tuning*, 2021；Dettmers et al., *QLoRA*, 2023。

## 八、面试题

- PEFT 相比全参数微调的核心优势？为何大模型尤其适合 PEFT？
- LoRA 的秩 $r$ 如何选取？过大有何风险？
- Adapter 与 LoRA 的本质区别？推理延迟差异的来源是什么？
- 软提示（soft prompt）与硬提示（自然语言模板）有何区别？

## 九、演进与趋势

从 Adapter(2019) 到 Prompt/Prefix(2021)，再到 LoRA(2021)、QLoRA(2023)，后续出现 LoRA+、DoRA、VeRA、RS-LoRA 等改进，重点在更省显存、可合并零延迟、多适配器组合与联邦式微调。研究方向还延伸到稀疏化、混合精度适配与自动化目标模块搜索。具体最新方法以官方最新文档为准。

**实践要点：**

- 选型顺序建议：先 LoRA（通用首选），需零延迟合并用 LoRA+合并，多任务隔离用软提示，抗遗忘用 Adapter。
- 多适配器可合并或路由：静态合并用模型融合，动态路由用 MoE 式适配器选择。
- 训练稳定性：LoRA 的 $\alpha/r$ 比值影响等效学习率，常取 $\alpha=2r$ 附近再微调。
- 评测时区分「可训练参数占比」与「实际效果」，避免为极致省参数牺牲任务表现。

## 十、小结

PEFT 以极低可训练比例复用单一基座，是工程落地与多任务服务的事实标准；选型应综合数据规模、推理延迟与显存约束，在 LoRA 与 Adapter 之间按任务权衡。
