# PPO 算法详解

> 对应 InstructGPT 与 Schulman et al., *PPO*, 2017。

## 一、核心概念

PPO(Proximal Policy Optimization) 是 RLHF 最常用的优化器，通过**裁剪(clip)**限制策略更新幅度，稳定训练：

```
L_CLIP = E[ min( r_t(θ) Â_t,  clip(r_t(θ), 1-ε, 1+ε) Â_t ) ]
r_t(θ) = π_θ(a_t|s_t) / π_θ_old(a_t|s_t)
```

`Â_t` 为优势估计(GAE)。裁剪避免单步更新过大导致崩溃。

## 二、在大模型 RLHF 中的形式

结合奖励与 KL：

```
L = - E[ r_φ(x,y) - β KL(π_θ ‖ π_ref) ] + 价值函数误差
```

## 三、关键要点

| 项 | 作用 |
|----|------|
| clip | 防过大更新 |
| GAE | 优势估计 |
| KL | 防偏离参考 |

## 四、与开源书的对应

- Schulman et al., *Proximal Policy Optimization Algorithms*, 2017.
- 经典实现：OpenAI trl / TRL-PPO。

## 七、面试题

- PPO 的 clip 机制为何能稳定训练？
- RLHF 中价值函数估计什么？
