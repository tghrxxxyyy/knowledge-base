# KTO 前景理论对齐

> 对应 Ethayarajh et al., *KTO: Model Alignment as Prospect Theoretic Optimization*, ICML 2024；理论基础为 Kahneman & Tversky 前景理论。

## 一、背景与挑战

DPO 家族要求成对数据 $(y_w,y_l)$，但工业场景更容易拿到的是单点信号：点赞/点踩、投诉标记、工单是否升级、A/B 中是否被采纳。把单点信号强行凑成对会引入伪配对噪声，且丢弃大量未成对样本。

## 二、核心原理

KTO 借用前景理论：人对收益与损失的感知是相对某个参考点的、且对损失更敏感（损失厌恶）。它把隐式奖励 $r_\theta=\log(\pi_\theta/\pi_{ref})$ 作为「结果」，把当前策略相对参考策略的 KL 作为「参考点」 $z_0$，然后对 desirable 样本奖励高于参考点给正效用、对 undesirable 样本奖励低于参考点给正效用，并用两个权重 $\lambda_D,\lambda_U$ 表达损失厌恶与类别不平衡。

## 三、数学形式

令 $r_\theta(x,y)=\beta\log\dfrac{\pi_\theta(y|x)}{\pi_{ref}(y|x)}$，参考点 $z_0=\mathrm{KL}(\pi_\theta\|\pi_{ref})$ 的批内估计，则效用

$$v(x,y)=\begin{cases}\lambda_D\,\sigma\big(r_\theta(x,y)-z_0\big), & y \text{ desirable}\\[2pt] \lambda_U\,\sigma\big(z_0-r_\theta(x,y)\big), & y \text{ undesirable}\end{cases}$$

目标为最小化 $\mathcal L_{KTO}=\mathbb E\big[\lambda_y-v(x,y)\big]$，其中 $\lambda_y\in\{\lambda_D,\lambda_U\}$。sigmoid 提供了 S 形、饱和的价值函数，对应前景理论的风险态度。

## 四、代码实现

```python
import torch, torch.nn.functional as F

def kto_loss(lp, ref_lp, is_desirable, beta=0.1, lam_d=1.0, lam_u=1.0):
    r = beta * (lp - ref_lp)                       # 隐式奖励
    z0 = torch.clamp((r.detach()).mean(), min=0)   # 批内参考点（KL 的粗估计）
    v = torch.where(is_desirable,
                    lam_d * torch.sigmoid(r - z0),
                    lam_u * torch.sigmoid(z0 - r))
    lam = torch.where(is_desirable,
                      torch.full_like(r, lam_d),
                      torch.full_like(r, lam_u))
    return (lam - v).mean()
```

## 五、与其他对比

- 相对 DPO：不需要配对，标注成本显著降低，能吃下线上反馈流；代价是失去同 prompt 内的直接对照信号。
- 相对 ORPO / SimPO：那两者仍是成对目标，只是去掉参考模型；KTO 去掉的是「配对」这一数据结构要求。
- 与 奖励模型深入：KTO 可看作把 pointwise 反馈直接注入策略，绕过显式 RM。

## 六、常见误区

- 忽视 $\lambda_D:\lambda_U$ 与实际正负样本比的匹配，导致模型整体变得过度保守或过度激进。
- 把 undesirable 样本当作「反向 SFT」直接做梯度上升。那会破坏语言建模能力，而 KTO 的 sigmoid 饱和正是为了限制这种破坏。
- 参考点估计用整轮均值而非批内动态估计，导致训练早期效用几乎恒定。

## 七、与开源书对应

- mlabonne/llm-course（偏好数据与对齐流程）：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe（反馈数据采集与迭代）：https://github.com/datawhalechina/llm-universe

## 八、面试题

- KTO 与 DPO 的数据要求差在哪？答：DPO 需同 prompt 的成对优劣样本，KTO 只需样本级 desirable / undesirable 标签。
- 前景理论在 KTO 中体现在哪？答：相对参考点度量收益损失、S 形饱和价值函数、以及用不对称权重表达损失厌恶。

## 九、演进

成对偏好（BT 模型） → DPO 家族 → KTO 单点效用 → 与在线反馈流结合的持续对齐。

## 十、小结

KTO 把对齐问题从「排序学习」挪到「效用最大化」，让海量弱标注单点反馈可直接用于策略优化，是数据现实驱动的关键变体。
