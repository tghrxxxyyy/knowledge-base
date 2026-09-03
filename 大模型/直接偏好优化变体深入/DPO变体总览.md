# DPO变体总览

> 对应 Rafailov et al., *Direct Preference Optimization*, NeurIPS 2023；Azar et al., *A General Theoretical Paradigm to Understand Learning from Human Preferences*, AISTATS 2024。

## 一、背景与挑战

DPO 把 RLHF 的「奖励建模 + PPO」压缩为一个离线分类式目标，训练稳定性与工程复杂度大幅改善。但实践暴露三类问题：一是对偏好标签噪声敏感，二是隐式奖励与序列长度强相关（长度偏置），三是必须常驻一份参考模型，显存与吞吐都被拖累。变体族正是针对这三条主线展开的。

## 二、核心原理

所有变体都可以放进同一个框架看：先定义一个「隐式奖励」 $\hat r_\theta$，再选择一个作用在偏好上的损失形态。DPO 取 $\hat r_\theta=\beta\log(\pi_\theta/\pi_{ref})$ 配 logistic 损失；IPO 换成平方回归损失以获得有界解；KTO 把配对信号拆成单点效用；ORPO 用 odds ratio 惩罚直接挂在 SFT 损失上从而丢掉参考模型；SimPO 用长度归一化的平均对数似然当奖励并引入目标间隔。区别不在「优化谁」，而在「奖励怎么参数化」与「损失怎么惩罚」。

## 三、数学形式

统一写法：给定偏好对 $(x,y_w,y_l)$，令隐式奖励差 $\Delta_\theta = \hat r_\theta(x,y_w)-\hat r_\theta(x,y_l)$，则

$$\mathcal L = \mathbb E_{(x,y_w,y_l)\sim D}\big[\ \ell(\Delta_\theta)\ \big]$$

DPO 取 $\ell(\Delta)=-\log\sigma(\Delta)$；IPO 取 $\ell(\Delta)=(\Delta-\tfrac{1}{2\tau})^2$；SimPO 在 $\Delta$ 上再减去间隔 $\gamma$。

## 四、代码实现

```python
import torch, torch.nn.functional as F

def implicit_reward(logp, logp_ref, beta):
    # DPO 隐式奖励：beta * log(pi_theta / pi_ref)
    return beta * (logp - logp_ref)

def dpo_loss(logp_w, logp_l, ref_w, ref_l, beta=0.1):
    delta = implicit_reward(logp_w, ref_w, beta) - implicit_reward(logp_l, ref_l, beta)
    return -F.logsigmoid(delta).mean(), delta.detach()

def ipo_loss(logp_w, logp_l, ref_w, ref_l, tau=0.1):
    delta = (logp_w - ref_w) - (logp_l - ref_l)
    return ((delta - 1.0 / (2 * tau)) ** 2).mean()
```

## 五、与其他对比

- 与 直接偏好优化深入：那里讲 DPO 主干推导，本目录聚焦变体差异与选型。
- 与 偏好优化理论收敛性深入：变体的动机多来自理论缺陷（无界性、覆盖不足）。
- 与 奖励模型过优化与奖励黑客深入：长度偏置本质上是隐式奖励被黑客化的一种形式。

## 六、常见误区

- 认为「新变体一定更强」。公开对比里胜负取决于数据形态（是否配对、噪声率、长度分布）与调参预算。
- 把 $\beta$ 当学习率调。$\beta$ 控制的是与参考分布的偏离尺度，与 lr 作用轴不同。
- 忽略变体间超参不可迁移：DPO 的 $\beta$ 与 SimPO 的 $(\beta,\gamma)$ 不是同一量纲。

## 七、与开源书对应

- mlabonne/llm-course（偏好对齐与微调章节）：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe（对齐与微调实践）：https://github.com/datawhalechina/llm-universe

## 八、面试题

- DPO 变体主要解决哪几类问题？答：标签噪声鲁棒性、长度偏置、参考模型开销，以及 logistic 损失下隐式奖励无界导致的过拟合。
- 为什么可以用统一框架描述这些变体？答：它们共享「隐式奖励 + 偏好损失」的两段结构，仅在奖励参数化与损失形态上分叉。

## 九、演进

RLHF（RM + PPO） → DPO（离线闭式重参数化） → IPO/cDPO（有界与噪声鲁棒） → KTO（去配对） → ORPO/SimPO（去参考模型） → 在线迭代与多目标偏好优化。

## 十、小结

DPO 变体不是彼此替代关系，而是在噪声、长度、显存三个约束方向上的不同取舍；选型应从数据形态出发，而非从论文时间线出发。
