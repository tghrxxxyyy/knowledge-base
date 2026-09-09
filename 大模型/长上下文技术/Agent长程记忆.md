# Agent 长程记忆与长上下文

> 对应 MemGPT（Packer et al., 2023）、检索增强生成 RAG（Lewis et al., 2020）以及 LangChain/LlamaIndex 的记忆模块设计。详见本系列「智能体工程/记忆」「检索增强 RAG」。

## 一、背景与挑战

Agent 在真实任务中往往要跨越**多轮对话、多步工具调用、多日任务**保持状态。LLM 上下文窗口有限且昂贵，把所有历史一股脑塞进 prompt 既浪费 token 又会被近端信息淹没。如何在不丢关键信息的前提下，控制上下文成本，是 Agent 长程记忆的核心命题。

挑战包括：
- **容量**：单轮上下文装不下长程全部经验。
- **检索**：需要时能准确取回相关记忆。
- **遗忘与优先级**：无关信息应被压缩/淘汰，关键事实须持久。
- **一致性**：记忆更新不能破坏既有正确知识。

## 二、核心原理

主流记忆范式有三种：

1. **上下文内记忆（in-context）**：直接把历史拼进 prompt。最简单，但受窗口与成本约束。
2. **外部检索记忆（RAG 式）**：把经验写入向量库，按需检索相关片段注入上下文，经济且可超长。
3. **分层/操作系统式记忆（MemGPT）**：把记忆分为「主上下文（快但小）」与「外部存储（大但慢）」，由模型自主决定何时把内容移入/移出，类似 OS 的虚拟内存分页。

此外还有**结构化记忆**（把关键信息抽取成 JSON/数据库）与**反思记忆**（让模型周期性总结沉淀）。

## 三、形式化与数学基础

检索式记忆依赖向量相似度。给定查询 $q$ 与候选记忆 $m_i$，取 Top-$k$：

$$
i^* = \text{top-}k_{i}\; \cos\big(E(q),\,E(m_i)\big)
$$

其中 $E(\cdot)$ 为嵌入模型。分层记忆可视为一个状态机：主上下文 $C$、外部存储 $S$，模型策略 $f_\theta$ 决定动作 $a\in\{\text{recall},\text{store},\text{discard}\}$：

$$
a = f_\theta(C, S, q)
$$

目标是最小化长期任务损失，同时约束上下文长度 $|C|\le L$。

## 四、代码实现

基于向量库的检索记忆（伪代码风格，使用 LlamaIndex）：

```python
from llama_index import VectorStoreIndex, SimpleDirectoryReader

docs = SimpleDirectoryReader("agent_logs/").load_data()
index = VectorStoreIndex.from_documents(docs)
retriever = index.as_retriever(similarity_top_k=5)

def answer_with_memory(query):
    hits = retriever.retrieve(query)          # 取回相关记忆
    context = "\n".join(h.node.get_content() for h in hits)
    return llm(f"参考记忆：\n{context}\n\n问题：{query}")
```

MemGPT 式则可让模型输出特殊工具调用，在「主上下文满」时触发把旧内容写入外部存储。

## 五、与其他技术对比

| 方案 | 容量 | 成本 | 检索精度 | 实现复杂度 |
|------|------|------|----------|-----------|
| 上下文内记忆 | 受限窗口 | 高 | 依赖注意力 | 低 |
| 向量检索记忆 | 近无限 | 低 | 受嵌入质量影响 | 中 |
| 分层记忆(MemGPT) | 近无限 | 中 | 模型自决 | 高 |
| 结构化记忆 | 取决于存储 | 低 | 高（精确查询） | 中 |

## 六、常见误区

- **「长上下文能替代向量记忆」**：长上下文装得下但注意力对远端易稀释，且成本随长度线性上升；检索更经济精准。
- **无差别写入所有历史**：噪声记忆会污染检索召回，应做摘要/去重/重要性打分。
- **忽视记忆的一致性更新**：直接覆盖可能丢失冲突但重要的旧事实。
- **把记忆当数据库却不做持久化**：仅放上下文，会话结束即丢。

## 七、与开源书·权威来源对应

- Packer et al., *MemGPT: Towards LLMs as Operating Systems*, 2023.
- Lewis et al., *Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks*, 2020.
- LangChain Memory 文档：https://python.langchain.com
- LlamaIndex 文档：https://docs.llamaindex.ai

## 八、面试题

- 长上下文能替代 Agent 的向量记忆吗？各自优劣？
- MemGPT 的「主上下文/外部存储」类比操作系统的什么机制？
- 检索记忆的召回质量由哪些因素决定？如何提升？
- 如何防止 Agent 记忆被无关历史污染？

## 九、演进与趋势

- **从拼接走向自主管理**：模型自己决定记忆的存/取/弃，减少人工规则。
- **多模态记忆**：除文本外，保存图像、工具结果、环境状态。
- **记忆与规划耦合**：记忆不仅回放，还用于反思、纠错与长期目标跟踪。
- **持久化与隐私**：跨会话记忆需考虑存储安全与用户可控的遗忘权。

## 十、小结

Agent 长程记忆是「上下文内 + 检索 + 分层 + 结构化」的混合系统。长上下文降低了记忆工程的门槛，但受成本与注意力稀释限制；真正可扩展的方案仍以外部检索与分层管理为核心，配合结构化与反思机制。具体选型以所用框架官方文档为准。
