# Agent 框架与多智能体协作

> 板块：大模型 / 智能体 　|　 返回：[README](README.md)

## 一、Agent 的核心闭环

Agent = LLM（大脑）+ 工具（手）+ 记忆（脑） + 规划（策略）。最小闭环：

```
观察(Observation) → 思考(Thought) → 行动(Action) → 工具返回 → 再观察 ...
```

- **ReAct**：推理与行动交错，边想边干。
- **Plan-and-Execute**：先定计划再逐步执行，适合复杂任务。
- **Reflexion**：失败后自我反思，把经验写进记忆再重试。

## 二、主流框架对比

| 框架 | 特点 | 适用 |
|------|------|------|
| LangChain | 组件最全，生态庞大 | 快速搭原型/复杂链路 |
| LlamaIndex | 数据/RAG 强 | 知识库问答 |
| AutoGen | 多 Agent 对话编排 | 多角色协作 |
| CrewAI | 角色+任务+流程直观 | 业务团队建模 |
| LangGraph | 有状态图，可控循环 | 生产级有状态 Agent |
| Semantic Kernel | 微软，企业集成好 | .NET/Java 企业 |

```python
# LangGraph 有状态循环（伪代码）
graph = StateGraph(AgentState)
graph.add_node("think", llm_node)
graph.add_node("tool", tool_node)
graph.add_edge("think", "tool")
graph.add_conditional_edges("tool", should_continue)
```

## 三、工具（Tools）设计

- 每个工具：名称 + 描述 + 输入 schema（JSON Schema）+ 执行函数。
- 描述要清晰，模型靠描述决定调哪个工具。
- 工具要幂等、可超时、可降级；失败要有友好错误。
- 危险操作（写库、发消息）加人工确认或权限校验。

## 四、记忆系统

| 类型 | 内容 | 实现 |
|------|------|------|
| 短期 | 当前对话 | 上下文窗口 |
| 长期 | 用户偏好/历史 | 向量库 + 摘要 |
| 工作记忆 | 任务中间结果 | 状态对象 |

- 详见 [记忆/README](../记忆/README.md)。
- 避免把全部历史塞进 context → 用摘要 + 检索。

## 五、多智能体协作模式

- **流水线（Pipeline）**：A 产出 → B 校验 → C 汇总。
- **辩论（Debate）**：多个 Agent 互相反驳，收敛最优解。
- **主管（Supervisor）**：一个 Orchestrator 派活给专家 Agent。
- **群聊（Group Chat）**：AutoGen 风格，多角色讨论。

```
User → Supervisor → [Researcher, Coder, Reviewer] → Supervisor → Answer
```

## 六、规划与任务分解

- 用 LLM 把大任务拆成子任务（ToT/GoT 思维图）。
- 子任务可并行（独立子任务同时跑）。
- 每步记录结果，失败可回退或换策略。

## 七、可靠性工程

- **护栏（Guardrails）**：输入校验、输出格式约束、敏感词过滤。
- **重试与降级**：工具失败重试，关键步骤人工兜底。
- **可观测**：记录每次思考/行动/工具调用，便于调试（LangSmith/Trace）。
- **成本控制**：限制步数、模型路由、结果缓存。

## 八、评测

- 任务成功率、步数效率、成本、幻觉率。
- 用固定任务集做回归（AgentBench 思路）。
- 人工抽检难例，迭代 prompt 与工具。

## 九、生产落地 checklist

1. 明确 Agent 边界（做什么/不做什么）。
2. 工具最小化且健壮。
3. 加记忆与检索（RAG）。
4. 用 LangGraph 等有状态框架控循环。
5. 全链路可观测 + 护栏 + 成本上限。
6. 持续评测迭代。

## 十、常见坑

- 工具描述模糊 → 模型调错工具。
- 无限循环 → 不设最大步数。
- 上下文膨胀 → 不清理中间结果。
- 工具无超时 → 一个卡死拖垮整链。
- 幻觉当事实 → 不加校验直接执行。

## 十一、延伸阅读

- [智能体/README](README.md)
- [记忆/README](../记忆/README.md)
- [RAG/README](../RAG/README.md)
- 论文：ReAct、Reflexion、AutoGen、Generative Agents
