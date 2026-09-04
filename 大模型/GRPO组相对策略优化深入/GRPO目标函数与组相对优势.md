# GRPO目标函数与组相对优势

> 对应 Shao 2024 GRPO 与 Schulman 2017 PPO。

## 一、背景与挑战
PPO 在 RLHF 中依赖一个与策略独立训练的评论家(critic)网络来估计价值函数，这需要额外显存与算力，且在 LLM 场景下价值估计方差大。GRPO(Group Relative Policy Optimization)由 DeepSeekMath(Shao 2024)提出，用同一问题下多个采样回答的组内相对奖励替代 critic，显著降低训练成本。

## 二、核心原理
给定问题 $q$，从旧策略 $\pi_{\theta_{old}}$ 采样一组 $G$ 个回答 $\{o_1,...,o_G\}$，对每个回答用奖励模型打分 $r_i$，再计算组内相对优势 $A_i=(r_i-\text{mean}(\mathbf{r}))/\text{std}(\mathbf{r})$。策略更新目标是最大化相对优势同时约束对参考模型的 KL。

## 三、形式化与数学基础
GRPO 目标为：
$\mathcal{J}_{GRPO}=\mathbb{E}_{q\sim D,\{o_i\}\sim\pi_{old}}[\frac{1}{G}\sum_{i=1}^{G}\min(\frac{\pi_\theta(o_i|q)}{\pi_{ref}(o_i|q)} A_i,\ \text{clip}(\frac{\pi_\theta}{\pi_{ref}},1-\epsilon,1+\epsilon)A_i)]-\beta\mathbb{D}_{KL}(\pi_\theta\|\pi_{ref})$
其中 $\epsilon$ 为裁剪系数，$\beta$ 控制 KL 惩罚强度。

## 四、代码实现
# 简化版 GRPO 优势与损失计算
import torch

def grpo_advantages(rewards, eps=1e-6):
    # rewards: Tensor [G]
    mean = rewards.mean()
    std = rewards.std() + eps
    return (rewards - mean) / std

def grpo_loss(logp, ref_logp, adv, beta=0.04, clip=0.2):
    ratio = torch.exp(logp - ref_logp)
    unclipped = ratio * adv
    clipped = torch.clamp(ratio, 1 - clip, 1 + clip) * adv
    policy = -torch.min(unclipped, clipped).mean()
    kl = (torch.exp(ref_logp - logp) - (ref_logp - logp) - 1).mean()
    return policy + beta * kl

## 五、与其他技术对比
相比 PPO，GRPO 去掉 critic、显存更低；相比 DPO，GRPO 支持可验证/稠密奖励且能在线探索。代价是需要同一问题多次采样，rollout 成本上升。

## 六、常见误区
1. 把组大小 $G$ 设得过小导致优势估计噪声大。2. 忽略 KL 项的近似形式造成训练不稳定。3. 以为去掉 critic 就无需参考模型——KL 仍依赖 $\pi_{ref}$。

## 七、与开源书/权威来源对应
huggingface/trl 实现了 GRPO Trainer；Shao 2024 原始论文见于 DeepSeekMath；Schulman 2017 PPO 是裁剪目标的来源。

## 八、面试题
问：GRPO 为何不需要 critic？答：组内相对奖励充当基线，等价于用组内均值消去状态价值，故价值网络冗余。

## 九、演进与趋势
在可验证奖励(数学、代码)场景 GRPO 已成为主流，并与 reward shaping、长度惩罚结合。后续工作向更稳定的优势归一化与异步采样发展。

## 十、小结
GRPO 以组内相对优势替代 critic，在保持 PPO 裁剪稳定性的同时降低资源开销，是 LLM 强化对齐的高效范式。
