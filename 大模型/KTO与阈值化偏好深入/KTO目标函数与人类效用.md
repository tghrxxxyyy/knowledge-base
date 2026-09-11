# KTO目标函数与人类效用

> 对应 Ethayarajh et al. 2024《KTO: Model Alignment as Prospect Theoretic Optimization》、Kahneman & Tversky 1979《Prospect Theory: An Analysis of Decision under Risk》，以及 Ouyang et al. 2022《Training Language Models to Follow Instructions with Human Feedback》（InstructGPT）。

## 一、背景与挑战

以 RLHF（InstructGPT）为代表的对齐流程需要三样东西：偏好数据、奖励模型、在线强化学习。DPO 简化了其中一环——把奖励模型与 RL 合并为一个离线损失函数，但它仍然要求数据以**成对**形式出现：同一个 prompt 下有一个 chosen 和一个 rejected。

现实中的反馈往往不是这样。产品日志里堆积的是单条信号：这条回答被点赞、那条回答被点踩、这道数学题做对了、这段 SQL 执行失败、用户中途停止生成、客服工单被标记为"需人工介入"。这些信号都是**逐条标注的可取性（desirability）**，而不是同一 prompt 下的严格排序。要把它们硬凑成 DPO 所需的配对，只能随机把不同 prompt 的"好"与"坏"配对，这会引入严重的分布错配与噪声。

KTO（Kahneman-Tversky Optimization）的出发点正是：既然人类对结果的评价本来就是"相对于参照点"而非"两两比较"，那就不如直接对**单条输出的人类效用**建模。

## 二、核心原理

KTO 建立在前景理论（Prospect Theory）的两个核心发现上：

1. **参照依赖（reference dependence）**：人判断一个结果是好是坏，取决于它相对于某个参照点的位置，而非绝对量。在 KTO 中，参照点由参考模型 $\pi_{\mathrm{ref}}$ 提供——一个输出的价值体现在它**相对参考模型有多大的改进**。
2. **损失厌恶（loss aversion）**：同样幅度的变差比变好更令人难以接受。KTO 通过对正负两侧使用不同阈值/权重来体现这种不对称。

具体地，KTO 沿用 DPO 的隐式奖励参数化，把奖励表示为策略与参考模型的对数比：

$$
r_\theta(x, y) = \beta \log \frac{\pi_\theta(y \mid x)}{\pi_{\mathrm{ref}}(y \mid x)}
$$

这里不需要单独训练奖励模型，$\beta$ 同时控制奖励尺度与对参考模型的（隐式）KL 约束强度。

然后对每个样本定义**阈值化的人类效用**：若样本被标记为可取（desirable），我们希望 $r_\theta$ 超过某个正阈值；若被标记为不可取，我们希望 $r_\theta$ 低于某个负阈值。落在阈值之间的样本视为"已经足够好/不值得再优化"，梯度被截断。

## 三、形式化与数学基础

设样本 $(x, y)$，可取性标签 $\lambda_y \in \{0, 1\}$（1 表示 desirable），隐式奖励 $z = r_\theta(x, y)$。KTO 的逐样本损失可写为

$$
\mathcal{L}_{\mathrm{KTO}}(x, y) = (1 - \lambda_y) \cdot \max\left(0,\ m_{\mathrm{desirable}} - z\right) + \lambda_y \cdot \max\left(0,\ z - m_{\mathrm{undesirable}}\right)
$$

（不同论文/实现对 $\lambda_y$ 的 0/1 约定可能相反，使用时以具体实现为准；语义统一为：可取样本惩罚"低于正阈值"，不可取样本惩罚"高于负阈值"。）

对应的**人类效用函数**为分段形式：

$$
u(z) = \begin{cases}
z - m_{\mathrm{desirable}}, & z \ge m_{\mathrm{desirable}} \\
z + m_{\mathrm{undesirable}}, & z \le -m_{\mathrm{undesirable}} \\
0, & \text{否则}
\end{cases}
$$

中间区间是"无梯度区"，这是 KTO 抗噪的来源之一：已经被充分优化或本就难以判断的样本不再贡献梯度。

整体目标是最大化期望效用，等价于最小化

$$
\mathcal{L} = \mathbb{E}_{x, y \sim \mathcal{D}} \left[ \mathcal{L}_{\mathrm{KTO}}(x, y) \right]
$$

与前景理论的价值函数对照，标准形式为

$$
v(\Delta) = \begin{cases}
\Delta^{\alpha}, & \Delta \ge 0 \\
-\lambda (-\Delta)^{\beta}, & \Delta < 0
\end{cases}
$$

其中 $\lambda > 1$ 即损失厌恶系数，$\alpha, \beta < 1$ 表示风险的边际敏感度递减。KTO 用**线性 + 阈值截断**近似这一曲线：阈值对应参照点，正负阈值的差异对应损失厌恶，截断对应"参照点附近不敏感"。

与 DPO 的关系可作如下对照。DPO 的梯度可以看作对"chosen 与 rejected 的奖励差"施加压力：

$$
\nabla_\theta \mathcal{L}_{\mathrm{DPO}} \propto -\sigma\left( \hat{r}(y_l) - \hat{r}(y_w) \right) \cdot \beta \left[ \nabla \log \pi_\theta(y_w \mid x) - \nabla \log \pi_\theta(y_l \mid x) \right]
$$

而 KTO 的梯度是逐样本的：

$$
\nabla_\theta \mathcal{L}_{\mathrm{KTO}} \propto \begin{cases}
-\beta \, \nabla_\theta \log \pi_\theta(y \mid x), & \text{可取样本且 } z < m_{\mathrm{desirable}} \\
+\beta \, \nabla_\theta \log \pi_\theta(y \mid x), & \text{不可取样本且 } z > -m_{\mathrm{undesirable}} \\
0, & \text{否则}
\end{cases}
$$

可以看到，KTO 把 DPO 中"成对的相对压力"拆成了"各自相对于固定阈值的压力"。

## 四、代码实现

```python
# KTO 核心：隐式奖励 + 阈值化效用损失
import torch
import torch.nn.functional as F

def implicit_reward(policy_logp, ref_logp, beta=0.1):
    # policy_logp / ref_logp: 形状 [batch]，为序列的对数概率之和
    return beta * (policy_logp - ref_logp)

def kto_loss(implicit_r, desirable_mask, m_pos=1.0, m_neg=1.0):
    # desirable_mask: bool 张量，True 表示该样本可取
    # 可取样本：奖励低于正阈值时产生惩罚
    loss_pos = F.relu(m_pos - implicit_r) * desirable_mask
    # 不可取样本：奖励高于负阈值时产生惩罚
    loss_neg = F.relu(implicit_r + m_neg) * (~desirable_mask)
    return (loss_pos + loss_neg)
```

```python
# 完整的一步训练：拿到策略与参考模型的对数概率后计算 KTO 损失
def kto_step(model, ref_model, batch, beta=0.1, m_pos=1.0, m_neg=1.0):
    # batch: {"input_ids":..., "labels":..., "desirable": bool 张量}
    out = model(**batch["inputs"])
    logp = sequence_logp(out.logits, batch["labels"])

    with torch.no_grad():
        ref_out = ref_model(**batch["inputs"])
        ref_logp = sequence_logp(ref_out.logits, batch["labels"])

    r = implicit_reward(logp, ref_logp, beta=beta)
    per_sample = kto_loss(r, batch["desirable"], m_pos=m_pos, m_neg=m_neg)
    return per_sample.mean()

def sequence_logp(logits, labels, mask_value=-100):
    # logits: [B, T, V]；labels: [B, T]，padding 位置为 -100
    log_probs = torch.log_softmax(logits[:, :-1], dim=-1)
    tgt = labels[:, 1:]
    mask = (tgt != mask_value)
    tgt = tgt.masked_fill(~mask, 0)
    token_logp = log_probs.gather(-1, tgt.unsqueeze(-1)).squeeze(-1)
    return (token_logp * mask).sum(dim=-1)
```

```python
# 观察有多少样本落在无梯度区——这是 KTO 调参的重要诊断量
@torch.no_grad()
def gradient_active_ratio(r, desirable_mask, m_pos=1.0, m_neg=1.0):
    pos_active = ((m_pos - r) > 0) & desirable_mask
    neg_active = ((r + m_neg) > 0) & (~desirable_mask)
    return (pos_active | neg_active).float().mean().item()
```

## 五、与其他技术对比

| 维度 | PPO/RLHF | DPO | KTO |
|------|----------|-----|-----|
| 数据形态 | 成对偏好（先训 RM） | 成对偏好 | 单条可取性标签 |
| 是否需要奖励模型 | 是 | 否（隐式） | 否（隐式） |
| 是否需要在线采样 | 是 | 否 | 否 |
| 参照点 | 奖励模型绝对值 | 成对奖励差 | 固定阈值（参考模型） |
| 抗噪性 | 中 | 中 | 较强（margin 截断） |
| 调优难度 | 高 | 中 | 中（多阈值超参） |
| 可利用线上单条反馈 | 否 | 否（需配对） | 是 |

## 六、常见误区

- **以为 KTO 完全不需要标注**：它仍需每条样本带"可取/不可取"标签，只是不需要成对。
- **阈值随意设 0**：阈值全为 0 会让效用退化为普通回归，失去参照依赖与抗噪特性。
- **忽略 $\beta$ 与阈值的耦合**：$\beta$ 缩放 $r$ 的整体尺度，因此阈值本质上应与 $\beta$ 一起标定。
- **把 KTO 当成 DPO 的严格推广**：二者目标函数不等价，梯度结构也不同，不能假设"KTO 至少不差于 DPO"。
- **不监控无梯度区比例**：若绝大多数样本梯度为 0，训练实际上停滞，loss 却显示很低。
- **正负样本严重失衡**：真实日志往往正样本远多，需要重加权或重采样。
- **认为无需参考模型**：KTO 的参照点依赖 $\pi_{\mathrm{ref}}$，参考模型质量直接决定效用语义。

## 七、与开源书·权威来源对应

- Ethayarajh et al. 2024《KTO: Model Alignment as Prospect Theoretic Optimization》：KTO 目标函数、人类效用建模与实验结论的原始出处。
- Kahneman & Tversky 1979《Prospect Theory: An Analysis of Decision under Risk》：参照依赖、损失厌恶与价值函数形式的理论源头。
- Tversky & Kahneman 1992《Advances in Prospect Theory》：给出价值函数与概率权重的参数化形式。
- Rafailov et al. 2023《Direct Preference Optimization》：隐式奖励参数化 $r = \beta\log(\pi_\theta/\pi_{\mathrm{ref}})$ 的来源，KTO 沿用之。
- Ouyang et al. 2022《Training Language Models to Follow Instructions with Human Feedback》（InstructGPT）：RLHF 三阶段范式与偏好数据形态的奠基。
- HuggingFace TRL 的 `KTOTrainer`：官方参考实现，暴露 $\beta$、desirable/undesirable 权重与阈值相关配置（具体参数名以官方最新文档为准）。

## 八、面试题

1. KTO 为什么只需要单条数据？它用什么替代了成对比较中的"相对关系"？
2. 写出 KTO 的损失函数，并解释每个符号的含义。
3. 前景理论的两个核心发现是什么？KTO 分别用哪个机制体现？
4. KTO 与 DPO 的梯度结构有何不同？为什么说二者不等价？
5. 什么是"无梯度区"？它对训练有什么正面与负面影响？
6. 为什么 KTO 仍需要参考模型？参考模型质量差会怎样？
7. 线上日志中只有点赞/点踩，如何构造 KTO 训练数据？需要注意什么？

## 九、演进与趋势

KTO 代表了"把对齐损失与人类决策心理学对齐"这一方向。趋势上，一是**与长度控制结合**，缓解逐样本目标容易引发的冗长倾向；二是**多目标/多阈值 KTO**，对不同反馈类型（正确性、安全性、风格）设置不同参照点；三是**与成对损失混合**，用 $\mathcal{L} = \mathcal{L}_{\mathrm{KTO}} + \alpha \mathcal{L}_{\mathrm{DPO}}$ 同时消费两类数据；四是**自适应阈值**，按训练进度或分位数动态调整参照点，避免过早进入无梯度区；五是**在线/流式 KTO**，把线上反馈持续回流到训练中（可与 ORPO、SimPO 一类免参考模型方法形成对比）。

## 十、小结

KTO 的本质是把对齐目标从"学一个奖励模型 + 做 RL"或"拟合成对偏好概率"，改写为"最大化人类对单条输出的效用"。它用参考模型提供参照点、用阈值实现参照依赖与损失厌恶、用 margin 截断获得抗噪性。理解它的关键是三个公式：隐式奖励 $r = \beta\log(\pi_\theta/\pi_{\mathrm{ref}})$、分段效用 $u(z)$、以及逐样本阈值损失。落地时最需要监控的是"无梯度区比例"与正负样本平衡，而不是只看 loss 数值。
