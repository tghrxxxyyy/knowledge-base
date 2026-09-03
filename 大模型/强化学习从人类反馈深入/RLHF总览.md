# 强化学习从人类反馈（RLHF）总览

> 对应 Christie et al., *Deep RL from Human Preferences*, 2017；Ouyang et al., *InstructGPT*, 2022。

## 一、背景与挑战

仅靠预训/SFT 难对齐人类意图与价值观；RLHF 用人类偏好作奖励微调策略。

## 二、核心原理

三阶段：1) SFT 监督；2) 训奖励模型 RM（Bradley-Terry）；3) 用 PPO 强化策略最大化奖励并 KL 约束参考模型。

## 三、数学形式

目标 $\max_\pi \mathbb E_{x\sim D,y\sim\pi}[r_\phi(x,y)] - \beta\, KL(\pi(\cdot|x)\|\pi_{ref}(\cdot|x))$。

## 四、代码实现

```python
from trl import PPOTrainer
ppo = PPOTrainer(model=model, ref_model=ref, reward_model=rm, tokenizer=tok)
```

## 五、与其他对比

- 与 直接偏好优化深入（DPO 简化）对照。
- 与 奖励模型深入 / 过程监督与结果监督深入 衔接。

## 六、常见误区

- 误以为 RLHF 仅 PPO；整套含 SFT+RM。
- 忽视 KL 致奖励黑客。

## 七、与开源书对应

- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 问：RLHF 三阶段？答：SFT 监督 → 训奖励模型 → PPO 强化并 KL 约束参考。

## 九、演进

手工奖励 → 偏好 RM → PPO 对齐 → DPO 简化。

## 十、小结

RLHF 以人类偏好对齐模型，是 InstructGPT/ChatGPT 的核心。
