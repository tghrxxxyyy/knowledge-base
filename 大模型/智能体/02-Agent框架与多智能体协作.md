# Agent 框架与多智能体协作

> 板块：大模型 / 智能体 　|　 返回：[README](README.md)
> 关联：[智能体/README](README.md)、[记忆/README](../记忆/README.md)、[RAG/README](../RAG/README.md)、[提示词工程/README](../提示词工程/README.md)

Agent = LLM（大脑）+ 工具（手）+ 记忆（脑）+ 规划（策略）。它把"会聊天的模型"变成"能干活的系统"。本文拆解核心闭环、主流框架、工具/记忆/规划设计、多智能体协作模式、可靠性工程与生产落地。

## 一、Agent 的核心闭环

最小闭环：**观察(Observation) → 思考(Thought) → 行动(Action) → 工具返回 → 再观察**。

| 范式 | 说明 | 适用 |
|------|------|------|
| ReAct | 推理与行动交错，边想边干 | 通用、工具调用 |
| Plan-and-Execute | 先定计划再逐步执行 | 复杂多步任务 |
| Reflexion | 失败后自我反思，写经验进记忆再试 | 长任务、易错场景 |
| ReWOO / 无观察 | 先规划所有工具调用再执行 | 减少 token 消耗 |

- 每个循环受 **max_steps** 约束，防死循环。
- 工具返回作为新的 Observation 喂回模型继续推理。

```
Thought: 需要查订单状态
Action: query_order(order_id="123")
Observation: {"status":"shipped","eta":"2026-01-05"}
Thought: 已发货，可告知用户
Final Answer: 订单 123 已发货，预计 1/5 送达
```

## 二、主流框架对比

| 框架 | 特点 | 适用 |
|------|------|------|
| LangChain | 组件最全，生态庞大，链/代理/记忆丰富 | 快速搭原型/复杂链路 |
| LlamaIndex | 数据/RAG 强，索引与检索一流 | 知识库问答 |
| AutoGen | 多 Agent 对话编排，可人工介入 | 多角色协作、研究 |
| CrewAI | 角色+任务+流程直观，业务友好 | 业务团队建模 |
| LangGraph | 有状态图，可控循环/分支/人工节点 | 生产级有状态 Agent |
| Semantic Kernel | 微软，企业集成好（.NET/Java/Python） | 企业应用 |
| Haystack | 管线化 NLP/RAG 编排 | 检索问答 |

```python
# LangGraph 有状态循环（伪代码）
graph = StateGraph(AgentState)
graph.add_node("think", llm_node)
graph.add_node("tool", tool_node)
graph.add_edge("think", "tool")
graph.add_conditional_edges("tool", should_continue)  # 决定继续或结束
```

## 三、工具（Tools）设计

- 每个工具：**名称 + 描述 + 输入 schema（JSON Schema）+ 执行函数**。
- **描述决定调用**：模型靠描述选工具，描述要清晰、含"何时用/返回什么"。
- **健壮性**：幂等、可超时（如 10s）、可降级；失败返回友好错误而非崩溃。
- **权限分级**：读工具（查询）宽松；写工具（发消息/改库）加确认或权限校验。
- **最小暴露**：只给必要工具，避免模型"乱用"（见 [Prompt 工程防注入](../Prompt工程模式与少样本学习.md)）。

```python
@tool
def query_order(order_id: str) -> dict:
    """查询订单状态。参数 order_id 为订单号。返回状态与预计送达。"""
    return order_service.get(order_id)
```

## 四、记忆系统

| 类型 | 内容 | 实现 |
|------|------|------|
| 短期 | 当前对话 | 上下文窗口 |
| 长期 | 用户偏好/历史 | 向量库 + 摘要 |
| 工作记忆 | 任务中间结果 | 状态对象/图节点 |

- 详见 [记忆/README](../记忆/README.md)。
- 避免把全部历史塞进 context → 用摘要 + 检索（见 [长上下文与KV-Cache优化](../上下文工程/04-长上下文与KV-Cache优化.md)）。
- 记忆要**可更新**（纠正偏好）、**可遗忘**（隐私/过期）。

## 五、多智能体协作模式

| 模式 | 结构 | 适用 |
|------|------|------|
| 流水线 Pipeline | A 产出 → B 校验 → C 汇总 | 可拆阶段任务 |
| 辩论 Debate | 多个 Agent 互相反驳收敛 | 需多角度论证（如代码评审） |
| 主管 Supervisor | Orchestrator 派活给专家 | 复杂任务分派 |
| 群聊 Group Chat | 多角色讨论（AutoGen） | 开放协作 |
| 黑板 Blackboard | 共享状态，各 Agent 取任务 | 异步并行 |

```
User → Supervisor → [Researcher, Coder, Reviewer] → Supervisor → Answer
```

- 协作的代价：更多 token、更多延迟、协调复杂。简单任务用单 Agent。
- 角色定义要清晰（系统提示区分职责），避免"抢活"或"踢皮球"。

## 六、规划与任务分解

- 用 LLM 把大任务拆子任务（ToT/GoT 思维图）。
- 子任务可并行（独立子任务同时跑，如 research + code 分头）。
- 每步记录结果，失败可回退或换策略（Plan-and-Execute 的 replan）。
- 工具：任务队列 + 依赖图（DAG），完成后聚合。

## 七、可靠性工程（生产关键）

| 维度 | 手段 |
|------|------|
| 护栏 Guardrails | 输入校验、输出格式约束、敏感词过滤、工具白名单 |
| 重试与降级 | 工具失败重试（指数退避），关键步骤人工兜底 |
| 可观测 | 记录每次思考/行动/工具调用（LangSmith/Trace），便于调试 |
| 成本控制 | 限制 max_steps、模型路由（小任务小模型）、结果缓存 |
| 评估 | 任务成功率、步数效率、成本、幻觉率 |

```python
# 成本控制示例：模型路由
def route(task):
    if is_simple(task): return small_model   # 7B 分类
    return large_model                        # 70B 推理
```

## 八、评测

- **任务成功率**：固定任务集跑成功率（AgentBench/自建）。
- **效率**：平均步数、耗时、token 成本。
- **质量**：幻觉率、格式合规率、人工抽检难例。
- 回归：prompt/工具改动后重跑固定集，防退化。

## 九、生产落地 checklist

- [ ] 明确 Agent 边界（做什么/不做什么）。
- [ ] 工具最小化且健壮（超时/幂等/降级）。
- [ ] 加记忆与检索（RAG）减少幻觉。
- [ ] 用 LangGraph 等有状态框架控循环（max_steps）。
- [ ] 全链路可观测 + 护栏 + 成本上限。
- [ ] 持续评测迭代（固定任务集回归）。
- [ ] 危险操作人工确认/权限校验。

## 十、常见坑

- **工具描述模糊** → 模型调错工具（描述要含"何时用"）。
- **无限循环** → 不设最大步数，token 爆（必设 max_steps）。
- **上下文膨胀** → 不清理中间结果，超窗口（摘要+检索）。
- **工具无超时** → 一个卡死拖垮整链（必设 timeout）。
- **幻觉当事实** → 不加校验直接执行（工具结果需校验）。
- **多 Agent 过度** → 简单任务也上群聊，成本与延迟翻倍。
- **无护栏** → 模型越权调用危险工具（白名单+确认）。

## 十一、选型建议

| 诉求 | 框架 |
|------|------|
| 快速原型 | LangChain / LlamaIndex |
| 生产有状态 | LangGraph |
| 多 Agent 研究 | AutoGen / CrewAI |
| 企业 .NET/Java | Semantic Kernel |
| 知识库问答 | LlamaIndex / Haystack |

## 十二、延伸阅读

- [智能体/README](README.md)
- [智能体/01-概述与核心概念](01-概述与核心概念.md)
- [智能体/04-多智能体协作与编排](04-多智能体协作与编排.md)
- [智能体/05-主流框架与生态](05-主流框架与生态.md)
- [智能体/06-评估、安全与工程落地](06-评估、安全与工程落地.md)
- [记忆/README](../记忆/README.md)
- [RAG/README](../RAG/README.md)
- [Prompt工程模式与少样本学习](../Prompt工程模式与少样本学习.md)
- 论文：ReAct、Reflexion、AutoGen、Generative Agents、CAMEL
