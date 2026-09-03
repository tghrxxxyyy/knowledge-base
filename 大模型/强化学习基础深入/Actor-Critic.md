# Actor-Critic

> 见「强化学习基础深入/强化学习总览」与「强化学习基础深入/策略梯度」。

## 一、背景与挑战

策略梯度高方差、值方法间接，能否结合？

## 二、核心原理

Actor 学策略、Critic 评价值，用 Critic 估计优势作基线，降方差且在线更新。

## 三、数学形式

```
∇J ≈ E[∇ log π(a|s) · A(s,a)],  A = Q - V
```

## 四、代码实现

```python
adv = critic(s) - value_target
loss = -(logp * adv).mean() + value_loss
```

## 五、关键要点

- Critic 偏差影响 Actor。
- 现代 RLHF 基础。

## 六、与其他对比

- 比纯 PG 稳；比 Q 适连续。

## 七、常见误区

- Critic 必准——偏差需控。

## 八、与开源书对应

- d2l-zh: https://github.com/d2l-ai/d2l-zh
- Spinning Up.

## 九、面试题

- Actor-Critic 优势？

## 十、演进

A2C → A3C → PPO。

## 十一、小结

AC 融合策略与价值。
