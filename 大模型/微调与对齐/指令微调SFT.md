# 指令微调 SFT

> 对应 rasbt/LLMs-from-scratch 第 7 章「Instruction Fine-Tuning」与 llm-course「Instruction fine-tuning」。

## 一、背景与挑战

预训练模型通过海量语料学会了语言统计规律，但输出并不遵循「指令-回答」的交互范式。直接用它回答问题，往往答非所问或延续续写。SFT（Supervised Fine-Tuning，监督微调）用「指令-输入-回答」配对数据继续训练，使模型学会「用户给指令、模型按格式回复」的对话行为，是「基础模型 → 指令模型」的关键一步，也是后续 RLHF/DPO 对齐的起点。

## 二、核心原理

SFT 本质上仍是自回归语言建模，但训练数据与损失计算方式被改造：

- **数据形态**：单轮可用 `{"instruction":..., "input":..., "output":...}`，多轮则组织为 system/user/assistant 角色交替的对话模板。
- **损失遮蔽（loss mask）**：仅在回答（assistant）部分的 token 上计算交叉熵，提示（prompt/system/instruction）部分不反向传播，避免模型去「学习」用户的指令文本。
- **模板一致性**：训练所用对话模板必须与推理部署时完全一致，否则分布偏移导致退化。

## 三、形式化与数学基础

给定样本 $(x_{\text{prompt}}, y_{\text{answer}})$，SFT 目标为仅在回答 token 上的负对数似然：

$$
\mathcal{L}_{\text{SFT}} = -\sum_{t\in \text{answer}} \log p_\theta\!\left(x_t \mid x_{<t};\ \theta\right)
$$

实现上用标签掩码：把提示位置的标签设为 $-100$（PyTorch/Transformers 会忽略该位置损失）：

$$
\ell_t = \begin{cases} -\log p_\theta(x_t\mid x_{<t}), & t\in\text{answer} \\ 0, & t\notin\text{answer} \end{cases}
$$

## 四、代码实现

```python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained("base-model")
tok = AutoTokenizer.from_pretrained("base-model")

# 构造 input_ids 与 labels，prompt 部分标 -100
inputs = tok(prompt + answer, return_tensors="pt")
labels = inputs["input_ids"].clone()
labels[0, :len(tok(prompt, return_tensors="pt")["input_ids"][0])] = -100

outputs = model(**inputs, labels=labels)
loss = outputs.loss          # 仅回答部分参与
loss.backward()
```

## 五、与其他技术对比

| 维度 | 预训练 | SFT | 对齐（RLHF/DPO） |
|------|--------|-----|------------------|
| 数据 | 无标注语料 | 指令-回答对 | 偏好对 |
| 目标 | 续写似然 | 指令遵循 | 人类偏好 |
| 损失范围 | 全序列 | 仅回答 | 成对对比 |
| 阶段位置 | 最先 | 中间 | 最后 |

## 六、常见误区

- 忘记 loss mask：提示 token 也参与反向传播，模型会把「用户问句」当作要模仿的目标，指令被「学歪」。
- 训练模板与推理模板不一致：部署时角色/分隔符不同，模型输出格式崩坏。
- 数据量误区：以为必须百万级；实际上数千到数万条高质量指令即可显著改善指令遵循。
- 只堆数量忽视多样性：单一来源数据导致过拟合某类句式。

## 七、与开源书·权威来源对应

- rasbt/LLMs-from-scratch Ch.7：https://github.com/rasbt/LLMs-from-scratch
- llm-course「Instruction fine-tuning」：https://github.com/mlabonne/llm-course
- 经典数据集：Stanford Alpaca（self-instruct）、ShareGPT、WizardLM 演化指令。

## 八、面试题

- SFT 中为何要对 prompt 部分做 loss mask？不做会怎样？
- SFT 数据规模大致多少能见效？质量与数量如何权衡？
- SFT 与预训练在目标函数上的本质区别？
- 为什么训练与推理模板必须一致？

## 九、演进与趋势

SFT 从早期 Alpaca 自指令，演进到多轮对话 SFT、长上下文 SFT、以及「拒绝采样 + SFT」作为对齐的优选阶段（如 Llama-2/3 流程）。当前趋势是更强调数据质量筛选（如用奖励模型或强模型蒸馏优选回答）与课程式分阶段 SFT。以官方最新文档为准。

**实践要点：**

- 数据构建可用「强模型蒸馏」生成多样化回答，再经人工或规则筛选，比纯自指令质量更高。
- 多轮对话 SFT 需对每一轮 assistant 内容做 loss mask，仅最后/全部 assistant 轮参与损失，视目标而定。
- 系统提示（system prompt）应纳入训练模板，使模型在推理时即便无显式 system 也能保持风格。
- 训练后建议用「保留集困惑度 + 人工抽样」双检，防止过拟合某种句式模板。

## 十、小结

SFT 是把预训练知识「激活」为可用对话能力的桥梁，核心在于高质量数据、正确的 loss mask 与模板一致性；它是现代大模型训练流程中不可或缺的一环。
