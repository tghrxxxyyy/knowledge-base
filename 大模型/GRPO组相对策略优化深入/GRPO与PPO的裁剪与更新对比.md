# GRPO与PPO的裁剪与更新对比

> 对应 Shao 2024 GRPO 与 Schulman 2017 PPO。

## 一、背景与挑战
理解 GRPO 与 PPO 的差异是工程选型基础。两者都使用概率比裁剪，但基线来源与网络结构不同，影响显存、稳定性和适用任务。

## 二、核心原理
PPO 用 GAE 估计优势 $A^{GAE}_t$，依赖 critic 输出 $V(s)$；GRPO 用同组 $G$ 个样本奖励的 z-score 作为 $A_i$，无价值网络。两者更新均围绕 $\min(\rho_t A_t,\text{clip}(\rho_t)A_t)$。

## 三、形式化与数学基础
PPO 目标：
$\mathcal{J}_{PPO}=\mathbb{E}[\min(\frac{\pi_\theta(a|s)}{\pi_{old}(a|s)}A_t,\ \text{clip}(\frac{\pi_\theta}{\pi_{old}},1-\epsilon,1+\epsilon)A_t)]$
GRPO 将 $A_t$ 换成组相对 $A_i$，并在外层对 $G$ 个样本取均值。

## 四、代码实现
# 概率比裁剪比较
import torch

def ppo_clip(ratio, adv, eps=0.2):
    return -torch.min(ratio * adv, torch.clamp(ratio, 1 - eps, 1 + eps) * adv).mean()

# GRPO 与 PPO 共享同一裁剪函数，差异仅在 ratio 与 adv 的来源
ratio_grpo = torch.exp(new_logp - ref_logp)     # 相对参考策略
ratio_ppo = torch.exp(new_logp - old_logp)       # 相对旧策略

## 五、与其他技术对比
PPO 适合连续控制与需价值估计的环境；GRPO 在 LLM 生成中因去除 critic 更易扩展。但 GRPO 需多次采样，单次前向成本更高。

## 六、常见误区
认为 GRPO 完全不需要旧策略概率比——实际它仍需 $\pi_{ref}$ 计算 KL 与 ratio。混淆 $\pi_{ref}$ 与 $\pi_{old}$ 的角色。

## 七、与开源书/权威来源对应
huggingface/trl 同时提供 PPOTrainer 与 GRPOTrainer；Schulman 2017 给出裁剪目标理论。

## 八、面试题
问：PPO 的 GAE 与 GRPO 的组内归一化本质区别？答：前者用时序差分累积价值，后者用同 prompt 下样本间方差作基线。

## 九、演进与趋势
混合方法开始将组内优势与轻量价值估计结合，试图兼得两者优点。

## 十、小结
裁剪机制同源，差异在基线；选型取决于任务是否便于多次采样与能否承受 critic 开销。
