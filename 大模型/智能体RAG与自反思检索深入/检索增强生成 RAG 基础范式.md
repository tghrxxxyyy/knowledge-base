# 检索增强生成 RAG 基础范式

> 对应 Lewis et al. 2020《Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks》及开源仓库 run-llama/llama_index。

## 一、背景与挑战
纯参数化语言模型把知识压缩进权重，难以更新、易遗忘长尾事实且不可溯源。RAG 引入外部非参数记忆（文档库），在生成时动态检索相关证据。

## 二、核心原理
RAG 由检索器（encoder + 向量库）与生成器（seq2seq/LLM）组成。给定查询，检索器返回 Top-k 文档，生成器以查询加文档为条件产出答案。训练时可端到端微调检索与生成，或仅用冻结检索器做推理期拼接。

## 三、形式化与数学基础
检索概率与生成概率边缘化文档 z：
$p_\theta(y \mid x) = \sum_{z \in \text{top}_k} p_\eta(z \mid x)\, p_\theta(y \mid x, z)$
其中 $p_\eta(z \mid x) = \text{softmax}(\text{sim}(E_q(x), E_d(z)))$ 为检索分布，sim 常取内积或余弦。

## 四、代码实现
```python
def rag_generate(query, index, llm, k=3):
    hits = index.search(embed(query), k)
    ctx = "\n".join(h.text for h in hits)
    prompt = f"基于以下资料回答：\n{ctx}\n\n问题：{query}"
    return llm.complete(prompt)
```

## 五、与其他技术对比
相较微调，RAG 知识可热更新、可溯源、训练成本低；相较长上下文模型，RAG 用检索替代超长窗口，降低算力。缺点是检索质量直接决定上限，且拼接噪声会误导生成。

## 六、常见误区
误区一：检索越多越好，实则过多无关片段稀释注意力。误区二：认为 RAG 能消除全部幻觉，检索缺失时模型仍会编造。

## 七、与开源书/权威来源对应
- Lewis et al. 2020 提出 DPR 检索器 + BART 生成器的 RAG 架构。
- run-llama/llama_index 是当前最主流的 RAG 编排框架。
- stanford-futuredata/ColBERT 提供延迟交互检索器实现。

## 八、面试题
1. RAG 中检索器与生成器如何联合训练？
2. 检索分布 top-k 边缘化与直接拼接有何理论差别？
3. 如何衡量 RAG 相比纯生成带来的收益？

## 九、演进与趋势
从「检索-拼接-生成」走向模块化：查询改写、重排、压缩、自反思、图谱检索共同构成 RAG 流水线，并向 Agentic RAG 演进。

## 十、小结
RAG 把参数化记忆与非参数化记忆结合，是构建可溯源、可更新大模型应用的基础范式。
