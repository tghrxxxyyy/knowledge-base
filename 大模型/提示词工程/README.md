# 提示词工程（Prompt Engineering）

> 本模块整理自 GitHub 与各大模型厂商的公开官方文档，聚焦「如何写出高质量提示词」的通用技巧与模式，可作为日常与大模型（LLM）协作的速查手册。
>
> 内容立场：提示词没有「万能公式」，核心是**清晰、具体、给足上下文、用示例校准**，并针对具体模型迭代验证。

## 内容索引

| 文件 | 内容 | 形态 |
| --- | --- | --- |
| [01-概述.md](./01-概述.md) | 什么是提示词工程、为什么重要、主流资料来源 | 📝 文字 |
| [02-核心原则与最佳实践.md](./02-核心原则与最佳实践.md) | OpenAI 八条经验法则、Anthropic 最佳实践、Microsoft 4S 原则 | 📝 文字 |
| [03-提示技巧与模式.md](./03-提示技巧与模式.md) | 零样本/少样本、思维链、ReAct、XML 标签、角色设定、长上下文等 | 📝 文字 |
| [04-场景化实战与模板.md](./04-场景化实战与模板.md) | 代码生成、RAG、Agent/智能体、示例模板与避坑清单 | 📝 文字 |

## 主要参考来源（GitHub / 官方文档）

- **dair-ai/Prompt-Engineering-Guide**：https://github.com/dair-ai/Prompt-Engineering-Guide （最全面的开源提示词工程指南，含论文、Notebook、工具合集）
- **Anthropic Prompting Best Practices**：https://docs.anthropic.com/en/prompt-library/library
- **Anthropic 企业落地案例**：https://www.anthropic.com/news/prompt-engineering-for-business-performance
- **OpenAI 最佳实践**：https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-openai-api
- **OpenAI GPT-5 提示指南**：https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide/
- **Microsoft prompt-engineering**：https://github.com/microsoft/prompt-engineering （及 Learn 上的 4S 原则）

> ⚠️ 本模块为「整理 + 个人化注解」，非原创理论。文中标注的准确率/性能提升数据均来自上述厂商公开案例，具体效果因模型版本与任务而异，请以你自己的评测为准。
