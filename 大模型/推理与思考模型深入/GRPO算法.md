# GRPO 算法

> 对应 DeepSeekMath / DeepSeek-R1 使用的策略优化。

## 一、核心概念

GRPO(Group Relative Policy Optimization) 是 PPO 的简化变体：对每个 prompt 采样一组回答，用组内相对奖励(均值/标准差归一化)代替独立价值网络(critic)，降低训练成本。

```
advantage_i = (r_i - mean(r_group)) / std(r_group)
```

无需训练 value model，显存与稳定性更优，是大模型 RLHF/推理 RL 的常用选择。

## 二、关键要点

| vs PPO | GRPO |
|--------|------|
| 需 critic | 不需 |
| 显存高 | 较低 |
| 组内归一 | 是 |

## 三、面试题

- GRPO 为何不需要价值网络？
