# Agent 应用开发实战

> 对应 llm-universe「Agent 与工具调用」与 LangChain Agents；理论参考 ReAct (Yao et al. 2022)。

## 一、背景与挑战

单纯「问答」模型解决不了需要外部动作的任务：查天气、下单、读数据库、调 API。Agent 让模型在「思考—调用工具—观察结果」的循环中自主完成多步目标。它把 LLM 从「生成文本」升级为「驱动流程的系统」。

挑战：(1) 工具 schema 设计影响调用准确率；(2) 多步循环易跑偏、无限循环；(3) 失败需降级而非崩溃；(4) 可追溯性——每一步要留痕便于调试与审计；(5) 安全——工具可能有写/外部副作用。

## 二、核心原理

Agent = 模型 + 工具 + 循环 + 记忆：

- 工具（Tool）：每个工具含 `name`、`description`、`JSON Schema` 参数定义与执行函数。描述质量直接决定模型是否会、能否正确调用。
- 循环（Loop）：ReAct（推理+行动）或 Plan-and-Execute。每轮模型决定「调用哪个工具/参数」或「给出最终答案」。
- 记忆（Memory）：上下文 + 向量库，承载历史轨迹。
- 防护（Guardrail）：最大步数、权限校验、结果校验、人工确认高危操作。

## 三、形式化与数学基础

Agent 在第 $t$ 步根据轨迹 $\tau_t=(\text{obs}_1,a_1,\dots,\text{obs}_t)$ 选择动作：

$$a_t = \pi_\theta(\tau_t), \quad a_t \in \{\text{Call}(f, \text{args}), \text{Answer}(y)\}$$

执行工具得到观察 $\text{obs}_{t+1} = f(\text{args})$，轨迹更新 $\tau_{t+1}=\tau_t\oplus (a_t,\text{obs}_{t+1})$。终止条件为产出 Answer 或步数 $t\ge K$。目标是最小化到达正确答案的步数并避免无效循环。

## 四、代码实现

用工具调用编排一个最小 Agent（伪代码思路）：

```python
tools = [{"name":"search","schema":...,"fn":web_search},
         {"name":"calc","schema":...,"fn":eval_expr}]
sys_prompt = "你可用工具完成任务，逐步思考并用工具调用，最后给答案。"
messages = [{"role":"system","content":sys_prompt}]
for step in range(max_steps):
    resp = llm.invoke(messages, tools=tools)   # 模型决定调用
    if resp.tool_calls:
        for call in resp.tool_calls:
            obs = call.fn(**call.args)
            messages.append({"role":"tool","content":obs})
    else:
        return resp.content                  # 最终答案
```

## 五、与其他技术对比

| 形态 | 能力 | 复杂度 |
|------|------|--------|
| 单次工具调用 | 一问一答+一动作 | 低 |
| ReAct Agent | 多步自主 | 中 |
| Plan+Execute | 先规划再执行 | 高 |
| Workflow（固定图） | 可控可预测 | 中 |

工程落地常先用可控 Workflow，再在必要时升级为自主 Agent。

## 六、常见误区

- 工具 description 写得太简/太泛，模型不会调或调错参数。
- 不设最大步数，模型陷入「调用—失败—再调用」死循环。
- 忽略轨迹记录，出问题无法复盘。
- 高危工具（发邮件/下单）无确认与权限校验。
- 把 Agent 当万能，简单检索能解决的也硬上 Agent 增加时延与成本。

## 七、与开源书·权威来源对应

- ReAct（Yao et al. 2022）提出推理与行动交织的范式。
- llm-universe「Agent 与工具调用」章节。
- LangChain Agents / LangGraph、LlamaIndex Agent 文档。
- 本知识库「大模型应用开发 / 函数调用编排」「输出解析与校验」章节。

## 八、面试题

- 开发 Agent 时最容易被忽视的工程问题是什么？
- ReAct 相比单次工具调用的优势与代价？
- 如何防止 Agent 进入无限循环？
- 何时该用固定 Workflow 而非自主 Agent？

## 九、演进与趋势

从 ReAct 单循环到「多 Agent 协作」与「Agent 图」（LangGraph 有状态图）；引入反思（Reflexion）自我纠错；工具调用标准化（OpenAI function calling / MCP）；以及把评测驱动（见评测驱动开发）引入 Agent 质量门禁，覆盖轨迹正确率与最终成功率。

## 十、小结

Agent 应用 = 模型 + 工具 + 循环 + 记忆 + 防护。工程上重点打磨工具 schema、设最大步数与轨迹留痕、对高危操作加确认，平衡自主性与可控性。
