# RAG 总体架构

> 对应 Datawhale llm-universe（动手学大模型应用开发）与 mlabonne/llm-course「RAG」。RAG = 检索 + 生成，用外部知识补足模型参数知识的时效性与专业性。

## 一、背景与挑战

大语言模型的参数知识存在「时效上限」与「私有知识盲区」：训练截止后发生的事件不知道，企业内部文档也不可能进训练集。同时，纯生成式模型容易「自信地编造」。检索增强生成(Retrieval-Augmented Generation)在生成前先从外部知识库检索相关证据，拼入上下文，让模型「基于证据作答」，从而缓解幻觉、支持私有/实时知识。

核心挑战：

- 检索召回率直接决定天花板，检索不到正确片段后续无力回天。
- 检索到的上下文若含噪声会稀释注意力。
- 离线索引与在线检索需保证语义一致性。
- 多跳/聚合问题单次检索往往不够。

## 二、核心原理

RAG 标准分为离线-在线两阶段：

```
离线：文档 → 清洗解析 → 切片 → 嵌入 → 存入向量库
在线：查询 → 嵌入 → 检索 Top-k → (可选重排) → 拼上下文 → LLM 生成
```

在线阶段把检索片段与用户问题拼成 prompt，要求模型「仅基于给定上下文」生成，并尽量给出引用。检索质量与生成质量相乘决定最终效果，工程上检索往往是瓶颈。现代 RAG 还在这两阶段间插入查询变换、混合检索、重排、后处理等增强模块。

## 三、形式化与数学基础

给定查询 $q$ 与文档集 $D$，RAG 把生成概率改写为条件于检索结果的形式：

$$p(y\mid q) = \sum_{d\in \mathrm{TopK}(D,q)} p(d\mid q)\, p(y\mid q, d)$$

即对每个检索片段 $d$ 计算生成分布再加权融合。其上限由检索器 $p(d\mid q)$ 的召回能力决定——这正是「检索是瓶颈」的形式化表达。若正确片段不在 TopK，则 $p(y\mid q)$ 中不包含正确答案项。

## 四、代码实现

```python
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings

# 离线建库
vectordb = Chroma.from_documents(docs, HuggingFaceEmbeddings())
# 在线检索 + 生成
ctx = vectordb.similarity_search(query, k=4)
prompt = f"基于上下文回答：\n{ctx}\n\n问题：{query}"
answer = llm(prompt)
```

## 五、与其他技术对比

| 痛点 | RAG 解法 | 微调解法 |
|------|----------|----------|
| 知识过时 | 检索最新文档 | 需重训 |
| 领域私有 | 检索企业资料 | 继续预训练 |
| 幻觉 | 引用可溯源片段 | 难溯源 |
| 长尾知识 | 检索补足 | 难覆盖 |

## 六、常见误区

- 把 RAG 当「万能药」，忽视检索召回率这一根本瓶颈。
- 上下文塞太多无关片段反而稀释注意力，得不偿失。
- 离线嵌入与在线嵌入用不同模型/参数，导致空间错位。
- 高估单次检索，对多跳/聚合问题未做查询变换。
- 未记录引用，使答案不可溯源、难调试。

## 七、与开源书·权威来源对应

- Datawhale llm-universe：https://github.com/datawhalechina/llm-universe
- mlabonne/llm-course「RAG」：https://github.com/mlabonne/llm-course#llm-engineer
- Lewis et al. 2020「RAG」原始论文。

## 八、面试题

- RAG 相比直接微调模型，在知识更新上有何优势？
- RAG 效果差，应先调检索还是先调生成？为什么？
- RAG 的概率形式如何说明「检索是瓶颈」？

## 九、演进与趋势

从「一次性向量检索」演进为「查询变换 + 混合检索 + 重排 + 后处理」的完整管线，并进一步走向 GraphRAG、Agentic RAG(自适应多轮检索)、与长上下文模型协同。检索与生成的边界正在模糊化、融合化，模块化 RAG 让各增强组件可插拔组合。

## 十、小结

RAG 以「检索 + 生成」两阶段补足 LLM 的时效与私有知识短板。其质量 = 检索质量 × 生成质量，工程上应以检索召回为先、以评估驱动迭代，并按需叠加查询变换、重排等增强模块。
