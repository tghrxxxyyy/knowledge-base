# 上下文工程（Context Engineering）

> 上下文工程是在 LLM 采样时包含的所有 token 的「策划与维护」学科，是提示词工程的自然演进。本模块整理 Anthropic 官方工程实践与社区指南，作为后端工程师视角的学习笔记。
>
> 内容立场：上下文工程不是「把更多内容塞进窗口」，而是**用最少的高信号 token 最大化期望结果**。

## 内容索引

| 文件 | 内容 | 形态 |
| --- | --- | --- |
| [01-概述.md](./01-概述.md) | 什么是上下文工程、与提示词工程的区别、为什么重要 | 📝 文字 |
| [02-核心原理与杠杆.md](./02-核心原理与杠杆.md) | 上下文腐烂、核心原则、Anthropic 三大杠杆、子代理架构、按需上下文、token 高效工具 | 📝 文字 |
| [03-实战策略与选型.md](./03-实战策略与选型.md) | 三种杠杆适用场景对比、长上下文摆位、可套用清单、避坑 | 📝 文字 |

## 主要参考来源

- **Anthropic《Effective context engineering for AI agents》**：https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- **Anthropic Cookbook《Context engineering: memory, compaction, and tool clearing》**：https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools
- **dair-ai/Prompt-Engineering-Guide（含 context engineering 章节）**：https://github.com/dair-ai/Prompt-Engineering-Guide

> ⚠️ 本模块为「整理 + 个人化注解」，非原创理论。文中数字与机制均来自上述官方来源；具体效果因模型版本与任务而异。上下文工程与提示词工程是**互补**关系而非替代关系。
