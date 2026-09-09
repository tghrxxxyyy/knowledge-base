# RAG 应用开发实战

> 对应 llm-universe「构建 RAG 应用」；理论基石为 RAG（Lewis et al. 2020），工程框架参考 LangChain / LlamaIndex。

## 一、背景与挑战

RAG（检索增强生成）让模型在回答时「先查资料再回答」，缓解幻觉、注入私域知识、支持可追溯。但「拼起来就能用」只是 demo，生产里切分粒度、检索质量、重排、生成约束任一环节出问题，都会让答案错误或漏答。

挑战：(1) 文档切分影响召回——太大噪声多、太小丢上下文；(2) 检索不准导致喂错资料；(3) 生成时模型不「忠实」于检索内容；(4) 多文档/多轮下的上下文组织；(5) 必须可评测定位瓶颈在检索还是生成。

## 二、核心原理

完整链路：加载 → 切分 → 嵌入 → 入库 → 检索 → 拼提示 → 生成 → 后处理。关键工程件：

- 切分策略：按语义/标题/固定窗口+重叠，保留元数据。
- 检索：向量召回 + 元数据过滤，可选混合检索。
- 重排：cross-encoder 对候选精排，最相关置顶。
- 提示拼装：把检索片段与问题组合，显式要求「仅依据上下文」。
- 后处理：引用标注、去重、脱敏。

LangChain/LlamaIndex 提供端到端封装，但生产常需自研切分、重排与评估等关键件。

## 三、形式化与数学基础

给定查询 $q$ 与知识库片段 $\{d_i\}$，检索得上下文：

$$\mathcal{C}_q = \text{TopK}_i\, \text{sim}(E(q), E(d_i))$$

加过重排后记为 $\mathcal{C}'_q$。生成目标为条件概率：

$$\hat a = \arg\max_{a} P_\theta(a \mid q, \mathcal{C}'_q)$$

「忠实度（faithfulness）」衡量生成 $\hat a$ 是否可由 $\mathcal{C}'_q$ 推导，常用 NLI 或 LLM-judge 打分为 $F\in[0,1]$，理想 $F\to 1$。

## 四、代码实现

用 LlamaIndex 风格的最小 RAG（示意）：

```python
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader

docs = SimpleDirectoryReader("./data").load_data()
index = VectorStoreIndex.from_documents(docs)   # 切分+嵌入+入库
query_engine = index.as_query_engine(similarity_top_k=4)
ans = query_engine.query("公司年假政策是什么？")
print(ans.response)
```

进阶：替换 `node_parser`（语义切分）、加 `reranker`、接评测驱动开发跑 faithfulness。

## 五、与其他技术对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| 微调模型 | 隐性知识 | 训练贵、难更新 |
| 纯提示(无检索) | 简单 | 易幻觉、无私域 |
| RAG | 可更新、可追溯 | 检索质量敏感 |
| RAG+微调 | 兼得 | 成本最高 |

大多数私域问答首选 RAG。

## 六、常见误区

- 切分过大或过小，召回噪声或上下文断裂。
- 不做重排，最相关片段排不到最前，模型忽略。
- 不约束生成，模型凭参数知识而非检索内容回答（不忠实）。
- 不上评测，无法判断是检索差还是生成差。
- 把整篇文档一次性塞入上下文，超出窗口又无摘要。

## 七、与开源书·权威来源对应

- RAG 论文（Lewis et al. 2020, Retrieval-Augmented Generation）。
- llm-universe「动手搭建 RAG 应用」：https://datawhalechina.github.io/llm-universe/
- 本知识库「大模型与 NL2SQL / Schema 检索与上下文」「向量检索集成」「评测驱动开发」章节。

## 八、面试题

- 一个最小可用 RAG 应用需要哪些模块？
- 检索质量差时，应优化切分、嵌入还是重排？
- 如何衡量 RAG 答案的「忠实度」？
- 如何定位是检索失败还是生成失败？

## 九、演进与趋势

从「向量检索+生成」到「高级 RAG」：查询改写、多跳检索、自省检索（答案不足再查）、混合检索与重排；GraphRAG 引入知识图谱；以及把评测驱动（见评测驱动开发）用于端到端质量门禁。长上下文模型也带来「缓存全部文档」的新权衡。

## 十、小结

RAG 把「检索」与「生成」结合，是落地私域问答的主路径。其质量由切分、检索、重排、生成约束四环共同决定，务必先建评测定位瓶颈，再针对性优化，而非盲目堆砌框架。
