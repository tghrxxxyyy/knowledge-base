# RLHF 中的 RL

> 见「强化学习基础深入/PPO原理」与「微调与对齐/RLHF概述」。

## 一、背景与挑战

如何用奖励模型指导 LLM 生成？

## 二、核心原理

奖励模型给偏好分，PPO 优化策略使生成得分高；加 KL 惩罚防偏离 SFT 太远。

## 三、数学形式

```
max E[r(x,y)] - β KL(π_θ || π_ref)
```

## 四、代码实现

```python
reward = rm(prompt, gen) - beta*kl; ppo_step(policy, reward)
```

## 五、关键要点

- KL 防 reward hacking。
- 奖励模型缺陷被利用。

## 六、与其他对比

- 普通 RL 无参考约束。

## 七、常见误区

- 奖励越高越好——可能 hack。

## 八、与开源书对应

- Ouyang et al., *InstructGPT*, 2022.
- rasbt/LLMs-from-scratch: https://github.com/rasbt/LLMs-from-scratch

## 九、面试题

- 为何 RLHF 要 KL 惩罚？

## 十、演进

PPO → GRPO(无 critic) → 奖励模型新范式。

## 十一、小结

RLHF 把偏好变奖励信号。
