# RLHF 演进与替代方法

> 对应 DPO/RLAIF/ Constitutional AI 等；偏好优化前沿 衔接。

## 一、背景与挑战

标准 RLHF 复杂不稳；近年出现更简/更省的替代。

## 二、核心原理

DPO 消去 RM 与 RL；RLAIF 用 AI 反馈替代人工；宪法 AI 用原则自评；这些方法在成本/稳定上改进。

## 三、数学形式

DPO 等效 RLHF 最优解（见 DPO 推导）；RLAIF 用 $r_{AI}$ 替 $r_{human}$。

## 四、代码实现

```python
# 替代：直接 DPO 或 RLAIF 数据
dpo_loss(policy, ref, ai_prefs)
```

## 五、与其他对比

- 与 直接偏好优化深入 / AI反馈RLAIF 共享。
- 与 奖励模型深入（被替代对象）对照。

## 六、常见误区

- 以为 DPO 全面替代 RLHF；需复杂奖励时仍 RLHF。
- 忽略所有方法都依赖偏好质量。

## 七、与开源书对应

- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 问：RLHF 被哪些替代？答：DPO 简化、RLAIF 省人工、宪法 AI 原则自评，各降成本/稳训。

## 九、演进

RLHF → DPO → RLAIF → 混合迭代对齐。

## 十、小结

RLHF 仍是强基线，但 DPO/RLAIF 等在其外围简化与降本。
