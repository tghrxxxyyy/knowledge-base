# Agent 评测基准

> 对应 AgentBench（Liu et al., 2023）、WebArena（Zhou et al., 2023）、ToolBench（Qin et al., 2023）、GAIA（Mialon et al., 2023）；参考 LangChain / LlamaIndex Agent 评估文档。

## 一、背景与挑战

智能体（Agent）需在多步交互中调用工具、浏览网页、操作环境以完成目标，评测远比单轮 QA 复杂。核心挑战：(1) **环境可复现**——网页/操作系统状态必须可重置，否则结果不可比；(2) **轨迹评估**——不只看最终答案，还要看决策路径是否合理、是否冗余/越权；(3) **任务真实度**——合成任务易过简，需贴近人类真实需求。基准因此强调「可重置沙箱 + 多步成功率」。

## 二、核心原理

Agent 基准按环境分：(1) **多环境**：AgentBench 统一 8 类环境（OS、DB、知识图谱、数字游戏等）测通用性；(2) **网页**：WebArena 在自建可重置网站集群做信息检索/操作；(3) **工具**：ToolBench 评 API 检索与调用规划；(4) **真实任务**：GAIA 用需多模态+多工具的真实开放问题。评测指标以**任务成功率**为主，辅以轨迹效率（步数）、工具调用正确率。可复现性靠容器快照 + 固定种子重置。

## 三、形式化与数学基础

设任务 $\tau$，Agent 产生轨迹 $\xi=(a_1,o_1,\dots,a_T,o_T)$ 与最终答案 $\hat y$，环境给出二值完成 $C(\tau,\xi)\in\{0,1\}$：

$$\text{SR} = \frac{1}{|\mathcal{T}|}\sum_{\tau} C(\tau,\xi_\tau)$$

轨迹效率可定义为达成任务的平均步数或冗余动作占比：

$$\text{Eff} = \frac{1}{|\mathcal{T}|}\sum_{\tau} \frac{|\xi_\tau^{\text{useful}}|}{|\xi_\tau|}$$

GAIA 额外用「步骤通过率」分层：每步子目标 $g_j$ 是否完成：

$$\text{StepAcc} = \frac{1}{\sum_j 1}\sum_j \mathbf{1}(g_j\ \text{done})$$

## 四、代码实现

```python
from agentbench import make_env, reset, step, evaluate

for task in agentbench.tasks:
    env = make_env(task.env_name)
    reset(env, seed=task.seed)          # 关键：可复现
    obs = env.reset()
    traj = []
    for _ in range(task.max_steps):
        action = agent.act(obs, task.goal)
        obs, done = step(env, action)
        traj.append(action)
        if done: break
    score = evaluate(env, task)         # 成功率
    print(task.id, score, len(traj))
```

WebArena 需起 docker 集群并 `docker-compose restart` 重置，保证每任务同一起点。

## 五、与其他基准对比

| 基准 | 环境 | 真实性 | 可复现 |
|---|---|---|---|
| AgentBench | 多类 | 中 | 强 |
| WebArena | 网页 | 高 | 强 |
| ToolBench | API | 中 | 中 |
| GAIA | 真实任务 | 极高 | 中 |

## 六、常见误区

- 只看最终答案：忽略轨迹可暴露越权/冗余，易掩盖风险。
- 环境不重置：状态残留使分数不可比、不可复现。
- 用单轮评测思路：Agent 需多步，步数预算与失败恢复都要测。
- 忽略安全：评测中含越权操作应计负分。

## 七、与开源书·权威来源对应

- Liu et al., *AgentBench*, 2023；Zhou et al., *WebArena*, 2023。
- Qin et al., *ToolBench*, 2023；Mialon et al., *GAIA*, 2023（NeurIPS）。
- LangChain `langsmith` 轨迹评估文档。

## 八、面试题

1. Agent 基准为何强调环境可复现？答：网页/系统状态必须重置，否则轨迹与成功率不可比、不可复现。
2. 为何轨迹比答案更重要？答：轨迹暴露越权、冗余、失败恢复能力，仅看答案会漏风险。
3. GAIA 测什么？答：需多工具+多模态的真实开放任务，贴近人类复杂需求。

## 九、演进与趋势

Agent 评测走向「真实浏览器/桌面 + 多 Agent 协作 + 长程任务」，并引入安全/合规维度（如是否越权、是否泄露隐私）。标准化轨迹记录（OpenAI Agents 轨迹格式）便于横向对比。

## 十、小结

Agent 基准以可重置环境 + 多步成功率 + 轨迹评估为核心，从多环境 AgentBench 走向真实任务 GAIA。可复现性与对「过程」而非仅「结果」的审视，是 Agent 评测区别于单轮基准的根本。
