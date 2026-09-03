# 宪法AI与RLHF对比

> 对应 Bai et al., 2022 实验对比（RLHF vs RLAIF）。

## 一、背景与挑战

选型需看成本、可规模化、无害性质量。

## 二、核心原理

RLHF 用人类偏好训 RM 再强化；宪法AI用显式原则让模型自生成偏好，减少人类标注、提升无害性且更可控可审计。

## 三、数学形式

两者目标均为 $\max_\pi \mathbb E[r]\;s.t.\;KL(\pi,\pi_{ref})\le\epsilon$，差异在 $r$ 来源（人类 vs 宪法AI）。

## 四、代码实现

```python
# RLHF
rm.train(human_prefs); ppo(rm)
# 宪法AI
rm.train(rlaf_prefs); ppo(rm)
```

## 五、与其他对比

- 与 直接偏好优化深入（可把宪法偏好喂 DPO）衔接。
- 与 价值对齐深入 共享目标。

## 六、常见误区

- 以为宪法AI无需人类；人类仍设计/校验宪法。
- 过信原则可覆盖所有危害。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- 何时选宪法AI？答：需规模化无害对齐、降低标注成本且要可审计原则时。

## 九、演进

RLHF → RLAIF → 宪法+人类混合。

## 十、小结

宪法AI以原则化 AI 反馈补 RLHF，更可控可规模化。
