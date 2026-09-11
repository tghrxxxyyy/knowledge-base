# KTO实现与超参数调优

> 对应 Ethayarajh et al. 2024《KTO: Model Alignment as Prospect Theoretic Optimization》、Rafailov et al. 2023《Direct Preference Optimization》，以及 HuggingFace TRL 的 `KTOTrainer`（参数名与默认值以官方最新文档为准）。

## 一、背景与挑战

KTO 的公式看起来简单，但真正落地时，效果差异几乎全部来自超参与工程细节。相比 DPO 只有一个核心超参 $\beta$，KTO 至少多出三个旋钮：正阈值、负阈值、以及正负样本的权重比例。这三个旋钮与 $\beta$ 相互耦合，形成一个四维的调参空间，凭直觉设置极易失败。

典型失败现象有三类：训练跑完但人工评测毫无变化（多数样本落在无梯度区）；训练极不稳定、生成质量崩坏（阈值过小导致所有样本满梯度，等价于无约束的概率提升）；输出明显变长或格式漂移（逐样本目标缺少长度归一化）。此外，工程上还有两个坑：对数概率的计算口径（求和还是平均、是否包含 prompt）必须与参考模型严格一致，否则隐式奖励会带系统性偏移；参考模型必须与策略模型使用**完全相同**的分词与拼接方式。

## 二、核心原理

**$\beta$ 的作用。** $\beta$ 同时做两件事：缩放隐式奖励 $r = \beta\log(\pi_\theta/\pi_{\mathrm{ref}})$，以及控制隐式 KL 约束强度。$\beta$ 越大，同等概率变化带来的奖励变化越大，分布偏移的"阻力"也越大；$\beta$ 越小，奖励变化越平缓，需要更大的概率变化才能跨过阈值。

**阈值的作用。** 阈值定义了参照点：可取样本要跨过 $m_{\mathrm{desirable}}$，不可取样本要低于 $-m_{\mathrm{undesirable}}$。只有当样本处于"未达标"状态时才产生梯度，因此阈值直接决定**有多少样本参与训练**以及**训练到什么程度停止**。

**正负权重的作用。** 真实数据往往不平衡。TRL 一类实现通常提供 desirable/undesirable 的加权系数，用于在类别不平衡时重新校准两侧的损失贡献。

**学习率与训练轮次。** KTO 通常在 SFT 模型基础上训练 1 个 epoch 左右即可，学习率显著低于 SFT（常见量级为 $10^{-7}$ 到 $10^{-6}$，具体需按模型规模与 $\beta$ 实验确定）。过长训练会导致过拟合与生成退化。

## 三、形式化与数学基础

**$\beta$ 与 KL 的关系。** DPO 的理论推导表明，最优策略满足

$$
\pi^\ast(y \mid x) = \frac{1}{Z(x)} \pi_{\mathrm{ref}}(y \mid x) \exp\left( \frac{1}{\beta} r^\ast(x, y) \right)
$$

因此 $\beta$ 越小，最优解越偏离参考模型（允许更大的 KL）。KTO 沿用同一参数化，这一关系仍然成立。

**阈值与 $\beta$ 的耦合。** 由于 $r = \beta \Delta$（其中 $\Delta = \log\pi_\theta - \log\pi_{\mathrm{ref}}$），阈值条件 $r \ge m$ 等价于

$$
\Delta \ge \frac{m}{\beta}
$$

即真正起作用的是比值 $m/\beta$。这意味着**单独调 $\beta$ 而不同步调阈值，等价于改变了有效阈值**。调参时应固定其中一个、扫描另一个，或直接扫描比值。

**无梯度区比例**（最重要的诊断量）：

$$
\rho_{\mathrm{active}} = \frac{1}{N}\sum_{i=1}^{N} \mathbb{1}\Big[ (\lambda_i = 1 \wedge r_i < m_{\mathrm{des}}) \ \vee\ (\lambda_i = 0 \wedge r_i > -m_{\mathrm{undes}}) \Big]
$$

训练初期应处于中等水平（例如 0.3~0.7 量级，具体需按任务实验），随训练推进逐渐下降。若初始值接近 0，说明阈值过松或 $\beta$ 过大；若接近 1，说明阈值过紧或 $\beta$ 过小。

**类别平衡的加权。** 设正样本数 $n_+$、负样本数 $n_-$，平衡加权为

$$
w_+ = \frac{n_+ + n_-}{2 n_+}, \qquad w_- = \frac{n_+ + n_-}{2 n_-}
$$

使得两侧期望贡献相等：$\mathbb{E}[\ell_{\mathrm{balanced}}] = \tfrac{1}{2}\mathbb{E}[\ell_+] + \tfrac{1}{2}\mathbb{E}[\ell_-]$。

**长度归一化。** 若用序列对数概率之和，长序列的 $|r|$ 天然更大，模型可通过"变长"来跨过阈值。改用平均对数概率：

$$
\bar{\ell}(y \mid x) = \frac{1}{|y|}\sum_{t=1}^{|y|} \log \pi_\theta(y_t \mid x, y_{<t})
$$

则隐式奖励变为长度无关的量（这一点与 SimPO 的思路相通）。

**梯度幅度**也值得监控：

$$
\|\nabla_\theta \mathcal{L}\| = \beta \left\| \sum_{i \in \mathcal{A}} \pm \nabla_\theta \log \pi_\theta(y_i \mid x_i) \right\|
$$

其中 $\mathcal{A}$ 为活跃样本集合。$\mathcal{A}$ 过小时梯度稀疏，过大时梯度过强，两者都会损害稳定性。

## 四、代码实现

```python
# 完整可用的 KTO 训练骨架（简化版，便于理解数据流）
import torch
import torch.nn.functional as F
from transformers import AutoModelForCausalLM, AutoTokenizer

def build_inputs(tok, prompt, completion, max_len=1024):
    # 关键：prompt 与 completion 的拼接方式必须与参考模型完全一致
    p_ids = tok(prompt, add_special_tokens=False)["input_ids"]
    c_ids = tok(completion, add_special_tokens=False)["input_ids"] + [tok.eos_token_id]
    ids = (p_ids + c_ids)[:max_len]
    # labels 只对 completion 部分计算损失，prompt 位置置 -100
    labels = ([-100] * len(p_ids) + c_ids)[:max_len]
    return {"input_ids": ids, "labels": labels}

def seq_logp(logits, labels):
    # logits: [B, T, V]；labels: [B, T]
    log_probs = torch.log_softmax(logits[:, :-1], dim=-1)
    tgt = labels[:, 1:].clone()
    mask = (tgt != -100)
    tgt = tgt.masked_fill(~mask, 0)
    gathered = log_probs.gather(-1, tgt.unsqueeze(-1)).squeeze(-1)
    return (gathered * mask).sum(-1), mask.sum(-1)
```

```python
# 带类别平衡与长度归一化的 KTO 损失
def kto_loss_balanced(policy_logp, policy_len, ref_logp, ref_len,
                      desirable_mask, beta=0.1, m_pos=1.0, m_neg=1.0,
                      length_normalize=False):
    if length_normalize:
        p = policy_logp / policy_len.clamp(min=1)
        r_ref = ref_logp / ref_len.clamp(min=1)
    else:
        p, r_ref = policy_logp, ref_logp

    r = beta * (p - r_ref)

    n_pos = desirable_mask.sum().clamp(min=1)
    n_neg = (~desirable_mask).sum().clamp(min=1)
    w_pos = (n_pos + n_neg) / (2.0 * n_pos)
    w_neg = (n_pos + n_neg) / (2.0 * n_neg)

    loss_pos = F.relu(m_pos - r) * desirable_mask * w_pos
    loss_neg = F.relu(r + m_neg) * (~desirable_mask) * w_neg
    return (loss_pos + loss_neg).mean(), r
```

```python
# 训练循环：同时记录诊断量，便于调参
def train_kto(policy, ref, tok, batches, optimizer, beta=0.1,
              m_pos=1.0, m_neg=1.0, log_every=10):
    for step, batch in enumerate(batches):
        out = policy(**batch["inputs"])
        p_logp, p_len = seq_logp(out.logits, batch["labels"])

        with torch.no_grad():
            ref_out = ref(**batch["inputs"])
        r_logp, r_len = seq_logp(ref_out.logits, batch["labels"])

        loss, r = kto_loss_balanced(
            p_logp, p_len, r_logp, r_len,
            batch["desirable"], beta=beta, m_pos=m_pos, m_neg=m_neg,
        )

        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(policy.parameters(), 1.0)
        optimizer.step()

        if step % log_every == 0:
            # 诊断：活跃比例过低说明阈值/beta 不匹配
            active = (((m_pos - r) > 0) & batch["desirable"]) | \
                     (((r + m_neg) > 0) & (~batch["desirable"]))
            print(f"step={step} loss={loss.item():.4f} "
                  f"r_mean={r.mean().item():.3f} r_std={r.std().item():.3f} "
                  f"active={active.float().mean().item():.3f}")
```

```python
# 使用 TRL 的 KTOTrainer（参数名以官方最新文档为准）
from trl import KTOConfig, KTOTrainer

cfg = KTOConfig(
    beta=0.1,                       # 隐式奖励尺度 / KL 强度
    learning_rate=5e-7,             # 显著低于 SFT
    per_device_train_batch_size=4,
    gradient_accumulation_steps=8,
    max_length=1024,
    max_prompt_length=512,
    num_train_epochs=1,             # 对齐阶段通常 1 轮足够
    logging_steps=10,
    bf16=True,
)
# 数据集需含 prompt / completion / label 字段，label 为布尔可取性
trainer = KTOTrainer(model=policy_model, ref_model=ref_model,
                     args=cfg, train_dataset=kto_ds, tokenizer=tok)
trainer.train()
```

## 五、与其他技术对比

| 超参 | KTO | DPO | 说明 |
|------|-----|-----|------|
| $\beta$ | 有 | 有 | 同为隐式奖励尺度与 KL 强度 |
| 正阈值 $m_{\mathrm{des}}$ | 有 | 无 | KTO 独有，决定可取样本的达标线 |
| 负阈值 $m_{\mathrm{undes}}$ | 有 | 无 | KTO 独有，体现损失厌恶 |
| 正负权重 | 有（类别平衡） | 无（天然配对） | KTO 需显式处理不平衡 |
| 学习率 | 低 | 低 | 量级相近，均远低于 SFT |
| 长度归一化 | 建议开启 | 可选 | KTO 更易出现冗长 |

| 现象 | 可能原因 | 调整方向 |
|------|----------|----------|
| loss 低但效果无变化 | 多数样本在无梯度区 | 减小 $\beta$ 或增大阈值 |
| 生成质量崩坏 | 所有样本满梯度、约束过弱 | 增大 $\beta$ 或减小阈值、降低学习率 |
| 输出明显变长 | 逐样本目标的长度偏差 | 开启长度归一化或长度惩罚 |
| 只学到"变好"不会"变坏" | 负样本太少 | 类别加权或补充负样本 |
| 训练初期即无梯度 | 参考模型与策略差距小、阈值过松 | 提高阈值紧迫性（减小阈值/调整 $\beta$） |

## 六、常见误区

- **$\beta$ 过大导致梯度消失**：$\beta$ 放大 $r$，使所有样本都跨过阈值，$m - r < 0$，梯度恒为零。
- **单独调 $\beta$ 不动阈值**：真正起作用的是 $m/\beta$，只调一端等价于悄悄改了阈值。
- **正负样本比例失衡未加权**：模型偏向多数类，表现为只会提升概率不会压制坏输出。
- **对数概率口径不一致**：策略与参考模型用了不同的拼接或长度口径，隐式奖励带系统偏移。
- **忽略参考模型的选择**：应与策略同源（通常是 SFT 后的模型），并在整个训练中保持冻结。
- **训练轮次过多**：对齐阶段过拟合会导致输出模式化、多样性下降。
- **只用 loss 判断收敛**：必须同时看 $\rho_{\mathrm{active}}$、$r$ 的分布与人工评测。

## 七、与开源书·权威来源对应

- Ethayarajh et al. 2024《KTO》：论文中给出 $\beta$ 与阈值的设置经验、数据构造要求以及与 DPO 的对比实验。
- Rafailov et al. 2023《Direct Preference Optimization》：隐式奖励参数化与 $\beta$ 的 KL 含义的理论来源，也是 $\pi^\ast \propto \pi_{\mathrm{ref}} e^{r/\beta}$ 这一关系的出处。
- Meng et al. 2024《SimPO: Simple Preference Optimization with a Reference-Free Reward》：长度归一化与免参考模型奖励的思路，可直接用于缓解 KTO 的冗长倾向。
- HuggingFace TRL `KTOTrainer` 与 `DPOTrainer` 官方文档与源码：给出实际参数名、默认值与数据字段要求（以官方最新文档为准）。
- Hong et al. 2024《ORPO》：另一种免参考模型的偏好优化实现，可与 KTO 的工程复杂度做对比。
- Ouyang et al. 2022《InstructGPT》与 Schulman et al. 2017《PPO》：提供 RLHF 路线的超参直觉（KL 系数、学习率量级），便于理解 $\beta$ 的语义。

## 八、面试题

1. $\beta$ 过大为什么会导致梯度消失？请用阈值条件说明。
2. 为什么真正起作用的是 $m/\beta$ 而不是单独的 $m$？
3. 如何判断 KTO 训练是否真的在推进？应监控哪些量？
4. KTO 为什么容易出现输出变长？有哪些工程手段缓解？
5. 正负样本不平衡会带来什么问题？如何加权修正？
6. 计算隐式奖励时，策略与参考模型需要注意哪些一致性？
7. 与 DPO 相比，KTO 多了哪些超参？调参顺序应如何安排？

## 九、演进与趋势

KTO 的调参正在从"手工网格搜索"走向"自适应与诊断驱动"。趋势上，一是**自动阈值搜索**：按训练前测得的奖励分布分位数设定初始阈值，使 $\rho_{\mathrm{active}}$ 落在目标区间；二是**动态阈值**：随训练推进逐步收紧或放松参照点，避免过早饱和；三是**正负样本重加权自动化**：按类别频率与标签置信度联合加权；四是**长度归一化成为标配**，与 SimPO 一类方法共享技术手段；五是**诊断指标标准化**，把活跃比例、$r$ 的分布漂移与 KL 距离纳入训练日志，使 KTO 的调参从玄学变为可控工程。

## 十、小结

KTO 调参围绕四个旋钮：$\beta$、正阈值、负阈值、正负权重。核心认知是——$\beta$ 与阈值以比值 $m/\beta$ 的形式共同起作用，不能单独调整；最重要的诊断量是"无梯度区比例" $\rho_{\mathrm{active}}$，而非 loss 本身。工程上必须保证策略与参考模型在对数概率口径上完全一致、开启类别平衡、并考虑长度归一化。实际落地建议：先用小学习率与单轮训练跑通基线，扫描 $\beta$ 与阈值的比值，再针对长度与类别不平衡做修正，最终以人工评测而非 loss 定夺。
