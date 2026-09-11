# self-RAG 与检索对齐评测

> 对应 Asai et al. 2023《Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection》、Lewis et al. 2020 RAG。

## 一、背景与挑战

并非所有问题都需检索：事实型、时效性强的问答需要外部知识，而闲聊、主观表达则不需要。传统 RAG 对所有查询无差别地检索，既浪费算力，又会把无关或噪声文档混入上下文，反而降低答案质量。Self-RAG 提出让模型**自适应决定何时检索、检索什么、以及如何批判自身生成**，随之而来的新问题是：如何评测这套「自我决策」系统的对齐质量？

核心评测难点在于：决策正确性（该检索时是否检索、不该检索时是否跳过）与最终事实性要同时被衡量，且决策标签往往需人工标注或模型辅助标注。

## 二、核心原理

Self-RAG 训练模型在生成时输出特殊反射标记（reflection tokens），分为两类：

- **检索决策标记**（Retrieve）：`[Retrieve]=Yes / No / Continue`，控制是否调用检索。
- **批判标记**（Critique）：`[IsSup]=Grounded`、`[NoAttr]=No hallucination`、`[Utility]=5` 等，用于自评事实性与有用性。

评测据此拆成两层：

1. **决策层**：检索决定是否与金标一致（该检索却跳过 = 漏检；不该检索却检索 = 冗余）。
2. **事实层**：最终答案在决策正确的前提下，事实性是否被批判标记为可靠。

只有两层同时达标，才算「检索对齐」良好。

工程实践中，Self-RAG 的训练需要同时构造「检索决策」与「批判」两类监督信号，常用「用检索增强生成的结果反标反射标记」的方式蒸馏得到。部署时，反射标记还可作为可解释性接口：运维可观察模型「为何检索」「是否自认无依据」，比黑盒 RAG 更易诊断与信任。需注意，反思标记本身由模型生成，可能存在「过度自信的批判」，因此评测集里应保留对批判准确性的独立校验，防止自我评估失真。

## 三、形式化与数学基础

设对第 i 个生成步，模型预测检索决策 \hat{y}_i，金标为 y_i ∈ {Yes, No, Continue}。检索决策准确率：

$$
R = \frac{1}{N}\sum_{i=1}^{N} \mathbb{1}[\hat{y}_i = y_i]
$$

事实性由批判标记聚合，设第 j 个 claim 的 grounded 概率为 g_j，整体事实分：

$$
F = \frac{1}{|C|}\sum_{c \in C} g_c
$$

端到端对齐可加权：Score = α·R + (1−α)·F，α 由任务对「决策成本 vs 事实质量」的偏好决定。

## 四、代码实现

```python
# 检索决策准确率评测（示意）
def retrieve_accuracy(pred_flags, gold_flags):
    # pred_flags / gold_flags: 每步的检索决策序列
    correct = sum(1 for p, g in zip(pred_flags, gold_flags) if p == g)
    return correct / max(1, len(gold_flags))

# 事实性批判聚合
def fact_score(claims):
    # 每个 claim 由评判模型给出 grounded 概率
    return sum(c.grounded_prob for c in claims) / max(1, len(claims))

def selfrag_score(R, F, alpha=0.5):
    return alpha * R + (1 - alpha) * F
```

## 五、与其他技术对比

- **固定 RAG**：对所有查询统一检索，简单但浪费且易引入噪声；Self-RAG 自适应更省检索且更准。
- **标准 RAG 评测（仅看答案）**：忽略决策正确性，无法区分「碰巧答对」与「正确决策后答对」。
- **端到端 RLHF**：可优化最终质量，但不显式评测检索决策标签，难以诊断问题。

## 六、常见误区

- **误区一：只评最终答案**——会放过「乱检索碰对」或「该检索却跳过」的系统性错误。
- **误区二：把噪声检索当增益**——检索到的文档若未被真正引用，反而稀释上下文。
- **误区三：决策标签靠规则猜**——应用金标或强模型标注，否则评测失真。
- **误区四：批判标记即真相**——评判模型自身也会误判，需抽样人工校验。

## 七、与开源书·权威来源对应

- Asai et al. 2023《Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection》（arXiv）。
- Lewis et al. 2020《Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks》（RAG 原论文）。
- HuggingFace 相关 RAG / 评测文档；lm-evaluation-harness 检索任务。
- 具体评分协议以 Self-RAG 官方实现与论文附录为准。

## 八、面试题

- 如何评测模型「是否该检索」？决策准确率怎么算？
- Self-RAG 的反射标记有哪些？各自作用？
- 为什么只评最终答案不足以衡量检索对齐？
- 决策层与事实层如何加权成一个分数？

上线 Self-RAG 类系统后，监控重点应从「答案准确率」扩展到「决策健康度」：持续统计检索触发率、批判标记分布与拒答率，及时发现「过度检索」（噪声增多）或「该检索却跳过」（幻觉上升）的漂移。可把这些信号接入自动评测流水线（见事实性自动评测流水线章节），一旦决策准确率 R 跌破阈值即告警。把反思标记本身当作可观测指标，能让运维在用户感知之前定位对齐退化。

## 九、演进与趋势

把决策标记作为可训练奖励信号（融入 RLHF / DPO），让「何时检索、是否引用」成为对齐目标；同时探索更细粒度的逐步批判与检索多样性控制。具体方案以官方最新论文与代码为准。

## 十、小结

Self-RAG 把检索从「无条件动作」变为「可反思的决策」。其评测必须同时覆盖检索决策准确率与事实性批判，才能真实刻画系统的检索对齐水平。
