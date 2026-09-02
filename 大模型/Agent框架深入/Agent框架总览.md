# Agent 框架总览

> 对应 llm-universe Agent 章与 dair-ai 资源；框架见 LangGraph、AutoGen、CrewAI。

## 一、背景与挑战

单轮 LLM 调用难解多步任务。Agent 框架提供状态管理、工具调用、循环控制与多角色协作的抽象。

## 二、核心原理

框架通常含：**状态**（对话/记忆）、**节点**（LLM/工具/条件）、**边**（转移规则）、**运行时**（执行循环）。LangGraph 以图建模，AutoGen 以对话代理建模。

## 三、关键要点

| 框架 | 范式 | 特点 |
|------|------|------|
| LangGraph | 状态图 | 可控、可持久化 |
| AutoGen | 多代理对话 | 角色协作、代码执行 |
| CrewAI | 角色团队 | 任务编排直观 |

## 四、代码实现

```python
from langgraph.graph import StateGraph
g = StateGraph(State); g.add_node("llm", call_llm); g.add_edge("llm","tool")
```

## 五、与其他对比

- 手写 while 循环简单但难维护；框架提供持久化/断点/可观测。

## 六、常见误区

- 框架越复杂越好——多数任务用轻量循环即可。

## 七、与开源书对应

- llm-universe: https://github.com/datawhalechina/llm-universe
- LangGraph: https://github.com/langchain-ai/langgraph

## 八、面试题

- LangGraph 与 AutoGen 在建模范式上的根本差异？

## 九、演进

ReAct 手搓 → 框架化 → 多代理编排 → 标准化协议（MCP/A2A）。

## 十、小结

框架把 Agent 工程从脚本升级为可维护系统。
