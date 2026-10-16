# LlamaIndex 核心概念

> 官方文档：https://docs.llamaindex.ai/ ｜ 仓库：https://github.com/run-llama/llama_index ｜ 入门书：datawhale《llm-universe》第 3 章“构建知识库问答”

## 一、背景与挑战

假设你有一堆自己的文档——产品手册、课程讲义、公司制度——想做一个“问什么都能答”的问答机器人。直接把整本文档塞给大模型行不通：上下文窗口有限，塞不下；就算塞得下，模型也容易在长文本里“看花眼”，答非所问。

于是就有了 RAG（检索增强生成）：先把文档切成小块、建好索引，用户提问时只取出最相关的几块，连同问题一起交给模型。**LlamaIndex 就是专门为这条流水线设计的框架**，它把“接入数据 → 切分建索引 → 检索 → 生成回答”封装成一套可插拔的组件。

对入门者来说，挑战主要有三个：概念多（Document、Node、Index、Retriever、QueryEngine 一大堆英文名词）；链路长（从文件到回答中间有五六个环节）；参数杂（分块大小、相似度算法该选哪个）。本文的目标就是给这些概念建立一个统一的心智模型，让你 20 行代码跑通最小链路，再谈细节。

## 二、核心原理

可以把 LlamaIndex 想象成一座**图书馆**：

- **Document（文档）**：一本本完整的书。你读进来的 PDF、Word、网页各是一本 Document。
- **Node（节点）**：把书撕成的一页页。太长的书没法整本借阅，检索时真正流通的单位是“页”。Node 就是切分后的小块，通常还带 `start_node/end_node/prev_next` 等指针，方便找回上下文。
- **Index（索引）**：图书馆的卡片目录。最常见的 VectorIndex 把每个 Node 转成向量存起来；提问时用向量相似度快速找到最相关的几页。除此之外还有 ListIndex（顺序罗列）、TreeIndex（层级汇总）、KeywordTableIndex（按关键词）等结构。
- **Retriever（检索器）**：按目录查书的馆员。它拿着你的问题去 Index 里取回 top-k 个 Node。
- **QueryEngine（查询引擎）**：一站式借阅台 = Retriever + Response Synthesizer。先检索，再把取出的内容和问题拼给大模型，生成最终回答。
- **Response Synthesizer（响应合成器）**：决定“怎么把材料组织成答案”，比如 `compact`（拼成一段）、`summary`（逐段总结）。

整条链路是：**文件 → Document → 切分 → Node → 建 Index → Retriever → QueryEngine → 回答**。记住这句话，八成的概念题就有了骨架。

## 三、要点形式化

用最小的伪代码把链路钉死（这一步可以看作对上一节的“形式化”）：

```text
Documents = load_files(paths)          # 加载
nodes    = split(Documents, size=512)  # 切分成 Node
index    = VectorStoreIndex(nodes)     # 建向量索引
retriever = index.as_retriever(top_k=3)# 检索器：取回 3 块
engine   = index.as_query_engine()     # 查询引擎 = 检索 + 合成
answer   = engine.query("报销流程是什么？")
```

判断一道题属于哪一层：问“数据怎么进来”是 Ingestion；问“块怎么切”是 Node/Splitter；问“怎么存怎么查”是 Index/Retriever；问“答案怎么生成”是 QueryEngine/Synthesizer。

再补两个入门期最常碰到的细节。其一，**向量存在哪里**：入门用的 `VectorStoreIndex` 默认存在内存里，进程一关就没了，所以持久化几乎是必做项；生产环境则换成独立向量库（Chroma、Milvus、pgvector 等），LlamaIndex 只负责读写它们。其二，**检索不止看相似度**：`similarity_top_k` 取 3 还是 10，直接决定送进模型的材料量——取太少可能漏掉关键句，取太多则混入噪声、还费 token。一个务实的调法是：先打印每次命中的原文，人工判断“该中的中了没”，再微调 k 值与切分大小，这比背参数口诀有效得多。

## 四、代码实现（最小可运行链路）

```python
# pip install llama-index openai
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader

# 1. 读取 ./data 目录下所有 txt/md/pdf，得到 Document 列表
docs = SimpleDirectoryReader("./data").load_data()

# 2. 切分并建索引（内置自动切分，入门先用默认参数）
index = VectorStoreIndex.from_documents(docs)

# 3. 生成查询引擎并提问
engine = index.as_query_engine(similarity_top_k=3)
print(engine.query("公司的年假有几天？"))
```

进阶一步：把索引持久化到本地，避免每次重建。

```python
from llama_index.core import StorageContext, load_index_from_storage
import os

if not os.path.exists("./storage"):           # 首次建索引并保存
    index.storage_context.persist(persist_dir="./storage")
else:                                          # 之后直接加载
    storage = StorageContext.from_defaults(persist_dir="./storage")
    index = load_index_from_storage(storage)
```

常见操作要点：自定义切分用 `SentenceSplitter(chunk_size=512, chunk_overlap=50)`；想看检索命中了什么，用 `engine.retrieve("问题")` 打印 Node 原文——**排查“答得不对”时，先看检索有没有取对，再怪模型**。

## 五、与其他方案对比

| 维度 | LlamaIndex | LangChain | 裸调 OpenAI API |
|------|-----------|-----------|-----------------|
| 定位 | RAG/数据索引专精 | 通用链式编排 | 无框架直连 |
| 上手速度 | 最小链路 5 行 | 组件多、概念多 | 最可控但全手写 |
| 索引结构 | Vector/Tree/KG 等丰富 | 以向量库封装为主 | 自己造 |
| 适合场景 | 个人知识库、文档问答 | 多步 Agent、工具编排 | 学习原理、极简服务 |

经验法则：**做“查资料再回答”选 LlamaIndex；做“多步流程+工具调用”选 LangChain；两者可混用**（LlamaIndex 的 QueryEngine 可以作为工具挂进 LangChain/LangGraph）。

## 六、常见误区

1. **检索不准就调模型**：九成问题是切分太大/太小或 top_k 不合适，先打印命中的 Node 再说。
2. **chunk_size 越大越好**：块太大稀释相关性，还浪费上下文；入门 256–512 token 起步即可。
3. **以为 Index 会自动更新**：文档变了要重新 `insert` 或重建索引，否则查到的还是旧内容。
4. **忽略 embedding 一致性**：换了 embedding 模型必须全量重建向量，混用会得到乱序的相似度。
5. **把 QueryEngine 当数据库**：它每次都实时检索+生成，有延迟有成本，高频问答应加缓存。

## 七、与开源书对应

- llm-universe 第 3 章“构建知识库问答”：https://github.com/datawhalechina/llm-universe —— 对应本文二、四节（向量检索 + RAG 链路）。
- 官方“Learn”教程（Starter Tutorial）：https://docs.llamaindex.ai/getting_started/starter_example/ —— 对应第四节的最小代码。
- llm-course “RAG” 部分：https://github.com/mlabonne/llm-course —— 对应第五节的方案选型。

## 八、面试题/上手题

1. **Document 和 Node 的区别？** 要点：Document 是完整数据源，Node 是检索的最小单位，带切分位置与前后指针。
2. **QueryEngine 由哪两部分组成？** 要点：Retriever（召回）+ Response Synthesizer（组织答案）。
3. **用户说“答案对但没引用来源”，怎么排查？** 要点：检索是否命中正确块 → 合成器是否带 `source_nodes` → 是否开了引用模式。
4. **动手题：把 chunk_size 从默认改成 128 和 1024 各建一次索引，比较同一问题的命中块与答案质量。** 要点：体会“太碎丢上下文、太整丢精度”的权衡。

## 九、演进与趋势

早期 LlamaIndex 以“索引结构动物园”著称；近两年重心明显转向三点：**一是 Agentic RAG**——让 Agent 决定何时检索、检索几次、要不要改写问题；**二是与 LlamaCloud/解析服务结合**，把 PDF 表格解析这类脏活外包；**三是作为组件生态融入 LlamaParse + 各类向量库（Milvus、Qdrant、pgvector）的标准化接入**。对入门者而言，趋势的启示是：索引结构的花活在变少，**数据解析质量与检索评估（RAGAS 等指标）的重要性在上升**——建好索引后，学会用“召回率、忠实度”量化效果，比背更多索引类型更有用。

## 十、小结

LlamaIndex 的心智模型一句话：**文档切成 Node，Node 编成 Index，Retriever 负责找，QueryEngine 负责答**。入门路线是——先用 20 行代码跑通最小链路，再学会打印检索结果定位问题，最后才碰调参和高级索引。把“图书馆借书”的比喻记住，新概念大多能挂到已有骨架上；RAG 做得好不好，往往不取决于框架功能多少，而取决于你有没有认真对待切分、检索这两个朴素环节。
