# Agent 评测总览

> 对应 llm-course 与 Agent 评估综述；智能体评测比模型更难。

## 一、背景与挑战

Agent 多步决策、工具调用、环境交互，单点指标失效。

## 二、核心原理

评测分层：单工具调用正确性、任务完成率、轨迹质量、端到端成功率、鲁棒性（扰动下）、效率（步数/成本）。需可复现环境与多轮评测集（如 WebArena/GAIA/AgentBench）。

## 三、关键要点

- 端到端成功率最直观但贵。
- 轨迹可解释性利于诊断。

## 四、代码实现

```python
for task in benchmark:
    traj = agent.run(task); score = eval(traj, task.gold)
```

## 五、与其他对比

| 对象 | 指标 |
|------|------|
| 模型 | 单点 |
| Agent | 轨迹/成功率 |

## 六、常见误区

- 只看最终答案——轨迹错也危险。

## 七、与开源书对应

- llm-course: https://github.com/mlabonne/llm-course
- 见「智能体工程深入」。

## 八、面试题

- Agent 评测为何比模型评测难？

## 九、演进

单点 → 轨迹 → 环境基准。

## 十、小结

Agent 评测，看「全过程」。
