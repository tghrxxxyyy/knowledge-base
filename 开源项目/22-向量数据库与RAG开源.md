# 开源项目精选：向量数据库与 RAG

> RAG（检索增强生成）依赖向量检索与编排框架。本文梳理向量数据库与 RAG 相关开源项目，便于选型学习。

## 1. 向量数据库

| 项目 | 特点 |
| --- | --- |
| Milvus | 大规模专用，分布式强 |
| Qdrant | Rust，易部署，过滤强 |
| Weaviate | 一体化，内置向量化 |
| Chroma | 轻量，原型友好 |
| pgvector | Postgres 内向量检索 |
| Elasticsearch | BM25+向量混合 |

## 2. RAG 框架

| 项目 | 用途 |
| --- | --- |
| LlamaIndex | 数据接入、索引、检索 |
| LangChain | 检索 + 生成管道 |
| Haystack | 生产级管道 |
| RAGFlow | 文档解析 + RAG |
| Dify | 低代码 LLM 应用平台 |

## 3. 评测与工具

| 项目 | 用途 |
| --- | --- |
| RAGAS | RAG 质量评测 |
| Tran| | 检索基准 |

## 4. 索引与算法

- **HNSW**：图索引，高召回低延迟（Milvus/Qdrant 默认）。
- **IVF + PQ**：压缩，省内存。
- **Flat**：暴力精确，小数据校验。

## 5. 混合检索

- 向量（语义）+ BM25（关键词）融合（RRF）。
- Elasticsearch / Weaviate 原生支持。

## 6. 选型建议

- 原型：Chroma + LlamaIndex。
- 生产（大规模）：Milvus / Qdrant + LangChain。
- 已有 PG：pgvector 平滑起步。
- 文档重：RAGFlow。

## 7. 落地要点

- 分块策略（256~512 token，重叠）。
- 嵌入模型固定版本。
- 重排（Rerank）提升精度。
- 评测闭环（RAGAS）。

## 8. 注意

- 以官方最新文档为准，版本差异大。
- 数据合规与脱敏。

## 9. 小结

向量库（Milvus/Qdrant/Chroma）+ RAG 框架（LlamaIndex/LangChain）+ 评测（RAGAS）构成 RAG 技术栈。选对组合 + 分块/重排/评测三件套，是 RAG 质量保障关键。
