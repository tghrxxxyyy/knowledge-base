# GRPO 算法

> 对应 DeepSeekMath(2024) 与 DeepSeek-R1(2025) 使用的 Group Relative Policy Optimization。

## 一、背景与挑战

RLHF / 推理 RL 常用 PPO 优化策略，但 PPO 需要额外训练一个**价值网络（critic）**来估计优势函数，带来约一倍可训参数与显存开销，且在长序列、奖励稀疏的推理任务上 critic 训练不稳定。GRPO（Group Relative Policy Optimization）由 DeepSeekMath 提出，核心洞察是：**对同一 prompt 采样一组回答，用组内的相对奖励归一化即可估计优势，从而彻底省掉 critic**。这让大模型推理 RL 在单卡/小集群上也能跑起来，成为 R1 等工作的标配优化器。

## 二、核心原理

GRPO 流程：

1. 对每个 prompt $x$，用旧策略采样一组（如 8 条）回答 $\{y_1,\dots,y_G\}$。
2. 用奖励模型/可验证奖励给每条打分 $r_i$。
3. 计算组内均值与标准差，得到相对优势：

$$
A_i = \frac{r_i - \text{mean}(\{r_j\}_{j=1}^G)}{\text{std}(\{r_j\}_{j=1}^G)}
$$

4. 用该优势做策略梯度更新，并加 KL 惩罚约束不偏离参考模型。

因为优势来自「同题内部比较」，不需要跨 prompt 的绝对价值基线，也就不需要 critic。

### 工程实现要点

- **组大小 G 的取舍**：G 取 4–16 常见；过小则组内均值/标准差噪声大，过大则采样成本线性上升。
- **奖励塑形**：常把奖励拆为「答案正确 + 格式合规 + 长度适中」，用权重调节，避免模型钻空子只优化格式。
- **KL 系数 β**：过大会压制探索、退化为模仿参考模型；过小则分布漂移、输出失控，需按任务调。
- **与 PPO 的代价对比**：省去 critic 后显存约降一半，单卡也能跑 7B–70B 的推理 RL，是大模型 RLHF 的性价比之选。
- **长度惩罚**：推理 RL 易产生冗长无效思考，可加长度奖励或截断，平衡质量与成本。
- **数值稳定**：优势做组内标准化前建议裁剪极端奖励，防止单条离群样本主导梯度。

## 三、形式化与数学基础

GRPO 的近似策略目标（每 prompt 一组样本平均）：

$$
\mathcal{J}_{\text{GRPO}} = \mathbb{E}_{x,\{y_i\}}
\frac{1}{G}\sum_{i=1}^{G}\frac{1}{|y_i|}\sum_{t=1}^{|y_i|}
\min\!\left(\rho_{i,t}\hat A_{i,t},\; \text{clip}(\rho_{i,t},1-\epsilon,1+\epsilon)\hat A_{i,t}\right)
- \beta\, \mathrm{KL}(\pi_\theta\,\|\,\pi_{\text{ref}})
$$

其中 $\rho_{i,t}=\frac{\pi_\theta(y_{i,t}\mid\cdot)}{\pi_{\text{old}}(y_{i,t}\mid\cdot)}$ 为重要性比，$\hat A_{i,t}=A_i$ 在 token 级复用（组内相对优势）。$\beta$ 控制 KL 强度。

## 四、代码实现

用 TRL 的 GRPOTrainer（参数以官方为准）：

```python
from trl import GRPOConfig, GRPOTrainer

def acc_reward(completions, **kw):
    return [1.0 if is_correct(c) else 0.0 for c in completions]

cfg = GRPOConfig(
    num_generations=8,        # 组内样本数 G
    max_completion_length=2048,
    beta=0.001,               # KL 系数
    learning_rate=1e-6,
)
trainer = GRPOTrainer(
    model="base-model", reward_funcs=acc_reward, args=cfg,
)
trainer.train()
```

## 五、与其他技术对比

| 维度 | PPO | GRPO |
|------|-----|------|
| 价值网络 critic | 需要 | 不需要 |
| 可训参数/显存 | 高 | 较低 |
| 优势估计 |  critic 基线 | 组内相对 |
| 稳定性 | 依赖 critic | 更稳（小模型友好） |
| 适用 | 通用 RLHF | 推理 RL/可验证奖励 |

## 六、常见误区

- **以为 GRPO 不需要任何基线**：它用组内均值当基线，只是这个基线在 prompt 内、无需参数化。
- **组越大越好**：组大小 $G$ 提升估计质量但也线性增加采样成本，常取 4–16。
- **奖励必须可微**：GRPO 用任意标量奖励（含代码执行结果），不要求可微。

## 七、与开源书·权威来源对应

- Shao et al., *DeepSeekMath: Pushing the Limits of Mathematical Reasoning* (GRPO 提出), 2024.
- DeepSeek-AI, *DeepSeek-R1*, 2025（GRPO 用于推理 RL）。
- Hugging Face TRL 文档：GRPOTrainer。

## 八、面试题

1. GRPO 为何不需要价值网络？它的「基线」从哪来？
2. 组内归一化（mean/std）相比于 PPO 的 GAE 有何优劣？
3. GRPO 的 KL 惩罚作用在何处？系数过大或过小会怎样？

## 九、演进与趋势

GRPO 后社区提出多种变体：如把奖励细分为「结果 + 格式 + 长度」多信号、用 PRM 提供逐步优势、以及 DAPO / Dr.GRPO 等去掉或调整 KL 约束以提升稳定性。方向是「更省算力、更稳、对奖励塑造更鲁棒」的推理 RL 优化器。

## 十、小结

GRPO 用「同 prompt 组内相对奖励」替代 PPO 的价值网络，省去 critic、降低显存并提升稳定性，是大模型推理 RL 的高效默认选择。其优势估计依赖组内归一化与 KL 约束，组大小与奖励设计是调参重点。R1 的成功让 GRPO 成为开源推理后训练的事实标准。
