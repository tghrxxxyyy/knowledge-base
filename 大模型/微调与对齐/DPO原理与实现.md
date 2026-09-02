# DPO：直接偏好优化

> 对应 Rafailov et al., *Direct Preference Optimization*, 2023。当前主流替代 PPO 的对齐方法。

## 一、核心概念

DPO 证明：在 KL 约束下的最优策略可解析表达，无需显式训练奖励模型或跑强化学习。直接用偏好数据优化策略：

```
L_DPO = - E[ log σ( β ( log (π_θ(y_w|x)/π_ref(y_w|x))
                         - log (π_θ(y_l|x)/π_ref(y_l|x)) ) ) ]
```

其中 `π_ref` 为冻结的参考模型（通常是 SFT 模型）。`β` 控制偏离程度。

## 二、数学形式要点

DPO 等价于隐式优化一个「奖励」`r(x,y) = β log(π_θ(y|x)/π_ref(y|x)) + β log Z(x)`，把偏好学习转化为简单的监督分类式损失——实现极简、稳定、省显存（无 RM、无 PPO 采样）。

## 三、代码实现（核心 loss）

```python
import torch.nn.functional as F
def dpo_loss(pi_logp_w, pi_logp_l, ref_logp_w, ref_logp_l, beta=0.1):
    pi_logratio = pi_logp_w - pi_logp_l
    ref_logratio = ref_logp_w - ref_logp_l
    logits = beta * (pi_logratio - ref_logratio)
    return -F.logsigmoid(logits).mean()
```

## 四、关键要点

| 维度 | DPO | PPO/RLHF |
|------|-----|----------|
| 奖励模型 | 不需要 | 需要 |
| 采样 | 不需要 | 需要 |
| 稳定性 | 高 | 中 |
| 调参 | 简单 | 复杂 |

## 五、常见误区

- 认为 DPO 不需要参考模型——`π_ref` 必须冻结且参与损失。
- `β` 太小导致偏离不足、太大约束过死。

## 六、与开源书的对应

- Rafailov et al., *Direct Preference Optimization*, 2023 (arXiv:2305.18290).
- llm-course「DPO」：https://github.com/mlabonne/llm-course

## 七、面试题

- DPO 为何无需显式奖励模型？
- `β` 在 DPO 中的角色？
