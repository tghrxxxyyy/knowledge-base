# RAG（检索增强生成，Retrieval-Augmented Generation）

> 本模块整理自 Anthropic Cookbook、Anthropic 官方博客、生产实践文章与开源指南，聚焦「如何让大模型在回答时先用检索补足知识」。定位为后端工程师的学习笔记：重管线、重参数、重可评估，少谈玄学。

RAG 的核心一句话：**从知识库检索出与问题相关的片段，拼接在用户提问之前，从而扩展模型「可见」的上下文**——把「模型该知道但没记住」的东西，在推理时临时喂给它。

## 内容索引

| 文件 | 内容 | 形态 |
| --- | --- | --- |
| [01-概述与基础管线.md](./01-概述与基础管线.md) | RAG 是什么、何时需要/不需要、基础管线、分块策略、嵌入与向量库 | 📝 文字 |
| [02-进阶检索技术.md](./02-进阶检索技术.md) | 上下文检索、混合检索、重排序、查询变换、六种 RAG 模式 | 📝 文字 |
| [03-评估与最佳实践.md](./03-评估与最佳实践.md) | RAGAS 评估、cookbook 结论、Prompt Caching、落地清单与避坑 | 📝 文字 |

## 主要参考来源

- **Anthropic Cookbook《Retrieval Augmented Generation》**：https://deepwiki.com/anthropics/anthropic-cookbook/5-retrieval-augmented-generation
- **Anthropic《Contextual Retrieval》博客（上下文检索）**：https://www.anthropic.com/news/contextual-retrieval （若不可达，可用 https://2048ai.net/69a912220a2f6a37c595345a.html 的梳理作补充，但原始来源为 Anthropic）
- **RAG 生产最佳实践（2026）**：https://devstarsj.github.io/2026/03/22/rag-retrieval-augmented-generation-production-best-practices-2026
- **dair-ai/Prompt-Engineering-Guide（含 RAG 章节）**：https://github.com/dair-ai/Prompt-Engineering-Guide

> ⚠️ 本模块为「整理 + 个人化注解」，非原创理论。文中所有百分比（49% / 67% / 10–20% / 81% vs 71% / 512 / 20 万 token / 500 页）均来自上述来源，原样保留；**具体效果因你的数据、模型与检索实现而异，请以你自己的评测为准**。
