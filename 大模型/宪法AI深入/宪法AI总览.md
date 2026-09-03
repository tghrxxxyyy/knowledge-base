# 宪法AI总览

> 对应 Bai et al., *Constitutional AI: Harmlessness from AI Feedback*, 2022（Anthropic）。

## 一、背景与挑战

RLHF 依赖大量人类标注、成本高且难以规模化；同时人类标注者也可能给出有害反馈。宪法AI用一组明确的原则（宪法）让模型自我批判修正，以 AI 反馈（RLAIF）替代部分人类反馈。

## 二、核心原理

两阶段：先监督式微调（SFT）生成修订数据——让模型据宪法自我批评并改写有害回答；再用偏好模型（由修订对训练）做 RL 微调。宪法提供自然语言的“是非准则”。

## 三、数学形式

偏好损失沿用 Bradley-Terry：$\mathcal L=-\mathbb E\log\sigma(r(x,y_w)-r(x,y_l))$，其中 $y_w$ 为依宪法修订后的无害回答。

## 四、代码实现

```python
critique = llm(f"按宪法原则批评该回答:\n{ans}")
revised = llm(f"据批评改写为无害回答:\n{ans}\n{critique}")
```

## 五、与其他对比

- 与 价值对齐深入 / 伦理对齐深入 共享“对齐准则”范式。
- 与 直接偏好优化深入 衔接（宪法偏好用于 DPO）。

## 六、常见误区

- 宪法设计不当会引入作者偏见（西方中心）。
- 误以为 RLAIF 完全不需人类，实则人类仍写宪法/校验。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- 宪法AI为何可规模化？答：用模型按显式原则自我批判生成训练信号，减少昂贵人类标注。

## 九、演进

人类反馈 RLHF → RLAIF → 宪法AI → 多原则/可辩论宪法。

## 十、小结

宪法AI以自然语言原则驱动自我修正，是 RLHF 可规模化的重要替代路线。
