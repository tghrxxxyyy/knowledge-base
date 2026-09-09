# DPO：直接偏好优化

> 对应 Rafailov et al., *Direct Preference Optimization*, 2023。当前主流替代 PPO 的对齐方法。

## 一、背景与挑战

RLHF 流程复杂：需先训练奖励模型，再用 PPO 做在线强化学习，涉及策略模型、参考模型、奖励模型、价值模型四套网络，训练不稳定、超参敏感、显存高昂。DPO（Direct Preference Optimization）的核心洞见是：在 KL 约束下的最优策略可以**解析表达**，因此无需显式训练奖励模型，也无需跑强化学习采样，直接拿偏好对做监督式分类损失即可完成对齐。

## 二、核心原理

DPO 从 RLHF 的 KL 约束优化目标出发，证明最优策略满足：

$$
\pi^*(y\mid x) = \frac{1}{Z(x)}\,\pi_{ref}(y\mid x)\,\exp\!\big(r(x,y)/\beta\big)
$$

把它代回奖励定义，可解出隐式奖励：

$$
r(x,y) = \beta\log\frac{\pi_\theta(y\mid x)}{\pi_{ref}(y\mid x)} + \beta\log Z(x)
$$

由于 $Z(x)$ 在偏好对 $(y_w,y_l)$ 的差分中抵消，DPO 直接优化以下损失，使被选回答的对数几率高于被拒回答：

$$
\mathcal{L}_{\text{DPO}} = -\,\mathbb{E}\Big[\log\sigma\Big(\beta\big(\log\tfrac{\pi_\theta(y_w\mid x)}{\pi_{ref}(y_w\mid x)} - \log\tfrac{\pi_\theta(y_l\mid x)}{\pi_{ref}(y_l\mid x)}\big)\Big)\Big]
$$

其中 $\pi_{ref}$ 为冻结的参考模型（通常是 SFT 模型），$\beta$ 控制偏离程度。

## 三、形式化与数学基础

对偏好对 $(x,y_w,y_l)$，定义策略对数比差值 $\hat r_\theta = \beta(\log\pi_\theta(y_w)-\log\pi_{ref}(y_w)-\log\pi_\theta(y_l)+\log\pi_{ref}(y_l))$。DPO 损失等价于最大化 $\log\sigma(\hat r_\theta)$，当 $y_w$ 相对 $y_l$ 更被策略偏好时损失下降。注意 $\log\pi$ 需在回答 token 上求和（忽略提示），与 SFT 的 loss mask 一致。

## 四、代码实现

```python
import torch.nn.functional as F

def dpo_loss(pi_logp_w, pi_logp_l, ref_logp_w, ref_logp_l, beta=0.1):
    # 各 logp 为回答序列对数似然之和（已做 loss mask）
    pi_logratio  = pi_logp_w  - pi_logp_l
    ref_logratio = ref_logp_w - ref_logp_l
    logits = beta * (pi_logratio - ref_logratio)
    return -F.logsigmoid(logits).mean()
```

```python
# 训练循环：策略与参考模型共享输入，参考模型不反传
ref_logp = ref_model(**inputs).logits  # 冻结、no_grad
pi_logp  = model(**inputs).logits
loss = dpo_loss(pi_logp_w, pi_logp_l, ref_logp_w, ref_logp_l, beta=0.1)
loss.backward()
```

## 五、与其他技术对比

| 维度 | DPO | PPO/RLHF | ORPO |
|------|-----|----------|------|
| 奖励模型 | 不需要（隐式） | 需要 | 不需要 |
| 参考模型 | 需要（冻结） | 需要 | 不需要 |
| 在线采样 | 不需要 | 需要 | 不需要 |
| 稳定性 | 高 | 中 | 高 |
| 调参难度 | 简单（$\beta$） | 复杂 | 简单（$\lambda$） |

## 六、常见误区

- 认为 DPO 不需要参考模型：$\pi_{ref}$ 必须冻结且参与损失，缺少它退化为普通排序损失。
- $\beta$ 太小：偏离不足，对齐微弱；太大：约束过死，模型不敢改、能力被压。
- 偏好数据质量差：噪声对会直接误导策略，DPO 对标签错误比 RLHF 更敏感。
- 在回答外计算 logp：必须用与 SFT 一致的 loss mask，否则提示 token 干扰优化。

## 七、与开源书·权威来源对应

- Rafailov et al., *Direct Preference Optimization*, 2023（arXiv:2305.18290）。
- llm-course「DPO」：https://github.com/mlabonne/llm-course
- 后续变体：IPO、KTO、SimPO。

## 八、面试题

- DPO 为何无需显式奖励模型？它与 RLHF 的数学联系是什么？
- $\beta$ 在 DPO 中的角色？如何影响对齐与能力？
- DPO 相比 PPO 的优势与局限？
- 为什么 DPO 仍需冻结参考模型？

## 九、演进与趋势

DPO 之后出现大量变体：IPO 去除了成对偏好中的过拟合、KTO 用「好/坏」单边信号、SimPO 去掉参考模型且奖励直接基于序列似然、ORPO 把偏好融入 SFT。整体方向是更简洁、更稳、更少模型副本。以官方最新文档为准。

**实践要点：**

- $\beta$ 与学习率需联合调：较大 $\beta$ 时可用稍大 LR，较小 $\beta$ 时需更谨慎防发散。
- 偏好数据应做去重与质量过滤，明显错误标签对会直接误导策略方向。
- 训练过程监控「被选/被拒对数似然差」，若过早拉满说明数据噪声大或 $\beta$ 过小。
- DPO 后可接极轻量 PPO 精修高风险能力，形成「DPO 主对齐 + PPO 精修」组合。

## 十、小结

DPO 把对齐转化为一个简单的分类式监督损失，省去奖励模型与强化学习采样，已成为工业界主流；掌握 $\beta$ 与偏好数据质量是其成功关键。
