# LangGraph 状态图

> 见「Agent框架深入/Agent框架总览」。

## 一、背景与挑战

复杂 Agent 需显式控制流程、支持循环与人机介入，普通链难以表达。

## 二、核心原理

以有向图定义节点与边，状态对象在节点间传递。支持条件边、循环、checkpoint（断点续跑）、human-in-the-loop。

## 三、代码实现

```python
from langgraph.graph import END
g.add_conditional_edges("agent", should_continue, {"tool":"tool", "end":END})
```

## 四、关键要点

- State 可累加（Annotated 合并）或覆盖。
- Checkpoint 让长任务可中断恢复。

## 五、与其他对比

- AutoGen 偏对话驱动；LangGraph 偏显式图控制。

## 六、常见误区

- 把图当普通 DAG——Agent 允许环（自循环决策）。

## 七、与开源书对应

- LangGraph 文档: https://github.com/langchain-ai/langgraph
- llm-universe: https://github.com/datawhalechina/llm-universe

## 八、面试题

- LangGraph 的 checkpoint 如何实现断点续跑？

## 九、演进

LCEL 链 → 图 → 持久化 + 流式。

## 十、小结

LangGraph 适合需要强控制与可观测的生产 Agent。
