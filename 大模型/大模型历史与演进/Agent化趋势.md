# Agent 化趋势

> 对应 LangChain / LlamaIndex Agent 文档、Anthropic Model Context Protocol (MCP) 规范、AutoGen / OpenAI Assistants API。

## 一、背景与挑战

2022 年底 ChatGPT 让大模型进入公众视野，但早期大模型本质是「单轮或短多轮的生成器」：输入提示、输出文本，缺乏对外部世界的感知与操作能力。2023 年后，业界共识从「让模型回答得更好」转向「让模型把事做完」，Agent（智能体）成为大模型落地的核心范式。

核心挑战在于：(1) 大模型本身不具备调用工具、读写文件、执行代码的能力，需要一套「编排层」把模型与外部环境接起来；(2) 真实任务往往是多步、有依赖、会失败的，需要规划（Planning）与反思（Reflection）；(3) 长程任务要求系统记住已完成步骤与中间结果，即记忆（Memory）；(4) 工具接口千差万别，缺乏标准导致每个集成都要定制，生态难以规模化。

## 二、核心原理

一个典型 Agent 由四要素构成：

- **大模型（LLM）作为认知核心**：负责理解指令、做决策、生成下一步动作。
- **工具（Tools）**：函数或 API，如搜索、数据库查询、代码执行、发邮件等，以结构化 schema 描述。
- **记忆（Memory）**：短期记忆承载本轮对话上下文，长期记忆借助向量库持久化。
- **规划（Planning）**：把复杂目标拆解为子任务，常用 ReAct、Plan-and-Execute、Tree-of-Thought 等策略。

Agent 的运行通常是一个「感知—思考—行动」的循环（ReAct 范式）：模型先观察当前状态，再产出「思考」与「动作」，执行动作后得到「观察」，如此迭代直到任务完成或达到步数上限。

## 三、形式化与数学基础

把 Agent 视为在状态空间上执行的策略。设环境状态为 $s_t$，模型根据策略 $\pi_\theta$ 选择动作 $a_t$，环境返回奖励 $r_t$ 与新状态 $s_{t+1}$：

$$s_{t+1} = \mathcal{T}(s_t, a_t), \quad a_t \sim \pi_\theta(\cdot \mid s_t, \tau_{<t})$$

其中 $\tau_{<t}$ 为截至当前的轨迹（含历史观察、思考与动作）。目标通常是最大化期望累积奖励：

$$\max_\theta \mathbb{E}_{\tau \sim \pi_\theta}\left[\sum_{t=0}^{T} \gamma^t r_t\right]$$

在 LLM Agent 中，$\pi_\theta$ 由提示词与模型权重共同决定，动作空间是离散的「工具调用 + 文本」，而非连续控制量。

## 四、代码实现

下面用 Python 风格的伪代码展示 ReAct 循环骨架：

```python
def run_agent(question, tools, llm, max_steps=10):
    trajectory = f"目标: {question}\n"
    for step in range(max_steps):
        prompt = build_prompt(trajectory, tools)
        action = llm.generate(prompt)          # 含 Thought/Action/Action_Input
        if action.is_final():
            return action.answer
        obs = call_tool(tools, action.name, action.args)
        trajectory += f"\n{action.thought}\n行动: {action}\n观察: {obs}\n"
    return "超过最大步数，任务未完成"
```

工具以 JSON schema 声明，模型输出结构化调用，由编排层 dispatch 到具体函数。

## 五、与其他技术对比

| 形态 | 能力边界 | 适用场景 | 代表 |
|------|----------|----------|------|
| 纯 chatbot | 单轮/短多轮文本 | 问答、写作 | ChatGPT 基础模式 |
| RAG | 检索增强生成 | 知识问答 | LlamaIndex |
| 单 Agent | 多步工具调用 | 自动化任务 | AutoGPT、Assistants |
| 多 Agent | 协作/辩论 | 复杂工程 | AutoGen、CrewAI |

相较 RAG，Agent 多了「主动规划与外部操作」；相较工作流（Workflow），Agent 的决策由模型动态决定而非预先写死。

## 六、常见误区

- 误区一：把「套一个提示词循环」当成 Agent。真正 Agent 需要工具调度与失败重试机制。
- 误区二：认为模型越强 Agent 越稳。实际瓶颈常在工具定义粗糙与状态管理混乱。
- 误区三：忽视成本控制。多步推理会放大 token 消耗，需设步数与重试上限。
- 误区四：用 Agent 替代确定性流程。高可靠性业务应优先用固定工作流。

## 七、与开源书·权威来源对应

- LangChain Agents 文档：https://python.langchain.com/docs/concepts/agents/
- LlamaIndex Agent 文档：https://docs.llamaindex.ai/
- Anthropic, *Model Context Protocol*：https://modelcontextprotocol.io
- Yao et al., *ReAct: Synergizing Reasoning and Acting in Language Models*, 2022.
- Wu et al., *AutoGen: Multi-Agent Conversation Framework*, 2023.

## 八、面试题

- 为什么 2024 年后 Agent 成为大模型落地热点？它相对 RAG 多了什么能力？
- ReAct 范式里「Thought / Action / Observation」各自的作用是什么？
- 单 Agent 与多 Agent 协作在可靠性与成本上各有什么权衡？
- 如何用步数上限与自我反思缓解 Agent 的「死循环」问题？

## 九、演进与趋势

(1) 工具调用标准化：Function Calling 已成模型原生能力，Anthropic 提出 MCP 统一工具/数据源接口，降低集成成本。(2) 多 Agent 协作：通过角色分工、辩论、批判提升复杂任务完成率。(3) 协议与生态：从各自私有 SDK 走向开放协议。(4) 推理模型赋能：o1/R1 类慢思考模型让 Agent 在规划阶段更可靠。(5) 终端形态：GUI Agent、代码 Agent、研究 Agent 等垂直形态快速成熟。

## 十、小结

Agent 化是大模型从「会说话」到「能办事」的关键跃迁，其骨架由 LLM、工具、记忆、规划四要素构成。2023 年后工具协议标准化与多 Agent 协作推动生态繁荣，落地时应理性区分 Agent 与确定性工作流的边界，并以步数、成本、失败重试等工程约束保障可靠性。
