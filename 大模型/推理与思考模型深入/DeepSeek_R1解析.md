# DeepSeek-R1 解析

> 对应 DeepSeek-AI, *DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning*, 2025。

## 一、背景与挑战

如何让大模型具备强推理（数学、代码、逻辑）长期依赖海量人工标注的思维链（CoT）数据，成本高且难以覆盖难分布。DeepSeek-R1 的意义在于证明：**纯强化学习也能从基础模型「涌现」出长链推理**，并可通过蒸馏把能力迁移到小模型。它开源了权重与训练配方，成为社区推理模型（类 o1）的重要里程碑。核心挑战是如何在不依赖大量 SFT 的前提下，让模型学会自我验证、反思与长思考，并兼顾可读性（R1-Zero 在这一点上失败）。

## 二、核心原理

R1 系列包含两条主线：

- **R1-Zero**：直接从基础模型用大规模 RL（类 GRPO）训练，**无 SFT 冷启动**。模型自发学会延长思考、自我验证，出现著名的「aha moment」——在训练中某刻突然学会用更长推理解决难题。但缺点是可读者差、语言混杂、格式不稳。
- **R1**：在 Zero 之上加**冷启动 SFT**（少量高质量 CoT 种子数据）→ 面向推理的 RL → 拒绝采样生成 SFT 数据 → 通用对齐 RL（兼顾有用性与安全）。兼顾推理能力与可读性。

两者都用 GRPO 风格优化，以可验证奖励（答案对错、代码通过测试）为主信号，格式奖励为辅。

### 训练流程要点

- **冷启动数据从哪来**：用少量人工撰写的「高质量长链 CoT」种子，而非直接 RL，给模型一个可读格式范本。
- **推理 RL 的奖励设计**：以可验证奖励为主（数学答案解析校验、代码跑测试），配轻量格式奖励（标签配对、长度合理）。
- **拒绝采样阶段**：RL 后采样大量解答，用 verifier 筛正确样本作为新 SFT 数据，再训一轮提升多样与稳定。
- **通用对齐 RL**：最后用通用偏好/安全奖励做对齐，避免推理能力损害有用性与安全性。
- **蒸馏数据构造**：把 R1 对海量题的解答（含思考）直接作为学生 SFT 目标，覆盖数学、代码、逻辑多域。
- **工程坑**：组大小（num_generations）过小则组内归一噪声大；KL 系数过大则 RL 退化为模仿旧策略。

## 三、形式化与数学基础

RL 阶段优化策略 $\pi_\theta$ 最大化带 KL 约束的奖励：

$$
\max_\theta \; \mathbb{E}_{x\sim\mathcal{D},\, y\sim\pi_\theta(\cdot\mid x)}\big[ r(x,y) \big]
\quad \text{s.t.}\quad \mathrm{KL}(\pi_\theta\,\|\,\pi_{\text{ref}})\le \epsilon
$$

GRPO 用同 prompt 的组内相对优势替代价值网络：

$$
A_i = \frac{r_i - \text{mean}(\{r_j\})}{\text{std}(\{r_j\})}
$$

蒸馏则把 R1 生成的 $(x, y_{\text{reason}})$ 作为学生模型的 SFT 目标，最小化：

$$
\mathcal{L}_{\text{distill}} = -\sum_t \log p_{\text{student}}(y_t\mid x, y_{<t})
$$

## 四、代码实现

用 TRL 风格的 GRPO 训练示意（伪代码，参数以官方为准）：

```python
from trl import GRPOConfig, GRPOTrainer
cfg = GRPOConfig(
    num_generations=8,            # 组内采样数
    reward_weights={"accuracy": 1.0, "format": 0.2},
    max_completion_length=2048,
)
trainer = GRPOTrainer(model="base", reward_funcs=[acc_reward, fmt_reward], args=cfg)
trainer.train()                  # 推理 RL 阶段
```

蒸馏侧更简单：把 R1 输出当 SFT 数据喂给小模型（如 Qwen-7B）做 supervised fine-tuning。

## 五、与其他技术对比

| 方案 | 冷启动 SFT | 推理 RL | 可读性 | 小模型可用 |
|------|-----------|---------|--------|-----------|
| R1-Zero | 无 | 有 | 差 | 间接 |
| R1 | 有 | 有 | 好 | 蒸馏后好 |
| 纯 SFT CoT | 大量 | 无 | 好 | 受数据限 |
| o1(闭源) | 未知 | 有 | 好 | 否 |

## 六、常见误区

- **误以为 R1 完全无 SFT**：R1 有冷启动与拒绝采样 SFT，仅 R1-Zero 是无 SFT。
- **蒸馏≈直接复制**：蒸馏学的是推理行为分布，小模型容量有限，过长链难稳定学会。
- **把 aha moment 神化**：它是 RL 奖励塑形下的涌现现象，非预设机制，也非每题必现。
- **R1 推理能力全靠 RL**：冷启动 SFT 与格式奖励对稳定性与可读性贡献巨大。
- **蒸馏小模型等同原模型**：7B 蒸馏版在极难分布上仍弱于 671B 原版。

## 七、与开源书·权威来源对应

- DeepSeek-AI, *DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning*, 2025（含 R1 / R1-Zero / 蒸馏小模型全文）。
- 与本系列「GRPO 算法」「思维链蒸馏」「过程奖励与结果奖励」章节互参。

## 八、面试题

1. R1-Zero 的「aha moment」指什么？为何它可读性差？
2. 为何 R1 比 R1-Zero 更实用？冷启动 SFT 解决了什么问题？
3. 蒸馏得到的 7B 模型为何推理强于同尺寸纯 SFT 模型？
4. GRPO 在 R1 训练中替代了什么组件？为何适合此场景？

## 九、演进与趋势

R1 之后，社区掀起「RL 后训练推理」浪潮：用可验证奖励做推理 RL、把长思考蒸馏进小模型成为标配。趋势是更便宜的 RL（无需独立 critic）、更稳的格式奖励，以及把推理能力与工具调用、检索深度融合。蒸馏让端侧/单卡跑强推理模型成为可能，也催生大量第三方复现（如 TinyZero 验证小模型上 RL 涌现）。

## 十、小结

DeepSeek-R1 证明了「RL 自我进化推理」路线可行：R1-Zero 显示纯 RL 可涌现长链推理，R1 用冷启动 SFT + 多阶段 RL 兼顾可读性与能力，蒸馏则把推理行为迁移到小模型。其开源权重与配方极大推动了类 o1 推理模型的普及，是后训练范式的重要转折，标志着「推理能力可由 RL 而非仅数据驱动」的新阶段。
