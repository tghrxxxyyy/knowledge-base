# 智能体评测

> 对应 AgentBench (Liu et al., 2023)、WebArena (Zhou et al., 2023)、ToolBench (Qin et al., 2023) 等 Agent 评测框架。

## 一、背景与挑战

大模型智能体（Agent）在「感知—规划—工具调用—反思」的闭环中完成任务，远超单轮问答。单轮评测只关心「答案对不对」，而 Agent 评测必须关心「过程对不对、环境交互是否有效、目标是否达成」。核心挑战：① 任务多步、状态空间巨大，难以穷举；② 环境（网页、数据库、API）需可复现，否则分数不可比；③ 部分成功（partial success）如何计分；④ 安全与越权风险如何量化。

## 二、核心原理

Agent 评测围绕「轨迹（trajectory）」而非「单点答案」。一次运行 = 观察 $o_t$ → 思考/规划 → 动作 $a_t$（工具调用/代码/点击）→ 环境反馈，循环至终止。评估在三个层面展开：

- **结果指标**：任务最终成功率（Success Rate）、目标完成度。
- **过程指标**：步骤效率（步数/冗余）、工具调用准确率、规划合理性。
- **安全指标**：越权、幻觉式工具调用、无法终止（无限循环）。

常用「可复现沙箱」保证环境状态一致，使分数可重复、可横向对比。

## 三、形式化与数学基础

任务成功率（Success Rate）在 $M$ 个任务、每任务 $R$ 次运行上定义：

$$
\text{SR} = \frac{1}{M}\sum_{i=1}^{M} \mathbb{1}[\exists\, r\in[R]\; \text{任务 }i\text{ 成功}]
$$
$$
\text{ASR} = \frac{1}{MR}\sum_{i=1}^{M}\sum_{r=1}^{R} \mathbb{1}[\text{第 }i\text{ 任务第 }r\text{ 次成功}] \quad (\text{平均成功率})
$$

效率可附加惩罚项，例如带步数惩罚的得分：

$$
\text{Score} = \text{Success} - \lambda \cdot \frac{\text{实际步数}}{\text{参考步数}}
$$

## 四、代码实现

以 AgentBench 风格运行一个「操作系统」任务并判定成功：

```python
from agentbench import OSBenchmark, Evaluator

bench = OSBenchmark(sandbox="docker://ubuntu-agent")
evaluator = Evaluator(rubric="task_success_via_state_diff")

for task in bench.tasks:
    traj = agent.run(task.init_state, max_steps=30)
    result = evaluator.judge(task, traj)      # 比对终态与期望
    print(task.id, "success" if result.ok else "fail", "steps=", len(traj))
```

## 五、与其他技术对比

| 维度 | 单轮问答评测 | Agent 评测 |
|------|--------------|------------|
| 关注对象 | 最终答案 | 轨迹 + 终态 |
| 环境 | 无状态 | 需可复现沙箱 |
| 指标 | Acc/EM | 成功率 + 效率 + 安全 |
| 难点 | 答案抽取 | 部分成功、循环、越权 |

## 六、常见误区

- 「只看最终答案就能评 Agent」：错误，错误过程（碰巧答对/越权达成）隐患大。
- 「沙箱环境不重要」：环境不可复现则分数不可比、不可信。
- 「成功率 100% 就安全」：可能通过违规手段达成，需安全约束评分。
- 「步数越少越好」：过度压缩可能牺牲鲁棒性，需结合成功率看。

## 七、与开源书·权威来源对应

- Liu et al., *AgentBench: Evaluating LLMs as Agents*, 2023。
- Zhou et al., *WebArena: A Realistic Web Environment for Building Autonomous Agents*, 2023。
- Qin et al., *ToolLLM / ToolBench*, 2023。
- llm-course 与 HuggingFace 关于 Tool-use / Agent 评估的资料。

## 八、面试题

- Agent 评测为何不能只看最终答案？轨迹评估补了什么？
- 可复现沙箱（sandbox）在 Agent 评测中的作用是什么？
- 如何定义与度量「部分成功」？
- Agent 的安全维度应如何纳入评分？

## 九、演进与趋势

Agent 评测从「脚本化任务成功率」走向「多环境综合基准」（OS、DB、Web、游戏），并引入 LLM-as-judge 评估轨迹质量；同时关注「成本效率」（token/步数预算）与「安全合规」。长程、多智能体协作（multi-agent）评测正在成为新前沿。

## 十、小结

Agent 评测以「轨迹 + 终态」为核心，需在可复现沙箱中综合衡量成功率、效率与安全性，远复杂于单轮问答。其难点在环境复现、部分成功计分与安全防护。具体基准与评分以 AgentBench、WebArena、ToolBench 官方为准。
