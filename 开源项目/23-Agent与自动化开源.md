# 开源项目精选：Agent 与自动化

> 从对话机器人到自主 Agent，开源生态提供了丰富的构建块。本文归类介绍 Agent 框架、自动化与工具调用相关开源项目。

## 1. Agent 框架

| 项目 | 特点 |
| --- | --- |
| LangGraph | 状态机/图编排，可控可持久化 |
| AutoGen | 多 Agent 协作对话 |
| CrewAI | 角色化团队 |
| MetaGPT | 多角色软件公司模拟 |
| AgentScope | 阿里，多 Agent |

## 2. 工具与协议

| 项目 | 用途 |
| --- | --- |
| MCP (Model Context Protocol) | 工具/资源统一协议 |
| LangChain Tools | 工具集成集 |
| Composio | 第三方工具/SaaS 连接 |

## 3. 自动化与工作流

| 项目 | 用途 |
| --- | --- |
| n8n | 可视化工作流自动化 |
| Apache Airflow | 数据管道编排 |
| Temporal | 长流程持久工作流 |

## 4. 记忆与检索

- 向量库（见向量库专题）做长期记忆。
- LlamaIndex 的 Memory / 自定义 KV 存储。

## 5. 评测与可观测

- LangSmith / Phoenix（Arize）：Agent trace 与评测。
- 自研日志 + 成本统计。

## 6. 选型建议

- 原型/学习：LangChain + AutoGen。
- 可控生产：LangGraph。
- 业务角色流：CrewAI / MetaGPT。
- 工作流自动化：n8n / Temporal。

## 7. 安全提醒

- Agent 工具调用需权限分级与沙箱。
- 防止提示注入导致越权操作。
- 审计每次工具调用。

## 8. 小结

Agent 生态从"框架（LangGraph/AutoGen）"到"协议（MCP）"再到"自动化（n8n/Temporal）"逐步成熟。落地关键是可控编排 + 工具安全 + 可观测。
