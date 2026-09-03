# ReAct交错推理与行动

> 对应 Yao et al., *ReAct: Synergizing Reasoning and Acting in Language Models*, ICLR 2023。

## 一、背景与挑战

纯思维链只在内部推理，无法获取外部事实，易产生自洽但错误的链条；纯动作序列缺少推理，无法处理需要中间判断的任务。
ReAct 的核心主张是二者协同：推理指导动作选择，动作带回的观测又约束后续推理。

## 二、核心原理

- 轨迹格式为 思考（Thought）→ 动作（Action）→ 观测（Observation）循环，思考不进入环境，动作才与环境交互。
- 推理的作用包括分解任务、决定下一步查什么、解释观测、决定何时停止，属于可解释的中间控制流。
- 观测作为客观信号打断幻觉传播，是 ReAct 相对纯 CoT 在知识密集任务上更稳的根本原因。

## 三、数学形式

策略在增广动作空间上采样：$a_t\sim\pi_\theta(\cdot\mid x, \tau_{<t})$，其中 $a_t$ 可以是「思考」（无环境效应）或「工具动作」（产生 $o_t$）。

思考不改变环境状态，即 $s_{t+1}=s_t$ 当 $a_t\in\mathcal A_{\text{think}}$，因此思考只增加计算而不承担外部风险。

## 四、代码实现

```python
SYS = "按格式输出: Thought: ...\nAction: 工具名[参数]\n或 Final: 答案"

def react(llm, tools, q, max_steps=8):
    scratch = ""
    for _ in range(max_steps):
        out = llm(SYS + f"\n问题: {q}\n{scratch}")
        if out.startswith("Final:"):
            return out[6:].strip()
        name, arg = parse_action(out)
        obs = tools[name](arg)
        scratch += f"{out}\nObservation: {obs}\n"
    return "未在步数内完成"
```

## 五、与其他对比

- 与纯 CoT：ReAct 引入外部观测，能纠正事实错误；CoT 仅靠内部一致性。
- 与先规划后执行：ReAct 逐步决策更适应不确定环境，但缺少全局视图，易在局部反复；实践常用 ReAct 外层加计划骨架。

## 六、常见误区

- 让思考也产生副作用（如在 Thought 里直接给出最终承诺），破坏了思考与动作的隔离。
- 观测原文全量拼接导致上下文迅速膨胀，应截断或摘要并保留关键字段。
- 无步数上限与无进展检测，智能体在同一动作上循环。

## 七、与开源书对应

- dair-ai/Prompt-Engineering-Guide（ReAct 专章与示例）：https://github.com/dair-ai/Prompt-Engineering-Guide
- datawhalechina/llm-universe（Agent 实现与工具接入）：https://github.com/datawhalechina/llm-universe

## 八、面试题

- ReAct 为什么优于单独的推理或单独的行动？答：推理提升动作选择与观测解释质量，观测提供外部校正，二者互补降低幻觉与盲目试探。
- 如何防止 ReAct 陷入循环？答：设置步数上限、记录动作签名去重、检测无进展并触发重规划或换工具。

## 九、演进

CoT → 动作序列模仿 → ReAct 交错范式 → 加反思与记忆的多试次 ReAct → 与树搜索结合（如语言智能体树搜索）。

## 十、小结

ReAct 的价值在于把外部观测嵌入推理链，使智能体的每一步都有客观校正机会。
