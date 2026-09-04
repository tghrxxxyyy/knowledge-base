# Self-RAG 自反思检索增强生成

> 对应 Asai et al. 2023《Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection》及开源仓库 run-llama/llama_index。

## 一、背景与挑战
标准检索增强生成（RAG）对所有查询无差别地检索固定数量片段，并把它们无条件拼入上下文，导致引入无关上下文、检索冗余或遗漏关键信息。Self-RAG 提出让模型在生成过程中自主决定何时检索、检索什么，并对自身输出进行反思式批评。

## 二、核心原理
模型训练出四种特殊标记：Retrieve（是否检索）、IsRel/IsSup/IsUse（反思评分）。生成时先预测 Retrieve 标记，若为真则从检索器取 k 篇文档，对每篇用 IsRel 判断是否相关，再生成带引用标记的内容，并用 IsSup/IsUse 评估支持度与有用性，最后以反思分数加权选择最优序列。

## 三、形式化与数学基础
给定输入 x，模型以自回归方式生成带反思标记的序列 y：
$y = \arg\max_{y'} P_\theta(y' \mid x, \text{critique}(y'))$
其中 critic 评分 $c \sim P_\phi(\cdot \mid x, y, d)$ 对相关性、支持度、可用性给出离散等级，最终目标为：
$\mathcal{L} = \sum_t \log P_\theta(y_t \mid y_{<t}, x) + \lambda \log P_\phi(c_t \mid x, y, d)$

## 四、代码实现
```python
def self_rag_step(model, x, retrieved, threshold=0.5):
    # 预测是否需要检索
    do_retrieve = model.predict_special(x, token="Retrieve")
    if do_retrieve:
        docs = retriever.search(x, top_k=5)
        rel = [model.critique(x, d, kind="IsRel") for d in docs]
        docs = [d for d, r in zip(docs, rel) if r > threshold]
    out = model.generate(x, context=docs)
    # 对生成结果做支持度反思
    sup = model.critique(x, out, docs, kind="IsSup")
    return out, sup
```

## 五、与其他技术对比
相比朴素 RAG（固定检索、无反思），Self-RAG 提升了事实性与抗噪声能力；相比 ReAct（仅用工具调用），Self-RAG 把反思嵌入生成标记流，可控性更强；代价是推理时需要多次调用 critic，延迟更高。

## 六、常见误区
误解一：以为 Self-RAG 完全不需要外部检索器，实际上 critic 与生成仍依赖检索器返回文档。误解二：把 IsSup 高等同于事实正确，它只衡量生成是否被检索内容支持，不保证知识本身无错。

## 七、与开源书/权威来源对应
- Asai et al. 2023 提出 Self-RAG 框架与反思标记训练。
- run-llama/llama_index 提供 self-reflection + 检索器组合的实现范式。
- Lewis et al. 2020 的 RAG 是前置检索范式基础。

## 八、面试题
1. Self-RAG 的四种特殊标记分别起什么作用？
2. critic 模型与生成模型能否共享参数，训练时如何避免冲突？
3. 在高并发线上场景如何降低反思带来的延迟？

## 九、演进与趋势
后续工作把反思从离散标记扩展到连续价值模型，并与 DPO 等偏好优化结合；同时出现将检索决策建模为强化学习策略（GRPO）的方向，使检索时机可端到端学习。

## 十、小结
Self-RAG 用自反思标记把「是否检索、是否相关、是否被支持」显式化为可学习信号，是 RAG 从被动拼接走向主动、可控生成的关键一步。
