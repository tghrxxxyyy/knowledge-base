# 直接偏好优化（DPO）总览

> 对应 Rafailov et al., *DPO*, 2023；与 RLHF与偏好优化实战（文件）/ 偏好优化前沿（目录）衔接。

## 一、背景与挑战

RLHF 需训奖励模型+PPO，流程复杂不稳；DPO 跳过显式奖励与强化，直接优化策略。

## 二、核心原理

DPO 证明最优策略可用奖励重参数化，直接以偏好对（chosen/rejected）做分类式损失优化策略。

## 三、数学形式

$\mathcal L_{DPO} = -\mathbb E[\log\sigma(\beta\log\frac{\pi_\theta(y_w|x)}{\pi_{ref}(y_w|x)} - \beta\log\frac{\pi_\theta(y_l|x)}{\pi_{ref}(y_l|x)})]$。

## 四、代码实现

```python
loss = -F.logsigmoid(beta*(logp_w - logp_ref_w - (logp_l - logp_ref_l))).mean()
```

## 五、与其他对比

- 比 PPO 稳定简单、无独立奖励模型；但失灵活性（难加额外奖励）。
- 与 直接偏好优化深入 同主题（本节总览）。

## 六、常见误区

- $\beta$ 过大过保守、过小过拟合偏好。
- 偏好数据噪声直接毁效果。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- DPO 为何不需奖励模型？答：用参考策略重参数化，把奖励隐含在策略比中。

## 九、演进

RLHF/PPO → DPO → IPO/KTO/ORPO 变体。

## 十、小结

DPO 以分类损失直优化策略，简化对齐、稳且易训。
