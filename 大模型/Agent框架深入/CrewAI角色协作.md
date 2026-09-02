# CrewAI 角色协作

> 见「Agent框架深入/Agent框架总览」。

## 一、背景与挑战

业务场景需要「团队」按流程协作，CrewAI 以角色+任务+流程建模。

## 二、核心原理

定义 Agent（角色/目标/工具）、Task（描述/产出）、Crew（编排策略：顺序/层级），框架驱动执行。

## 三、代码实现

```python
from crewai import Agent, Task, Crew
r = Agent(role="研究员", goal="调研X", tools=[search])
t = Task(description="整理报告", agent=r)
Crew(agents=[r], tasks=[t]).kickoff()
```

## 四、关键要点

- 流程（Process）决定协作顺序。
- 适合流程清晰的业务自动化。

## 五、与其他对比

- 比 LangGraph 更易上手；比 AutoGen 更偏业务角色。

## 六、常见误区

- 角色越多越好——易职责重叠、成本飙升。

## 七、与开源书对应

- CrewAI: https://github.com/crewAIInc/crewAI
- llm-universe: https://github.com/datawhalechina/llm-universe

## 八、面试题

- CrewAI 的 Process 有哪两种？适用差异？

## 九、演进

手动编排 → 层级流程 → 与框架互通。

## 十、小结

CrewAI 让「AI 团队」成为可声明的工作流。
