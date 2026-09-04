# ReAct 推理-行动智能体

> 对应 Yao et al. 2022《ReAct: Synergizing Reasoning and Acting in Language Models》及开源仓库 run-llama/llama_index。

## 一、背景与挑战
纯推理链（CoT）缺乏与外部世界交互，容易事实错误；纯行动（如通过 API 调用）又缺乏中间规划，难以处理多步任务。ReAct 将二者融合，让模型交替产生思考（Thought）与行动（Action）。

## 二、核心原理
ReAct 提示模板定义三种轨迹：Thought（自然语言推理）、Action（调用工具，如 Search[entity]）、Observation（工具返回）。模型在 Thought 中分解问题，在 Action 中调用检索或计算工具，再基于 Observation 继续推理，形成「思考-行动-观察」循环。

## 三、形式化与数学基础
轨迹可写为联合序列：
$\tau = (t_1, a_1, o_1, t_2, a_2, o_2, \dots, t_n, a_n)$
模型在每一步最大化：
$P_\theta(t_i, a_i \mid x, \tau_{<i})$
其中 $\tau_{<i}$ 包含此前所有 thought/action/observation，工具返回 $o_i = \text{Tool}(a_i)$。

## 四、代码实现
```python
def react_loop(llm, tools, question, max_steps=5):
    traj = [("Thought", "我需要先检索实体背景")]
    for i in range(max_steps):
        action = llm.pick_action(traj, question)
        obs = tools[action.name](action.arg)
        traj.append(("Action", action))
        traj.append(("Observation", obs))
        if action.name == "Finish":
            return action.arg
    return None
```

## 五、与其他技术对比
相比 CoT，ReAct 通过工具获得实时事实，缓解幻觉；相比 Self-RAG 的标记级反思，ReAct 更接近「提示驱动」的通用智能体范式，可插拔任意工具，但可靠性依赖提示设计与工具稳定性。

## 六、常见误区
误区一：认为 ReAct 只能接搜索引擎，实际上可接任意函数（计算器、数据库、代码执行）。误区二：把 Observation 当作可信事实，未对工具返回做校验会导致错误传播。

## 七、与开源书/权威来源对应
- Yao et al. 2022 给出 ReAct 在问答与决策任务上的系统实验。
- run-llama/llama_index 的 ReAct Agent 是工程落地参考。
- Wei et al. 2022 的 chain-of-thought 是推理部分的前身。

## 八、面试题
1. ReAct 中 Thought 与 Action 的顺序为什么重要？
2. 工具返回格式不一致时如何让智能体鲁棒解析？
3. ReAct 与 Reflexion 的差异是什么？

## 九、演进与趋势
ReAct 演化为多智能体协作（如 AutoGen）、与记忆/规划模块结合，并出现把行动空间离散化后用强化学习（PPO/GRPO）训练的范式，提升长程任务成功率。

## 十、小结
ReAct 用交错推理与行动统一了「想」和「做」，是现代检索增强智能体的核心骨架。
