# 长文档 RAG

> 对应 Lewis et al., *Retrieval-Augmented Generation* (RAG), 2020；参考 LlamaIndex、LangChain 长上下文+RAG 文档与「lost in the middle」研究（Liu et al., 2023）。

## 一、背景与挑战

长上下文模型（如 128K/1M token）兴起后，一个自然问题：「既然能整本文档塞进上下文，还要 RAG 吗？」答案仍是**需要**。原因：(1) 成本——长上下文每次推理显存/算力随长度线性至平方增长，昂贵；(2) lost-in-the-middle——超长上下文中部信息易丢失，模型反而用不好；(3) 超长仍需截断——真实知识库远超窗口；(4) 可溯源——RAG 天然给出引用片段，便于核查。RAG 与长上下文不是替代，而是互补。

## 二、核心原理

RAG 流程：把长文档切片/结构化（段落、父子块、或更细的句子窗口）→ 向量库检索最相关片段 → 拼入 prompt 交给 LLM 生成，并附引用。长上下文则负责**整合**：当单问题需跨多片段推理时，可放宽检索数量、用长窗口把更多候选一并送入。两者结合范式是「**RAG 召回 + 长上下文整合**」：先检索缩小范围（省成本、提精度），再用长上下文做最终多片段综合。检索质量决定上限，生成质量决定下限。

## 三、形式化与数学基础

设知识库切块 $\{c_1,\dots,c_M\}$，查询 $q$，检索 top-$k$：

$$C_q = \mathrm{TopK}_{c\in\mathcal{D}}\ \mathrm{sim}\!\big(\mathrm{enc}(q),\ \mathrm{enc}(c)\big),\quad |C_q|=k$$

生成条件概率（RAG）：

$$p(y\mid q)\propto \sum_{c\in C_q} p(y\mid q,c)\, p(c\mid q)$$

长上下文整合则一次性输入 $C_q$（$k$ 更大）让模型联合推理。检索上限由召回来界定：

$$\text{Recall}@k = \frac{|\{c^\star\}\cap C_q|}{|\{c^\star\}|}$$

其中 $c^\star$ 为含答案的真块。长上下文在这一步降低对 $k$ 的敏感度，但无法弥补检索遗漏。

## 四、代码实现

```python
from llama_index.core import VectorStoreIndex, Settings
from llama_index.llms.ollama import Ollama

docs = SimpleDirectoryReader("long_book/").load_data()
index = VectorStoreIndex.from_documents(docs)        # 切块+向量化
query_engine = index.as_query_engine(
    similarity_top_k=8,                              # 检索 8 块
    llm=Ollama(model="llama3.1:70b", context_window=128000),  # 长上下文整合
)
resp = query_engine.query("本书关于 X 的核心论点是什么？")
print(resp.response, resp.source_nodes)             # 附引用，可溯源
```

长文档可用「句子窗口检索 + 父块回填」提升精度，再交长上下文模型综合。

## 五、与纯长上下文对比

| 维度 | 纯长上下文 | RAG |
|---|---|---|
| 成本 | 高（随长度） | 低（仅检索段） |
| 中部召回 | 易丢失 | 稳（检索置前） |
| 超长库 | 需截断 | 无限扩展 |
| 可溯源 | 弱 | 强 |
| 综合推理 | 强 | 依赖检索质量 |

## 六、常见误区

- 认为长上下文取代 RAG：它更贵、易 lost-in-middle，且超长仍需截断。
- 检索质量差就靠长上下文补：检索遗漏的，再长也救不回。
- 只塞整文档不检索：窗口浪费、噪声大、精度反降。
- 忽略 chunk 策略：过大漏细节、过小失上下文，需父子/句子窗口。

## 七、与开源书·权威来源对应

- Lewis et al., *RAG*, 2020（NeurIPS）。
- Liu et al., *Lost in the Middle*, 2023（长上下文位置偏差）。
- LlamaIndex / LangChain 长上下文+RAG 集成文档。

## 八、面试题

1. 有 100 万 token 上下文为何还需 RAG？答：成本高、中部易丢失、超长库仍截断、且 RAG 可溯源；检索缩小范围更准更省。
2. RAG 与长上下文如何结合？答：RAG 召回相关片段，长上下文做多片段整合推理。
3. 检索决定什么？答：决定能力上限，遗漏的真块再长上下文也补不回。

## 九、演进与趋势

走向「RAG + Agentic 检索 + 长上下文」：先检索、再让 Agent 自主决定是否需要更多片段/重检索，最后长上下文综合并给出引用。自研重排（rerank）与多向量表示进一步提升召回上限。

## 十、小结

长上下文不是 RAG 的替代品，而是补充。最佳实践是「RAG 召回 + 长上下文整合」：检索保证成本可控与可溯源、缩小范围提精度，长窗口负责多片段综合推理。检索质量始终决定上限。
