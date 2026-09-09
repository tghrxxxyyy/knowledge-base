# ReAct 范式实现

> 对应 Yao et al., *ReAct: Synergizing Reasoning and Acting in Language Models*, 2022（arXiv:2210.03629）。属智能体工程深入板块，聚焦工程实现细节。

## 一、背景与挑战

ReAct 提出一个关键洞见：让模型把「推理（Reason）」与「行动（Act）」**交错**进行，比纯推理（CoT）或纯行动（Act-only）都更强。推理步骤（Thought）为行动提供计划与依据，行动产生的观测（Observation）又反过来校正推理。工程实现的核心难点在于：如何稳定地解析模型输出、如何连接环境、如何防循环与截断。

## 二、核心原理

ReAct 的每一步是一个三元组循环：**Thought → Action → Observation**。
- **Thought**：模型的自然语言推理（为何这么做、下一步计划），不进入环境。
- **Action**：模型选的动作，形如 `Action: 工具名` 与 `Action Input: 参数`。
- **Observation**：环境/工具返回的结果，作为新上下文回填。

循环直到模型输出 `Action: Finish` 并给出最终答案。实现要点：
1. 定义**动作空间**（可用工具及签名）。
2. 用提示词冻结输出格式（`Thought: / Action: / Action Input: / Observation:`）。
3. 解析器把文本切成结构化 `(thought, action, args)`。
4. 连接环境执行，把 Observation 追加回消息。
5. 设 `max_steps` 截断防失控。

Thought 虽不进入环境，但积累在上下文中，构成「可解释的决策痕迹」。

## 三、形式化与数学基础

ReAct 是智能体策略的一种具体实例化。在轨迹 $\tau_t$ 上，模型同时产出推理与动作：

$$
(\text{thought}_t, a_t) \sim \pi_\theta(\cdot\mid \tau_t)
$$

若 $a_t\neq\text{Finish}$，则环境给观测 $o_{t+1}=\mathcal{E}(a_t)$，轨迹更新 $\tau_{t+1}=\tau_t\oplus(\text{thought}_t,a_t,o_{t+1})$。对比 Act-only（无 Thought）与 CoT-only（无 Action），ReAct 的损失可写为二者的结合：

$$
\mathcal{L}_{\text{ReAct}} = \underbrace{\mathcal{L}_{\text{reason}}}_{\text{Thought 合理}} + \underbrace{\mathcal{L}_{\text{act}}}_{\text{Action 正确}}
$$

其优势来自「推理指导行动、观测校正推理」的闭环，减少盲目动作。

## 四、代码实现

```python
def react_loop(llm, tools, user_goal, max_steps=12):
    trace = [system_prompt_react(), {"role": "user", "content": user_goal}]
    for _ in range(max_steps):
        out = llm(trace)
        thought, action, args = parse_react(out)   # 解析 Thought/Action/Input
        trace.append({"role": "assistant", "content": out})
        if action == "Finish":
            return args["answer"]
        if action not in tools:                     # 未知动作防护
            obs = f"错误：未知工具 {action}"
        else:
            try:
                obs = tools[action](**args)
            except Exception as e:
                obs = f"执行失败：{e}"               # 失败也回填，供模型修正
        trace.append({"role": "user", "content": f"Observation: {obs}"})
    return "达到最大步数"
```

## 五、与其他技术对比

| 范式 | 推理文本 | 外部行动 | 观测反馈 | 特点 |
|------|---------|---------|---------|------|
| CoT-only | 有 | 无 | 无 | 纯推理 |
| Act-only | 无 | 有 | 有 | 易盲目 |
| ReAct | 有 | 有 | 有 | 推理+行动协同 |
| Plan-and-Execute | 有(前) | 有 | 部分 | 全局蓝图 |

ReAct 胜在「边想边做」，Plan-and-Execute 胜在「先谋后动」。

## 六、常见误区

- 提示未固定输出格式，模型省略 Thought 或错写 Action，解析失败。
- 忽视解析失败的重试/修正，一旦格式错就中断。
- 没有最大步数护栏，遇障碍空转。
- 把 Observation 直接当答案返回，跳过模型综合。

## 七、与开源书·权威来源对应

- Yao et al., *ReAct*, 2022（arXiv:2210.03629），含 HotpotQA、FEVER、ALFWorld 等实验。
- 工程参考：LangChain `ReAct Agent`、llm-course「Agents」章节。
- 与本知识库「提示工程深入 / ReAct」文档互补（本篇偏工程）。

## 八、面试题

- ReAct 的 Thought 是否参与环境交互？它有什么作用？
- 为何 ReAct 通常优于纯 Act-only？推理文本带来了什么？
- 解析失败时工程上应如何健壮处理？
- ReAct 与 Plan-and-Execute 各自的适用边界？

## 九、演进与趋势

ReAct 是现代 Agent 的事实基线，已被多种变体扩展：Reflexion 在其上加「反思」步、ToT 把行动空间化为搜索树、多智能体将其并行化。随推理模型（o1/R1）把思考内化，显式 Thought 文本的重要性在下降，但「行动—观测」循环结构被保留。趋势是用更稳健的**结构化动作**（替代文本解析，见工具调用协议）与「思考预算」控制，使 ReAct 既稳健又可观测。

## 十、小结

ReAct 通过「Thought→Action→Observation」交错循环，让推理指导行动、观测校正推理，形成可解释、可纠错的智能体闭环。工程实现的关键是冻结输出格式、健壮解析、环境连接与最大步数护栏。它是 Agent 架构的基石范式，后续反思、规划、多智能体均在此基础上生长。
