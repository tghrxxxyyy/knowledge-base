# DPO与RLHF对比

> 对应两种对齐路线横评；RLHF与偏好优化实战（文件）/ PPO对齐深入 衔接。

## 一、背景与挑战

选型需看复杂度、稳定性、灵活性。

## 二、核心原理

RLHF：奖励模型+PPO 强化，灵活可加多奖励，但复杂不稳。DPO：分类损失直优化，简单稳，难加外部奖励。

## 三、数学形式

RLHF 目标 $\max_\pi \mathbb E[r]\,s.t.\,KL(\pi,\pi_{ref})\le\epsilon$；DPO 等价但无显式 $r$。

## 四、代码实现

```python
# RLHF
rewards = rm(chosen, rejected); ppo_step(...)
# DPO
dpo_step(policy, ref, prefs)
```

## 五、与其他对比

- 与 奖励模型深入（RLHF 需）/ 过程监督与结果监督深入 衔接。
- 与 偏好优化前沿（目录）共享。

## 六、常见误区

- 以为 DPO 全面替代 RLHF；需复杂奖励时仍 RLHF。
- 忽略两者都需要高质量偏好。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 何时用 RLHF 而非 DPO？答：需复杂/多目标奖励、在线探索时用 RLHF。

## 九、演进

RLHF 主导 → DPO 简化 → 混合（如 RLHF+DPO）。

## 十、小结

DPO 与 RLHF 互补：简单场景 DPO，复杂奖励 RLHF。
