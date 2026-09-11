# KTO与DPO对比深入

> 对应 Rafailov et al. 2023《Direct Preference Optimization》、Ethayarajh et al. 2024《KTO: Model Alignment as Prospect Theoretic Optimization》、Ouyang et al. 2022《InstructGPT》、Hong et al. 2024《ORPO》与 Meng et al. 2024《SimPO》。

## 一、背景与挑战

DPO 把 RLHF 简化为"直接在偏好数据上优化策略"，一经提出就成为对齐的主流选择。但它有一个硬约束：数据必须是成对的。KTO 则宣称"只需要知道每条输出好不好"。两者都基于同一个隐式奖励参数化，都免去了奖励模型与在线 RL，看起来非常相似，实践中却经常给出不同的结果。

问题在于，很多团队在两者之间做选择时依据的是直觉或论文中的单一榜单，而没有理解它们的**监督信号本质不同**：DPO 学的是"序"，KTO 学的是"水平"。这个差异决定了它们在数据形态、噪声鲁棒性、长度偏差、调参难度上的系统性区别。把它们混为一谈（例如认为"KTO 是 DPO 的推广，所以至少不差"）是常见的误用来源。

## 二、核心原理

**共同的基座：隐式奖励。** 两者都利用 DPO 推导出的关系——给定参考模型 $\pi_{\mathrm{ref}}$，带 KL 约束的 RL 最优解可写为

$$
\pi^\ast(y \mid x) \propto \pi_{\mathrm{ref}}(y \mid x) \exp\left( \frac{1}{\beta} r^\ast(x, y) \right)
$$

反解即得隐式奖励：

$$
r_\theta(x, y) = \beta \log \frac{\pi_\theta(y \mid x)}{\pi_{\mathrm{ref}}(y \mid x)}
$$

因此两者都不需要单独训练奖励模型，也不需要在线采样。

**DPO：对序建模。** 它把 Bradley–Terry 偏好概率代入隐式奖励，最大化 chosen 优于 rejected 的概率：

$$
\mathcal{L}_{\mathrm{DPO}} = -\mathbb{E}_{(x, y_w, y_l)} \left[ \log \sigma\left( r_\theta(x, y_w) - r_\theta(x, y_l) \right) \right]
$$

展开即

$$
\mathcal{L}_{\mathrm{DPO}} = -\mathbb{E}\left[ \log \sigma\left( \beta \log \frac{\pi_\theta(y_w \mid x)}{\pi_{\mathrm{ref}}(y_w \mid x)} - \beta \log \frac{\pi_\theta(y_l \mid x)}{\pi_{\mathrm{ref}}(y_l \mid x)} \right) \right]
$$

**KTO：对水平建模。** 它放弃成对比较，改为让每条输出的隐式奖励跨过（或低于）固定阈值：

$$
\mathcal{L}_{\mathrm{KTO}} = \mathbb{E}_{(x, y, d)} \left[ (1-d)\max(0, m_{\mathrm{des}} - r_\theta(x,y)) + d \max(0, r_\theta(x,y) + m_{\mathrm{undes}}) \right]
$$

（$\lambda$ / $d$ 的 0-1 约定在不同实现中可能相反，语义以具体实现为准。）

**本质差异**：DPO 的监督信号是**差**（$r_w - r_l$），KTO 是**绝对值**（$r$ 相对阈值）。

## 三、形式化与数学基础

**混杂因素的消除。** 设隐式奖励可分解为"质量项 + prompt 难度项"：

$$
r_\theta(x, y) = q_\theta(x, y) + \delta(x)
$$

DPO 对同一 prompt 做差：

$$
r_\theta(x, y_w) - r_\theta(x, y_l) = \big( q_\theta(x, y_w) - q_\theta(x, y_l) \big)
$$

$\delta(x)$ 被完全消去。KTO 直接使用 $r_\theta(x,y)$，$\delta(x)$ 保留在信号中：

$$
m_{\mathrm{des}} - r_\theta(x, y) = \big(m_{\mathrm{des}} - q_\theta(x, y)\big) - \delta(x)
$$

这意味着**同一阈值在不同难度的 prompt 上语义不同**：对"难题"，$\delta(x)$ 大，容易触发梯度；对"简单题"则相反。这是 KTO 需要类别加权与自适应阈值的根本原因，也是它相对 DPO 的信息劣势。

**噪声鲁棒性。** DPO 的梯度权重为 $\sigma(r_l - r_w)$，当一条配对被标错（事实上 $y_l$ 更好）时，模型仍会被推动去提升 $y_l$ 的概率，且梯度幅度不衰减。KTO 的阈值化带来"截断"：

$$
\frac{\partial \mathcal{L}_{\mathrm{KTO}}}{\partial r} = \begin{cases}
-\mathbb{1}[r < m_{\mathrm{des}}], & \text{可取样本} \\
+\mathbb{1}[r > -m_{\mathrm{undes}}], & \text{不可取样本} \\
0, & \text{否则}
\end{cases}
$$

一旦样本"已经足够好"或"已经足够坏"，梯度立即归零，不再被反复推拉。这是 KTO 对标签噪声更鲁棒的机制解释。

**长度偏差。** 若隐式奖励用序列对数概率**之和**，则 $|r|$ 随长度增长。DPO 做差时两条输出长度差异带来的偏置部分抵消（但仍存在，故有 SimPO 等工作提出长度归一化）；KTO 不对长度做差，长度偏差直接进入绝对值，因此更容易出现"变长即可跨阈值"的退化路径。

**梯度结构对照**。DPO：

$$
\nabla \mathcal{L}_{\mathrm{DPO}} \propto -\sigma(r_l - r_w)\,\beta\left[ \nabla\log\pi_\theta(y_w \mid x) - \nabla\log\pi_\theta(y_l \mid x) \right]
$$

KTO：

$$
\nabla \mathcal{L}_{\mathrm{KTO}} \propto \pm \beta \, \mathbb{1}[\text{未达标}] \, \nabla\log\pi_\theta(y \mid x)
$$

前者天然是"一推一拉"，后者是"单向推/拉且可能被截断"。这解释了为什么 KTO 更依赖类别平衡：若负样本稀少，"拉"的力几乎不存在。

**等价性**。严格来说二者**不等价**：DPO 的目标是最大化偏好似然，其最优解对应某个 KL 约束下的 RL 解；KTO 的目标是最大化阈值化效用，不存在对应的 BT 偏好模型。只有在极特殊设定下两者梯度方向才可能重合。因此"KTO 是 DPO 的推广"这一说法不成立。

## 四、代码实现

```python
# 两种数据形态：同一批标注可以分别喂给 DPO 与 KTO
dpo_pair = {
    "prompt": "用一句话解释什么是过拟合",
    "chosen": "过拟合是模型记住了训练集的噪声，导致在新数据上表现变差。",
    "rejected": "就是模型太复杂了。",
}

kto_items = [
    {"prompt": "用一句话解释什么是过拟合",
     "completion": "过拟合是模型记住了训练集的噪声，导致在新数据上表现变差。",
     "label": True},
    {"prompt": "用一句话解释什么是过拟合",
     "completion": "就是模型太复杂了。",
     "label": False},
]
# 关键区别：KTO 的两条样本即使来自不同 prompt 也能独立使用
```

```python
# DPO 损失：成对，做差后送进 logistic
import torch
import torch.nn.functional as F

def dpo_loss(policy_logp_w, policy_logp_l, ref_logp_w, ref_logp_l, beta=0.1):
    pi_logratios = policy_logp_w - policy_logp_l
    ref_logratios = ref_logp_w - ref_logp_l
    logits = pi_logratios - ref_logratios
    return -F.logsigmoid(beta * logits).mean()
```

```python
# KTO 损失：逐样本，相对固定阈值
def kto_loss(policy_logp, ref_logp, desirable_mask, beta=0.1,
             m_pos=1.0, m_neg=1.0):
    r = beta * (policy_logp - ref_logp)
    loss_pos = F.relu(m_pos - r) * desirable_mask
    loss_neg = F.relu(r + m_neg) * (~desirable_mask)
    return (loss_pos + loss_neg).mean()
```

```python
# 混合损失：同时消费配对与非配对数据
def mixed_loss(pair_batch, unpaired_batch, model, ref_model, beta=0.1,
               m_pos=1.0, m_neg=1.0, alpha=0.5):
    # alpha 控制 DPO 项权重；数据形态不同，需分别前向
    pw, pl, rw, rl = forward_pairs(model, ref_model, pair_batch)
    l_dpo = dpo_loss(pw, pl, rw, rl, beta=beta)

    plogp, rlogp, mask = forward_unpaired(model, ref_model, unpaired_batch)
    l_kto = kto_loss(plogp, rlogp, mask, beta=beta, m_pos=m_pos, m_neg=m_neg)
    return alpha * l_dpo + (1.0 - alpha) * l_kto, {"dpo": l_dpo.item(), "kto": l_kto.item()}
```

## 五、与其他技术对比

| 维度 | DPO | KTO |
|------|-----|-----|
| 监督信号 | 成对奖励**差** | 单样本奖励**水平** |
| 数据要求 | 同 prompt 的 chosen/rejected | 单条 + 可取性标签 |
| 消除 prompt 难度混杂 | 能 | 不能 |
| 细粒度序关系 | 有 | 无 |
| 标签噪声鲁棒性 | 中 | 较高（margin 截断） |
| 长度偏差 | 存在（部分抵消） | 更明显 |
| 超参数 | $\beta$ | $\beta$ + 双阈值 + 类别权重 |
| 调参难度 | 中 | 中高 |
| 数据利用率 | 受限于配对数 | 全部单条可用 |
| 典型适用 | 高质量成对偏好充足 | 线上单条反馈、无配对 |

| 方法 | 数据 | 参考模型 | 特点 |
|------|------|----------|------|
| PPO/RLHF | 成对偏好 | 有（KL 约束） | 最强但最复杂 |
| DPO | 成对偏好 | 有（隐式） | 离线、简洁 |
| KTO | 单条标签 | 有（隐式） | 非配对友好、抗噪 |
| ORPO | 成对偏好 | 无需 | 在 SFT 损失上加 odds ratio 项 |
| SimPO | 成对偏好 | 无需 | 长度归一化 + 奖励 margin |

## 六、常见误区

- **认为 KTO 是 DPO 的严格推广**：二者目标不同、梯度结构不同，不存在包含关系。
- **认为 KTO 不需要任何偏好标注**：它需要每条样本的可取性标签，只是不需要成对。
- **把配对数据拆成两条喂给 KTO 期待更好**：这浪费了配对中的序信息，通常不如直接用 DPO。
- **认为噪声多就该无脑用 KTO**：阈值化确实抗噪，但阈值设置不当时会直接停止学习。
- **忽略 KTO 的类别平衡**：DPO 天然一正一负，KTO 需要显式加权。
- **用 loss 数值跨方法比较**：两者损失量纲不同，不可直接比较。
- **认为二者可以随意切换而无需重调 $\beta$**：KTO 还需标定阈值，迁移时超参必须重新搜索。

## 七、与开源书·权威来源对应

- Rafailov et al. 2023《Direct Preference Optimization》：DPO 目标、隐式奖励推导与 $\beta$ 的 KL 含义。
- Ethayarajh et al. 2024《KTO》：KTO 目标、与 DPO 的对比实验、以及在非配对/混合数据上的表现。
- Ouyang et al. 2022《InstructGPT》：RLHF 三阶段范式，是 DPO 与 KTO 共同试图简化的对象。
- Hong et al. 2024《ORPO: Monolithic Preference Optimization without Reference Model》：另一种免参考模型的思路，用于理解"参考模型"这一组件是否必要。
- Meng et al. 2024《SimPO: Simple Preference Optimization with a Reference-Free Reward》：长度归一化与 margin 设计，对 KTO 的长度问题有直接借鉴价值。
- Lee et al. 2023《RLAIF》：在缺乏人工偏好时的补充路线。
- HuggingFace TRL（`DPOTrainer` / `KTOTrainer`）官方文档：两份实现并存，可直接比较数据格式与参数（以官方最新文档为准）。

## 八、面试题

1. DPO 与 KTO 的监督信号本质区别是什么？请写出两者的损失函数。
2. 为什么说 DPO 能消除 prompt 难度混杂而 KTO 不能？给出分解式。
3. KTO 为什么对标签噪声更鲁棒？用梯度截断解释。
4. KTO 比 DPO 更容易出现输出变长，原因是什么？
5. "KTO 是 DPO 的推广"这一说法为什么不对？
6. 什么情况下应该混合使用两者？混合权重如何确定？
7. 从 DPO 切换到 KTO，超参需要重新调整哪些？为什么？

## 九、演进与趋势

对比研究的走向是"取长补短"。一是**混合目标**：同一训练中同时计算 DPO 与 KTO 项，按数据可用性加权，使配对与非配对数据都能被利用；二是**课程式配对补充**：先用 KTO 消费海量单条反馈，再在关键子集上构造高质量配对做 DPO 精调；三是**长度归一化与 margin 设计**被两类方法共同采用（SimPO 的思路影响明显）；四是**免参考模型化**（ORPO、SimPO）降低工程复杂度，KTO 也可借鉴其奖励设计；五是**自适应阈值与自动加权**，缩小 KTO 在调参上的劣势。

## 十、小结

DPO 与 KTO 共享隐式奖励这一基座，却在监督信号上分道扬镳：DPO 建模"序"（$r_w - r_l$），能消除 prompt 难度混杂、保留细粒度偏好，但需要成对数据；KTO 建模"水平"（$r$ 相对阈值），抗噪、非配对友好、数据利用率高，但需要标定阈值与类别权重，且更易冗长。选型规则很直接：**有可靠成对偏好且需精细排序用 DPO；反馈以单条形式存在、缺乏配对用 KTO；两者兼备则混合**。无论选哪个，都不应跨方法比较 loss，最终以人工评测与业务指标裁决。
