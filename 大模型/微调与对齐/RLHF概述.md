# RLHF 概述：从人类反馈强化学习

> 对应 llm-course「RLHF」、InstructGPT(Ouyang et al., 2022) 与 d2l-zh 强化学习章节。

## 一、核心概念

RLHF(Reinforcement Learning from Human Feedback) 把「人类偏好」转化为奖励信号，使模型输出更符合人类意图。三步流程：

1. **SFT**：监督微调得到初始策略 `π_SFT`。
2. **奖励模型(RM)**：用人类对比标注（回答 A 优于 B）训练 `r_φ(x,y)`。
3. **强化学习(PPO)**：用 RM 作奖励优化策略，同时用 KL 惩罚约束不偏离 `π_SFT` 太远。

## 二、数学形式（PPO 目标）

```
max_π  E_{x~D, y~π} [ r_φ(x,y) - β · KL(π(y|x) ‖ π_SFT(y|x)) ]
```

`β` 控制与参考模型的偏离度，防止奖励黑客(reward hacking)。

## 三、关键要点

| 阶段 | 产出 |
|------|------|
| SFT | 基础对话模型 |
| RM | 偏好打分器 |
| PPO | 对齐策略 |

## 四、常见误区

- 认为 RLHF 直接优化「正确性」——它优化的是「人类标注者偏好」，可能偏差。
- 忽视 KL 惩罚导致语言退化（重复、乱码）。

## 五、与开源书的对应

- Ouyang et al., *InstructGPT*, 2022.
- llm-course「RLHF」：https://github.com/mlabonne/llm-course
- d2l-zh 强化学习：https://zh.d2l.ai/chapter_reinforcement-learning/index.html

## 七、面试题

- RLHF 三阶段分别解决什么问题？
- KL 惩罚项的作用是什么？
