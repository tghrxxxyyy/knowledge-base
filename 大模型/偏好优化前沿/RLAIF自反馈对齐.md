# RLAIF 自反馈对齐

> 见「微调与对齐/DPO原理与实现」与「偏好优化前沿/RRHF与多目标对齐」。

## 一、背景与挑战

人类偏好标注贵且慢。RLAIF 用 AI 生成偏好信号替代部分人工。

## 二、核心原理

用现成强模型（或规则）对候选回答打偏好标签，再以此训练（可走 DPO/PPO）。核心是「AI 反馈」替代「人类反馈」。

## 三、关键要点

- 成本骤降、可规模化。
- 可能固化强模型偏见。

## 四、代码实现

```python
pref = ai_judge(chosen, rejected)  # AI 生成偏好
train_with_dpo(pref)
```

## 五、与其他对比

- RLHF 用人类；RLAIF 用 AI；常混合（RLAIF+少量 RH）。

## 六、常见误区

- AI 反馈无偏——其实继承裁判模型偏差。

## 七、与开源书对应

- Bai et al., *Constitutional AI / RLAIF*, 2022.
- llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- RLAIF 如何保证反馈质量？

## 九、演进

RH → AI 反馈 → 宪法式自批判。

## 十、小结

RLAIF 把对齐成本打下来，但需防偏见传导。
