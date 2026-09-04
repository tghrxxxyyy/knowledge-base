# GRPO实现细节与数值稳定性

> 对应 Shao 2024 GRPO 与 pytorch/pytorch 自动微分实践。

## 一、背景与挑战
GRPO 工程实现涉及 log-prob 计算、mask 处理、混合精度与梯度累积，细节决定能否收敛。

## 二、核心原理
需对生成序列逐 token 计算对数概率，用注意力 mask 排除 pad；旧策略概率应在采样时缓存以免重复前向。

## 三、形式化与数学基础
序列级目标为 token 级之和：
$\log\pi_\theta(o|q)=\sum_{t=1}^{|o|}\log\pi_\theta(o_t|q,o_{<t})$
KL 与 ratio 均在 token 级计算后按有效长度平均。

## 四、代码实现
# 计算序列 log-prob，忽略 pad
import torch

def seq_logprob(logits, labels, mask):
    logp = torch.log_softmax(logits, dim=-1)
    tok = logp.gather(-1, labels.unsqueeze(-1)).squeeze(-1)
    return (tok * mask).sum() / mask.sum()

ratio = torch.exp(new_logp - old_logp)
clipped = torch.clamp(ratio, 1 - 0.2, 1 + 0.2)

## 五、与其他技术对比
与 PPO 相比省去 critic 前向，但需缓存旧 logp；与 DPO 相比仍是 on-policy 需重新采样。

## 六、常见误区
mask 与 ratio 长度不一致造成形状错误；混合精度下 log_softmax 数值下溢；旧 logp 未 detach 导致图过大。

## 七、与开源书/权威来源对应
huggingface/trl GRPOTrainer 处理上述细节；pytorch/pytorch 提供 log_softmax 稳定实现。

## 八、面试题
问：为何要在采样时缓存旧 logp？答：避免优化时重算旧策略前向，保证 ratio 中分母固定且省算力。

## 九、演进与趋势
off-policy 重用历史样本、异步 rollout 提升吞吐。

## 十、小结
数值稳定依赖正确 mask、缓存与精度管理，是 GRPO 落地关键。
