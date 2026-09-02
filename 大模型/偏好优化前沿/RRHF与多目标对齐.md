# RRHF 与多目标对齐

> 对应 rasbt/LLMs-from-scratch 对齐章；Yuan et al., *RRHF*, 2023。

## 一、背景与挑战

RLHF/PPO 训练复杂、不稳定。RRHF 用更简单的方式利用多候选偏好。

## 二、核心原理

对每个 prompt 采样多个回答，用奖励模型排序，训练时让高分回答概率升、低分降（类似排序损失），无需 PPO 的在线强化。

## 三、数学形式

排序损失：

```
L = Σ_{i>j} max(0, β - (log P(y_i) - log P(y_j)))
```

## 四、代码实现

```python
# 按 reward 排序后两两对比
y_sorted = sorted(ys, key=reward, reverse=True)
```

## 五、关键要点

- 比 PPO 稳定、易实现。
- 依赖奖励模型质量。

## 六、与其他对比

- PPO 在线探索；RRHF 离线排序蒸馏。

## 七、常见误区

- 以为 RRHF 完全替代 RLHF——只是更简对齐路径。

## 八、与开源书对应

- rasbt/LLMs-from-scratch: https://github.com/rasbt/LLMs-from-scratch
- Yuan et al., 2023.

## 九、面试题

- RRHF 相比 PPO 的优势与代价？

## 十、演进

PPO → RRHF → DPO（省奖励模型）。

## 十一、小结

RRHF 是「轻量对齐」的重要一环。
