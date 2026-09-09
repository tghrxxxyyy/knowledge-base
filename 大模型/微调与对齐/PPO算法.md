# PPO 算法详解

> 对应 InstructGPT（Ouyang et al., 2022）与 Schulman et al., *Proximal Policy Optimization Algorithms*, 2017。

## 一、背景与挑战

在 RLHF 中，我们用奖励模型给模型生成的回答打分，但「如何据分数更新策略」是强化学习问题。朴素策略梯度方差大、易因单步过大更新而崩溃。PPO（Proximal Policy Optimization）通过**裁剪（clip）**把策略更新限制在一个「信任域」内，兼顾稳定与样本效率，是 RLHF 最常用优化器。它同时需要价值网络估计优势，因此对显存与工程实现要求较高。

## 二、核心原理

PPO 是 Actor-Critic 框架下的 on-policy 算法。核心是对策略目标做**裁剪修正**，避免新策略与旧策略差异过大：

$$
\mathcal{L}^{\text{CLIP}} = \mathbb{E}_t\Big[\min\big(r_t(\theta)\,\hat A_t,\ \text{clip}(r_t(\theta),\,1-\epsilon,\,1+\epsilon)\,\hat A_t\big)\Big]
$$

其中概率比 $r_t(\theta)=\pi_\theta(a_t\mid s_t)/\pi_{\theta_{old}}(a_t\mid s_t)$，$\hat A_t$ 为优势估计（常用 GAE），$\epsilon$ 为裁剪阈值（常 0.1~0.2）。当优势为正时限制策略过度提升，为负时限制过度压低，从而平滑更新。

## 三、形式化与数学基础

在 LLM 对齐中，状态 $s_t$ 为已生成前缀，动作 $a_t$ 为下一个 token。完整目标为：

$$
\mathcal{L} = -\Big(\mathcal{L}^{\text{CLIP}} - c_1 \mathcal{L}^{VF}\Big) + \beta\, \mathrm{KL}\big(\pi_\theta\,\|\,\pi_{ref}\big)
$$

其中 $\mathcal{L}^{VF}$ 为价值函数均方误差，$c_1$ 为其系数，最后一项 KL 惩罚把策略约束在 SFT 参考模型附近，防止语言退化与奖励黑客。优势用 GAE 计算：

$$
\hat A_t = \sum_{l=0}^{\infty} (\gamma\lambda)^l\, \delta_{t+l},\quad \delta_t = r_t + \gamma V(s_{t+1}) - V(s_t)
$$

## 四、代码实现

```python
import torch.nn.functional as F

def ppo_clip_loss(logp_new, logp_old, advantages, eps=0.2):
    ratio = (logp_new - logp_old).exp()
    unclipped = ratio * advantages
    clipped = torch.clamp(ratio, 1 - eps, 1 + eps) * advantages
    return -torch.min(unclipped, clipped).mean()

# RLHF 总损失（示意）
policy_loss = ppo_clip_loss(logp, logp_old, adv)
value_loss  = F.mse_loss(value, returns)
loss = policy_loss + 0.5 * value_loss - beta * kl_to_ref
```

## 五、与其他技术对比

| 维度 | PPO | 普通策略梯度 | DPO |
|------|-----|--------------|-----|
| 更新稳定性 | 高（裁剪） | 低 | 高 |
| 是否需要价值网络 | 是 | 常需 | 否 |
| 在线采样 | 是 | 是 | 否 |
| 显存/成本 | 高 | 中 | 中 |

## 六、常见误区

- 以为 PPO 不需要参考模型：RLHF 中必须加 KL 惩罚，否则策略会偏离语言模型分布、产生乱码。
- 忽视价值网络精度：价值估计偏差会放大优势噪声，导致训练抖动。
- 把 $\epsilon$ 设得过大：失去裁剪保护，退回不稳定更新。
- 直接套用游戏 RL 超参：token 级动作空间、长序列回报稀疏，需专门 reply-level 采样与回报塑形。

## 七、与开源书·权威来源对应

- Schulman et al., *Proximal Policy Optimization Algorithms*, 2017（arXiv:1707.06347）。
- Ouyang et al., *InstructGPT*, 2022（RLHF 中 PPO 的标准用法）。
- 经典实现：OpenAI trl / TRL-PPO、DeepSpeed-Chat。

## 八、面试题

- PPO 的 clip 机制为何能稳定训练？裁剪如何影响正/负优势样本？
- RLHF 中价值函数估计什么？回报如何定义？
- 为什么 RLHF 必须加 KL 惩罚？
- PPO 相比 DPO 的优劣？

## 九、演进与趋势

PPO 之后，业界探索更稳更省的替代：GRPO（群体相对策略优化，去掉价值网络）、RLOO（留一基线）、以及 DPO 系列免 RL 方法。但 PPO 仍是能力上限最高、可控性最强的对齐优化器之一。以官方最新文档为准。

**实践要点：**

- 回复级（response-level）回报：PPO 通常对一个完整回答给一个标量奖励，需用长度归一化避免「越长分越高」的偏差。
- 价值网络可与策略共享主干、仅换头部，减少参数量；但其精度直接影响优势估计质量。
- 工程上常用「每步采样若干回答→RM 打分→PPO 更新」的闭环，配合-off-policy 修正（如 importance sampling）提高样本效率。
- 训练不稳定时优先检查：KL 系数、学习率、回报归一化与 value 损失权重，这四项最常见引发崩溃。

## 十、小结

PPO 通过裁剪与 KL 约束把强化学习稳定地用于大模型对齐，是 RLHF 的主力引擎；其代价是四网络并行与较高工程复杂度，现代实践常以 DPO 先做轻量对齐、PPO 做精细打磨。
