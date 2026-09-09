# ReAct：推理 + 行动

> 对应 Yao et al., *ReAct: Synergizing Reasoning and Acting in Language Models*, 2022（亦见本系列「智能体」文档）。

## 一、背景与挑战

纯推理（如 Chain-of-Thought）让模型在「脑内」一步步想，但模型**无法获取实时/外部事实**，容易幻觉、算错或给出过时信息。纯行动（直接调工具）又缺规划、易在复杂任务里迷路。ReAct 的核心洞见是：把**推理（Thought）与行动（Action）交织**——边想边做、做完看结果再想，既利用外部工具补事实，又用推理串起多步决策，显著提升复杂任务的事实性与成功率。

## 二、核心原理

ReAct 在 prompt 中定义一种交错轨迹格式，每一轮包含三种单元：

- **Thought（思考）**：模型的隐式推理/计划，不调用工具，仅决定「下一步做什么、为什么」；
- **Action（行动）**：调用某个外部工具并给出参数，如 `Search(query)`、`Calculator(expr)`、`Lookup(term)`；
- **Observation（观察）**：工具返回的结果，回填给模型作为新上下文。

循环「Thought → Action → Observation」直到模型产出最终答案（常以 `Finish(answer)` 结束）。模型在每一步都能基于最新观察修正计划，形成「推理引导行动、行动反哺推理」的闭环。

## 三、形式化与数学基础

把轨迹记为序列 $z = (t_1, a_1, o_1, t_2, a_2, o_2, \dots, t_n, a_n)$，其中 $t$ 为思考文本，$a$ 为行动，$o$ 为观察。模型在给定上下文 $c$ 与历史 $\tau_{<i}$ 下生成下一步：

$$p_\theta(t_i, a_i \mid c, \tau_{<i}),\qquad o_i = \text{Tool}(a_i).$$

目标最大化在正确答案上的似然。与纯 CoT 不同，ReAct 的「推理链」中夹带了真实观测 $o_i$，使后续 $t_{i+1}$ 建立在可信外部信息上，降低幻觉。可形式化为决策过程：状态=上下文+历史，动作空间=工具集∪{Finish}。

## 四、代码实现

用 LangChain 表达 ReAct 风格的 Agent（示意，API 以官方为准）：

```python
from langchain.agents import initialize_agent, Tool
from langchain.llms import OpenAI

tools = [
    Tool(name="Search", func=search_fn, description="搜索网络"),
    Tool(name="Calc", func=calc_fn, description="计算表达式"),
]
agent = initialize_agent(tools, OpenAI(), agent="react-docstore", verbose=True)
agent.run("2024 年夏季奥运会在哪座城市举办？并算出去年的天数差")
```

轨迹示意：

```
Thought: 我需要先查 2024 夏奥会举办城市
Action: Search(2024 Summer Olympics host city)
Observation: 巴黎
Thought: 据此可答，并补一个计算
Action: Calc(366-365)
Observation: 1
Action: Finish(巴黎；天数差 1)
```

## 五、与其他技术对比

| 方法 | 用工具 | 有推理 | 事实性 |
|------|-------|-------|-------|
| CoT | 否 | 是 | 中（易幻觉） |
| 纯工具调用 | 是 | 弱 | 中 |
| ReAct | 是 | 是 | 高 |
| ReAct + 检索 | 是 | 是 | 更高 |

## 六、常见误区

- **把 Thought 当必须对外输出**：Thought 是推理痕迹，可 verbose 展示但不应作为最终答案。
- **工具描述写含糊**：模型靠 description 选工具，描述不清会选错或参数错。
- **忽略 Observation 解析**：工具返回格式要稳定可解析，否则后续推理断链。
- **陷入无限循环**：模型可能反复调同一工具不收敛，需设最大步数/超时与早停。
- **把工具结果当可信事实**：外部数据可能错误，必要时二次校验或交叉检索。

## 七、与开源书·权威来源对应

- Yao et al., *ReAct: Synergizing Reasoning and Acting in Language Models*, 2022。
- Prompt-Engineering-Guide（ReAct）：https://www.promptingguide.ai/zh/techniques/react
- 衍生：LangChain / LlamaIndex Agent 均吸收 ReAct 思想。

## 八、面试题

- ReAct 如何让模型利用外部知识、降低幻觉？
- Thought 与 Action 各自作用？Observation 从哪来？
- ReAct 相比纯 CoT 多了什么、代价是什么？

## 九、演进与趋势

ReAct 演化为现代 Agent 的基础范式：结合**检索增强（RAG）**做知识型 Agent、结合**函数调用/工具协议**做标准化工具使用、以及 **Plan-and-Execute**（先整体规划再分步执行）缓解长轨迹漂移。多智能体协作也常用 ReAct 作为单 agent 循环。

## 十、小结

ReAct 通过交错「思考—行动—观察」把推理与工具使用融为一体：推理指导该调什么工具、观察结果又修正后续推理，从而在复杂、需外部事实的任务上显著提升事实性与成功率，是当今 LLM Agent 的核心交互范式。
