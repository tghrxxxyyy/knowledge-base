# GRPO中的参考模型与KL约束

> 对应 Shao 2024 GRPO 与 Ouyang 2022 InstructGPT。

## 一、背景与挑战
强化对齐易使策略偏离预训练分布，产生语言退化与幻觉。GRPO 通过参考模型 $\pi_{ref}$ 施加 KL 约束，是稳定训练的关键。

## 二、核心原理
参考模型通常取 SFT 后的初始策略并冻结。KL 项防止策略在追求高奖励时过度偏移。GRPO 采用无偏 KL 近似 $\mathbb{E}[\frac{\pi_{ref}}{\pi_\theta}-1-\log\frac{\pi_{ref}}{\pi_\theta}]$。

## 三、形式化与数学基础
KL 惩罚项：
$\mathcal{L}_{KL}=\beta\,\mathbb{E}_{o\sim\pi_\theta}[\frac{\pi_{ref}(o|q)}{\pi_\theta(o|q)}-\log\frac{\pi_{ref}(o|q)}{\pi_\theta(o|q)}-1]$
$\beta$ 越大对齐越保守、探索越弱。

## 四、代码实现
# 无偏 KL 近似
import torch

def grpo_kl(new_logp, ref_logp):
    # 返回每个 token 的 KL 估计
    diff = ref_logp - new_logp
    return torch.exp(diff) - diff - 1.0

kl_per_token = grpo_kl(new_logp, ref_logp)
kl_loss = kl_per_token.mean() * beta

## 五、与其他技术对比
DPO 把 KL 直接嵌入偏好损失，GRPO 把 KL 作为独立惩罚；PPO 常用 $\text{KL}[\pi_\theta\|\pi_{ref}]$ 的估计作为奖励惩罚。

## 六、常见误区
1. 用前向 KL 近似替代无偏式导致偏差。2. $\beta$ 固定不调，后期奖励停滞。3. 参考模型与初始策略不一致引发分布跳变。

## 七、与开源书/权威来源对应
Ouyang 2022 讨论 KL 惩罚对 InstructGPT 稳定的作用；huggingface/trl 暴露 beta 超参。

## 八、面试题
问：为何用无偏 KL 近似而非直接 $\log\pi_{ref}-\log\pi_\theta$？答：前者对 ratio 单调且估计更稳定，避免大 ratio 时数值爆炸。

## 九、演进与趋势
自适应 $\beta$ 与 token 级 KL 归一化成为改进方向。

## 十、小结
参考模型与 KL 是 GRPO 的安全阀，合理设置 $\beta$ 是效果与稳定的平衡点。
