# ORPO 与对齐新范式

> 对应 Hong et al., *ORPO*, 2024，及近期免奖励对齐方法综述。

## 一、核心概念

**ORPO(Odds Ratio Preference Optimization)** 在 SFT 损失上**叠加一个偏好正则项**，无需参考模型、无需奖励模型、单阶段完成对齐：

```
L_ORPO = L_SFT + λ · L_OR
L_OR = - log σ( log( odd_ratio(y_w) / odd_ratio(y_l) ) )
odd_ratio(y) = π_θ(y|x) / (1 - π_θ(y|x))
```

相比 DPO，ORPO 不依赖冻结参考模型，参训更稳定、更省资源。

## 二、关键要点

| 方法 | 参考模型 | 阶段 |
|------|----------|------|
| PPO | 需要 | 多 |
| DPO | 需要 | 单 |
| ORPO | 不需要 | 单(SFT融合) |

## 三、与开源书的对应

- Hong et al., *ORPO: Monolithic Preference Optimization without Reference Model*, 2024.

## 七、面试题

- ORPO 相比 DPO 去掉了什么？带来什么好处？
