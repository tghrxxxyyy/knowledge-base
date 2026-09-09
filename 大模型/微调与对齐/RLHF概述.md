# RLHF 概述：从人类反馈强化学习

> 对应 llm-course「RLHF」、InstructGPT（Ouyang et al., 2022）与 d2l-zh 强化学习章节。

## 一、背景与挑战

预训练模型学会了「预测下一个 token」，但并不知道人类真正想要什么：同样的提示可能有多种合理回答，其中一些更安全、更有用、更符合指令。监督微调（SFT）只能覆盖标注者写出的标准答案，难以刻画「哪种更好」的细粒度偏好。RLHF（Reinforcement Learning from Human Feedback）的核心思想是：把人类偏好转化为可微或可采样的奖励信号，再用强化学习把策略推向「更符合人类意图」的方向。

## 二、核心原理

RLHF 经典三阶段流程：

1. **SFT（监督微调）**：用高质量示范数据微调，得到初始策略 $\pi_{\text{SFT}}$。
2. **奖励模型 RM**：收集人类对同一提示的成对比较 $(x, y_w, y_l)$（$y_w$ 优于 $y_l$），训练标量奖励 $r_\phi(x,y)$。
3. **强化学习（PPO）**：以 RM 为奖励优化策略，同时用 KL 惩罚约束策略不偏离 $\pi_{\text{SFT}}$ 太远，防止语言退化与奖励黑客。

这三步分别对应「会答题」「会打分」「会优化」。

## 三、形式化与数学基础

RM 训练采用 Bradley–Terry 模型，最大化被选回答得分更高的对数似然：

$$
\mathcal{L}(\phi)=-\mathbb{E}_{(x,y_w,y_l)}\Big[\log\sigma\big(r_\phi(x,y_w)-r_\phi(x,y_l)\big)\Big]
$$

RLHF 的优化目标是在 KL 约束下最大化期望奖励：

$$
\max_{\pi}\ \mathbb{E}_{x\sim\mathcal{D},\,y\sim\pi}\big[r_\phi(x,y)\big] - \beta\, \mathrm{KL}\big(\pi(y\mid x)\,\|\,\pi_{\text{SFT}}(y\mid x)\big)
$$

其中 $\beta$ 控制偏离参考模型的强度，是防塌缩与防奖励黑客的关键超参。

## 四、代码实现

```python
from trl import PPOTrainer, PPOConfig, AutoModelForCausalLMWithValueHead

ppo_cfg = PPOConfig(batch_size=8, learning_rate=1e-6, ppo_epochs=1)
model = AutoModelForCausalLMWithValueHead.from_pretrained("sft-model")
ref_model = AutoModelForCausalLMWithValueHead.from_pretrained("sft-model")
ppo = PPOTrainer(ppo_cfg, model, ref_model, tokenizer)

for query, response in data:
    reward = rm_score(query, response)        # 奖励模型打分
    stats = ppo.step([query], [response], [reward])
```

## 五、与其他技术对比

| 维度 | SFT | RLHF(PPO) | DPO |
|------|-----|-----------|-----|
| 数据形式 | 指令-回答 | 偏好对 + RM | 偏好对 |
| 是否需 RM | 否 | 是 | 否（隐式） |
| 训练阶段 | 单 | 多（SFT→RM→RL） | 单 |
| 稳定性 | 高 | 中（易崩） | 高 |
| 显存/成本 | 低 | 高 | 中 |

## 六、常见误区

- 认为 RLHF 优化「正确性」：它优化的是「人类标注者偏好」，可能放大标注偏差与政治/文化倾向。
- 忽视 KL 惩罚：过小的 $\beta$ 导致奖励黑客（reward hacking），模型用重复、格式化话术骗取高分，语言退化。
- 以为 RM 越准越好：RM 过强时策略会专门「讨好 RM」而非真实有用，称为 RM 过优化。
- 把 PPO 直接套用游戏 RL 超参：LLM 动作空间是 token 离散空间，需专门的回复级采样与价值头。

## 七、与开源书·权威来源对应

- Ouyang et al., *InstructGPT*, 2022（arXiv:2203.02155）。
- llm-course「RLHF」：https://github.com/mlabonne/llm-course
- d2l-zh 强化学习：https://zh.d2l.ai/chapter_reinforcement-learning/index.html
- 经典实现：OpenAI trl / TRL-PPO。

## 八、面试题

- RLHF 三阶段分别解决什么问题？
- KL 惩罚项的作用是什么？$\beta$ 过大或过小各有何后果？
- 什么是奖励黑客（reward hacking）？如何缓解？
- 为什么 DPO 被视为 RLHF 的简化替代？

## 九、演进与趋势

RLHF 自 InstructGPT 定型后成为对齐标配，但训练复杂、成本高。后续出现：DPO/IPO/ORPO 等免 RL 偏好优化、RLHF 中的奖励塑形与长度惩罚、 Constitutional AI 用规则替代人类标注、以及把 RM 与策略联合训练。以官方最新文档为准。

**实践要点：**

- 三阶段可流水线化：SFT、RM、PPO 各阶段独立迭代，RM 与策略可异步刷新。
- 奖励模型过优化是隐形风险，建议用「RM 分数 vs 真实人类胜率」监控偏离。
- 长度惩罚应显式加入奖励，避免策略学会用冗长套话骗取高分。
- 冷启动可用「拒绝采样 + SFT」替代部分 PPO，降低 RL 工程复杂度。

## 十、小结

RLHF 用人类偏好把预训练模型推向「有用且安全」的方向，KL 约束是其稳定核心；尽管流程复杂，它奠定了现代对话大模型的对齐范式，并被更简洁的偏好优化方法持续演进。
