# PPO 原理

> 见「强化学习基础深入/Actor-Critic」与「微调与对齐/PPO算法」。

## 一、背景与挑战

策略更新步长难控，易崩。

## 二、核心原理

PPO 用裁剪代理目标，限制新策略相对旧策略比率，防过大更新；近似 TRPO 但简单。

## 三、数学形式

```
L = E[min(r_t A, clip(r_t,1-ε,1+ε) A)]
```

r_t = π_new/π_old。

## 四、代码实现

```python
ratio = exp(logp_new - logp_old)
surr = min(ratio*adv, clip(ratio,1-e,1+e)*adv)
```

## 五、关键要点

- ε 控更新幅度。
- RLHF 默认算法。

## 六、与其他对比

- TRPO 复杂；PPO 简洁稳。

## 七、常见误区

- PPO 无超参敏——ε/学习率关键。

## 八、与开源书对应

- Schulman et al., *PPO*, 2017.
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 九、面试题

- PPO 裁剪作用？

## 十、演进

TRPO → PPO → PPO-ptx(RLHF)。

## 十一、小结

PPO 是 RLHF 主力。
