# 值函数与 Q 学习

> 见「强化学习基础深入/强化学习总览」。

## 一、背景与挑战

如何评估并选最优动作？

## 二、核心原理

Q(s,a) 表动作价值；Q-learning 用 TD 更新逼近最优，ε-贪心探索。

## 三、数学形式

```
Q(s,a) ← Q + α[r + γ max_a' Q(s',a') - Q]
```

## 四、代码实现

```python
q[s,a] += lr*(r + gamma*max(q[s1]) - q[s,a])
```

## 五、关键要点

- off-policy。
- 表格法限小状态。

## 六、与其他对比

- 策略梯度 on-policy；Q-learning off。

## 七、常见误区

- Q 学习需策略——仅用于更新。

## 八、与开源书对应

- Watkins, 1989.
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 九、面试题

- Q 学习 off-policy 含义？

## 十、演进

表格 → DQN → 双Q/优先回放。

## 十一、小结

Q 学习值驱动选动作。
