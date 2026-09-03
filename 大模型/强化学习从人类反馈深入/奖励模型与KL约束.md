# 奖励模型与 KL 约束

> 对应 RLHF 中 RM 与 KL 罚（Ouyang 2022）；奖励模型深入 衔接。

## 一、背景与挑战

纯最大化奖励易被 RM 骗（reward hacking）；KL 约束把策略锚定参考模型。

## 二、核心原理

把 KL 作为奖励惩罚项或约束：奖励 $R = r_\phi - \beta KL$；防止策略偏离过远产生无意义高 RM 分文本。

## 三、数学形式

带 KL 目标 $\max \mathbb E[r_\phi] - \beta KL(\pi\|\pi_{ref})$；等效奖励 $R=r_\phi-\beta\log\frac{\pi}{\pi_{ref}}$。

## 四、代码实现

```python
logp = policy.logp(resp); logp_ref = ref.logp(resp)
kl = (logp - logp_ref).mean()
reward = rm(query, resp) - beta * kl
```

## 五、与其他对比

- 与 奖励黑客深入（约束机制）联动。
- 与 直接偏好优化深入（DPO 中 β 等效 KL）对照。

## 六、常见误区

- β 过大过保守、过小致黑客。
- RM 未校准致奖励尺度漂移。

## 七、与开源书对应

- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 问：KL 为何防黑客？答：惩罚偏离参考分布，阻止策略钻 RM 空子得高分却无意义。

## 九、演进

无约束 → KL 罚 → 自适应 β。

## 十、小结

KL 约束是 RLHF 稳定与防黑客的支柱，β 需精细调。
