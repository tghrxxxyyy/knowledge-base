# KTO无需配对数据的优势

> 对应 Ethayarajh et al. 2024《KTO: Model Alignment as Prospect Theoretic Optimization》、Ouyang et al. 2022《Training Language Models to Follow Instructions with Human Feedback》（InstructGPT）、Rafailov et al. 2023《Direct Preference Optimization》，以及线上反馈数据工程实践（datawhalechina/llm-universe 一类教程）。

## 一、背景与挑战

偏好对齐的数据瓶颈从来不是算法，而是**数据形态**。RLHF 与 DPO 都要求形如 $(x, y_w, y_l)$ 的三元组：同一个 prompt、两条输出、一个明确的优劣判断。要得到这样的三元组，需要标注者同时看到两条回答并做比较，成本远高于"给单条回答打分"。

而现实系统中自然产生的是另一类数据：用户点了个赞、把回答复制走了、中途点了"重新生成"、把工单标记为"未解决"、代码执行失败、数学题答案与标准答案不符、安全审核命中规则。这些都是**针对单条输出的二元或连续信号**，不含任何"同一 prompt 下的另一条输出"。

传统做法是把这些单条信号硬凑成配对：随机取一个高分输出与一个低分输出组成一对。这会引入两个问题：一是**分布错配**，配对的 $y_w$ 与 $y_l$ 来自不同 prompt，难度、主题、长度都不同，模型学到的可能是"识别简单 prompt"而非"识别更好的回答"；二是**浪费数据**，一条好的正样本只能用一次，且没有与之天然对应的负样本。KTO 的价值正在于直接消费这类非配对反馈。

## 二、核心原理

KTO 之所以不需要配对，是因为它把监督信号从"两条输出的相对关系"改为"单条输出相对于参照点的绝对水平"。

具体链条是：

1. 用参考模型 $\pi_{\mathrm{ref}}$ 定义参照点，隐式奖励为 $r_\theta(x,y) = \beta\log\frac{\pi_\theta(y|x)}{\pi_{\mathrm{ref}}(y|x)}$，它衡量的是"当前策略相对于参考模型有多偏好这条输出"。
2. 每条样本带一个可取性标签 $d \in \{0,1\}$，构成独立的监督信号：可取样本应使 $r_\theta$ 超过正阈值，不可取样本应使 $r_\theta$ 低于负阈值。
3. 损失函数对每条样本独立计算后求期望，**不存在跨样本的耦合项**，因此样本之间不需要任何配对关系，也不需要来自同一 prompt。

这个结构带来三个直接优势：

- **数据利用率高**：每一条反馈都是一条训练样本，无需等待配对的另一半。
- **覆盖长尾**：那些只被回答过一次、没有可对比输出的 prompt 也能进入训练集。
- **天然适配线上流式反馈**：新产生的点赞/点踩可以直接入库，无需离线重新配对。

## 三、形式化与数学基础

设数据集为 $\mathcal{D} = \{(x_i, y_i, d_i)\}_{i=1}^{N}$，其中 $d_i \in \{0,1\}$ 表示可取性。与 DPO 的 $\mathcal{D}_{\mathrm{DPO}} = \{(x_i, y_{w,i}, y_{l,i})\}$ 相比，这里**不要求存在另一个 $i'$ 使得 $x_{i'} = x_i$**。

KTO 的目标为逐样本损失的期望：

$$
\mathcal{L}_{\mathrm{KTO}} = \frac{1}{N} \sum_{i=1}^{N} u\big( r_\theta(x_i, y_i); d_i \big)
$$

其中

$$
u(r; d) = \begin{cases}
\max\left(0,\ m_{\mathrm{desirable}} - r\right), & d = 1 \\
\max\left(0,\ r + m_{\mathrm{undesirable}}\right), & d = 0
\end{cases}
$$

由于 $\mathcal{L}$ 对样本可加，**样本之间完全解耦**。这是"无需配对"的严格数学表述：目标函数中不存在形如 $(y_w, y_l)$ 的交叉项。

对比 DPO 的梯度：

$$
\nabla \mathcal{L}_{\mathrm{DPO}} \propto -\sigma(\hat{r}_l - \hat{r}_w) \cdot \beta \big[ \nabla\log\pi_\theta(y_w|x) - \nabla\log\pi_\theta(y_l|x) \big]
$$

可以看到它天然依赖同一 prompt 下的两项做差。若把不同 prompt 的样本强行配对，则

$$
\nabla \propto \nabla\log\pi_\theta(y^{+}|x_1) - \nabla\log\pi_\theta(y^{-}|x_2), \quad x_1 \neq x_2
$$

此时梯度中混杂了"让 $x_1$ 这类 prompt 的回答概率整体上升"与"让 $x_2$ 这类 prompt 的回答概率整体下降"两个效应，而非纯粹的质量比较。用难度因子可表达为：观测奖励 $r$ 中混杂了 prompt 难度项 $\delta(x)$：

$$
r(x, y) = q(y \mid x) + \delta(x)
$$

成对做差可消去 $\delta(x)$（因为 $x$ 相同），而跨 prompt 配对无法消去，从而引入偏差：

$$
\hat{r}_w - \hat{r}_l = \big(q_w - q_l\big) + \big(\delta(x_1) - \delta(x_2)\big)
$$

第二项即为噪声。KTO 通过阈值而非配对来定义目标，虽然也保留 $\delta(x)$ 的影响（这是它的代价，见"KTO局限与适用场景"），但避免了显式的错配噪声。

**数据量的收益**可以量化：设收集到 $M$ 条单条反馈，若强行配对，可用的配对数上界为 $\min(M_+, M_-)$（正负类中较小者）；而 KTO 可用全部 $M$ 条。当正负严重不平衡时，收益比为

$$
\frac{M}{\min(M_+, M_-)} = 1 + \frac{\max(M_+, M_-)}{\min(M_+, M_-)}
$$

## 四、代码实现

```python
# 把线上日志直接转成 KTO 数据：无需配对，逐条打标即可
def build_kto_samples(logs, good_threshold=4):
    # logs: 每条含 prompt、completion 与反馈信号
    samples = []
    for rec in logs:
        score = rec.get("score")                  # 例如 1-5 星
        copied = rec.get("copied", False)         # 用户复制了回答
        regenerated = rec.get("regenerated", False)
        executed_ok = rec.get("exec_ok")          # 代码/工具执行结果

        # 多信号融合成二元可取性标签；规则应按业务校准
        if executed_ok is not None:
            desirable = bool(executed_ok)         # 可验证任务优先用确定性信号
        elif score is not None:
            desirable = score >= good_threshold
        else:
            desirable = copied and not regenerated

        samples.append({
            "prompt": rec["prompt"],
            "completion": rec["completion"],
            "label": desirable,
        })
    return samples
```

```python
# 检查正负比例，若严重失衡需在损失中加权
def balance_report(samples):
    n_pos = sum(1 for s in samples if s["label"])
    n_neg = len(samples) - n_pos
    return {
        "total": len(samples),
        "positive": n_pos,
        "negative": n_neg,
        "pos_ratio": n_pos / max(len(samples), 1),
        "minority_ratio": min(n_pos, n_neg) / max(len(samples), 1),
    }
```

```python
# 与 DPO 数据形态的直接对比
dpo_pair = {
    "prompt": "解释 KV 缓存",
    "chosen": "KV 缓存随序列长度与批大小线性增长…",
    "rejected": "这个我不知道。",
}

kto_items = [
    {"prompt": "解释 KV 缓存", "completion": "KV 缓存随序列长度…", "label": True},
    {"prompt": "写快排", "completion": "用分治：选基准、划分、递归两侧。", "label": True},
    {"prompt": "翻译一句话", "completion": "我不理解这个问题。", "label": False},
]
# 注意：三个 KTO 样本来自三个不同 prompt，仍然全部可用
```

```python
# 去重与聚合：同一 (prompt, completion) 的多次反馈应聚合而非重复计入
def aggregate_feedback(samples):
    bucket = {}
    for s in samples:
        key = (s["prompt"], s["completion"])
        bucket.setdefault(key, []).append(s["label"])
    out = []
    for (p, c), labels in bucket.items():
        # 多数投票；票数相近的样本应丢弃以避免标签噪声
        vote = sum(labels) / len(labels)
        if 0.25 < vote < 0.75:
            continue
        out.append({"prompt": p, "completion": c, "label": vote >= 0.5})
    return out
```

## 五、与其他技术对比

| 维度 | DPO（需配对） | KTO（单条即可） |
|------|---------------|-----------------|
| 数据收集成本 | 高（需同 prompt 两条 + 比较） | 低（单条反馈即可） |
| 可用数据量 | $\min(M_+, M_-)$ 对 | $M$ 条 |
| 长尾 prompt 覆盖 | 差（难以凑成对） | 好 |
| 流式/在线反馈 | 需离线重新配对 | 直接入库 |
| 跨 prompt 配对噪声 | 存在（强行配对时） | 不存在 |
| 消除 prompt 难度混杂 | 能（同一 $x$ 做差） | 不能（依赖阈值） |
| 细粒度序关系 | 有 | 无 |

| 反馈信号 | 能否直接用于 KTO | 说明 |
|----------|------------------|------|
| 点赞/点踩 | 能 | 最直接的可取性标签 |
| 评分 1-5 星 | 能（需阈值化） | 阈值选择引入偏差 |
| 代码执行成功/失败 | 能，且质量高 | 可验证信号，噪声低 |
| 用户复制/重新生成 | 能（弱信号） | 需与其他信号融合 |
| 人工成对比较 | 能（拆成两条） | 会损失配对信息，建议改用 DPO |

## 六、常见误区

- **把不同 prompt 的样本强行配对当 DPO 用**：会引入 prompt 难度混杂，模型学到的是"识别简单问题"而非"识别好回答"。
- **忽略可取性阈值的选择偏差**：5 分制里"3 分算好还是算坏"会显著改变正负分布，应通过小规模人工校准确定。
- **认为 KTO 不需要任何标注**：它仍需每条样本带可取性标签，只是不需要成对。
- **重复反馈重复计入**：同一条回答被多次点赞会产生重复样本，应先聚合再去重。
- **只用点赞数据**：只有正样本会让模型退化为"提升所有输出概率"，必须保证负样本充足或做类别加权。
- **把强信号与弱信号等权混合**：代码执行结果远可靠于"用户是否复制"，应分层加权。
- **忽略反馈的选择偏差**：愿意点赞的用户本身就不具代表性，需评估样本代表性。

## 七、与开源书·权威来源对应

- Ethayarajh et al. 2024《KTO》：论文明确论证了在真实反馈（thumbs-up/down）场景下 KTO 的优势，并给出非配对数据的实验结果。
- Ouyang et al. 2022《InstructGPT》：定义了偏好数据收集流程，也暴露了成对标注的高成本，是 KTO 动机的现实背景。
- Rafailov et al. 2023《Direct Preference Optimization》：成对偏好的隐式奖励推导，用于对比"为何 DPO 需要配对"。
- Lee et al. 2023《RLAIF: Scaling RL from Human Feedback with AI Feedback》：另一种缓解标注成本的路径（用 AI 生成偏好），与 KTO 的"降低数据形态要求"形成互补。
- Hong et al. 2024《ORPO》与 Meng et al. 2024《SimPO》：进一步降低数据/参考模型要求的方法，可用于对比选型。
- HuggingFace TRL `KTOTrainer` 与 Datasets 文档：给出 prompt/completion/label 的数据格式要求（字段名以官方最新文档为准）；datawhalechina/llm-universe 一类教程提供了反馈数据工程的实践示例。

## 八、面试题

1. 为什么 KTO 可以用非配对数据？请从损失函数的可加性说明。
2. 把不同 prompt 的样本强行配对做 DPO，会引入什么偏差？用公式解释。
3. 线上点赞/点踩数据如何转成 KTO 训练样本？需要注意哪些偏差？
4. 只有正样本会发生什么？如何修正？
5. 同一条回答收到多次反馈应如何处理？
6. 可验证信号（如代码执行结果）与主观信号（如点赞）在构造数据时有何区别？
7. KTO 相比 DPO 在数据利用率上的收益如何量化？

## 九、演进与趋势

非配对反馈的价值正在被系统性挖掘。趋势上，一是**流式 KTO**：把线上反馈以流式方式持续回流训练，形成"部署—反馈—再训练"的闭环；二是**与在线探索结合**：主动采样多样性输出并收集单条反馈，既降低标注成本又提升覆盖；三是**多信号融合**：把可验证信号（执行结果、单元测）、行为信号（复制、停留时长、重生成）与显式评分分层加权；四是**偏差校正**：针对反馈的选择偏差做重要性加权与逆倾向评分；五是**与配对方法混合**：同一批数据同时计算 KTO 与 DPO 项，按可用性加权，兼得两者优势。

## 十、小结

"非配对友好"是 KTO 最大的工程价值：它把对齐的数据门槛从"同 prompt 下的成对比较"降低到"每条输出带一个可取性标签"，使点赞/点踩、执行结果、审核结论等自然产生的信号都能直接用于训练。数学上，这源于目标函数对样本的**可加性**——不存在跨样本耦合项；代价是失去了同一 prompt 做差所能消除的难度混杂。实践中应做好三件事：用可验证信号优先构造标签、聚合同一输出的多次反馈、保证正负类别平衡或加权。把 KTO 与线上反馈闭环结合，往往比追求更复杂的算法带来更大收益。
