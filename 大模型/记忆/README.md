# 记忆系统（以 Claude Code 与 OpenAI Codex 的记忆体系架构为例）

> 本模块整理自 Anthropic Claude Code 与 OpenAI Codex 的官方文档与公开深潜资料，聚焦「 coding agent 如何在会话之间保留上下文」这一工程问题。
>
> 核心一句话：**每个会话都从全新上下文窗口开始，「记忆」本质是启动时从磁盘读取一批 Markdown 文件注入 prompt 作为上下文参考**，而不是数据库或持久化状态机。

## 内容索引

| 文件 | 内容 | 形态 |
| --- | --- | --- |
| [01-总览与架构地图.md](./01-总览与架构地图.md) | 为什么需要记忆、记忆的两种性质、Claude Code 与 Codex 架构总览对比、本文范围 | 📝 文字 |
| [02-Claude-Code记忆架构.md](./02-Claude-Code记忆架构.md) | CLAUDE.md 四层作用域、加载合并规则、`.claude/rules/` 路径限定、Auto Memory、AGENTS.md 兼容 | 📝 文字 |
| [03-Codex记忆架构.md](./03-Codex记忆架构.md) | AGENTS.md 静态指令层、Memories 生成层、Claude vs Codex 关键差异 | 📝 文字 |
| [04-跨系统对比与落地建议.md](./04-跨系统对比与落地建议.md) | 三系统对比表（Codex CLI / Claude Memory / Gemini CLI）、落地清单与避坑 | 📝 文字 |

## 主要参考来源

- **Claude Code Memory 官方文档**：https://code.claude.com/docs/en/memory （中文版 https://code.claude.com/docs/zh-CN/memory）
- **OpenAI Codex Customization（AGENTS.md / Memories / Skills）**：https://developers.openai.com/codex/customization/overview
- **OpenAI Codex CLI Memory 深潜**：https://mer.vin/2025/12/openai-codex-cli-memory-deep-dive
- **How Memory Works in Codex CLI**：https://www.linkedin.com/pulse/how-memory-works-codex-cli-mem0-wuw1f

> ⚠️ 本模块为「官方文档整理 + 个人化注解」，非原创理论。文中所有路径、上限数值（如 32 KiB、200 行、25KB、6 小时、5 跳）、以及「自动记忆机器本地不云同步」等均为官方事实，原样保留，请勿篡改。
