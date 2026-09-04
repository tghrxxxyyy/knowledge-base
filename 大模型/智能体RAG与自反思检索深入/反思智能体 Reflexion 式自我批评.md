# 反思智能体 Reflexion 式自我批评

> 对应 Yao et al. 2022《ReAct》智能体范式与开源仓库 run-llama/llama_index 的反思式 Agent 实现。

## 一、背景与挑战
许多任务需要多轮试错，单轮 ReAct 在首次失败后缺乏从错误中学习的能力，重复犯同样错误。反思机制把失败轨迹转为自然语言经验，存入记忆供后续参考。

## 二、核心原理
智能体执行任务得到轨迹与奖励（或人类/校验器反馈），若失败则用 LLM 生成一段反思摘要，描述「哪里错了、应如何调整」。该摘要写入长期记忆，下次任务提示中附带历史反思，从而改进决策。

## 三、形式化与数学基础
把反思视为对策略的隐式更新：
$\pi_{t+1}(a \mid s) \propto \pi_t(a \mid s) \cdot \exp(\alpha \cdot \text{Refl}(s, \tau_{fail}))$
其中 $\text{Refl}$ 为反思文本经编码后的偏置项，$\alpha$ 控制经验强度，无需重训权重即改变行为分布。

## 四、代码实现
```python
def reflexion_agent(llm, env, task, memory, episodes=3):
    for _ in range(episodes):
        traj = run_agent(llm, task, memory)
        reward = env.evaluate(traj)
        if reward < 1.0:
            refl = llm.reflect(task, traj, reward)
            memory.append(refl)  # 将反思写入长期记忆
        else:
            return traj
    return None
```

## 五、与其他技术对比
相比标准 ReAct，Reflexion 增加跨 Episode 的记忆与自我批评；相比基于梯度的 RL，它不更新权重、更易调试。代价是上下文随反思累积变长，需要摘要压缩。

## 六、常见误区
误区一：反思越多越好，冗余反思反而淹没当前任务。误区二：把 LLM 生成的反思当作真因，反思本身可能错误，需配合可验证奖励。

## 七、与开源书/权威来源对应
- Yao et al. 2022 的 ReAct 提供行动-观察骨架。
- run-llama/llama_index 提供带记忆与反思的 Agent 模块。
- Ouyang et al. 2022 的 RLHF 揭示了反馈信号对行为塑形的重要性。

## 八、面试题
1. Reflexion 与传统强化学习在更新方式上的本质区别？
2. 反思记忆无限增长会带来什么问题，如何裁剪？
3. 如何设计可靠的奖励信号以触发有效反思？

## 九、演进与趋势
反思与显式世界模型、树搜索（如思维树）结合，形成「尝试-反思-规划」闭环；并用偏好优化把反思经验蒸馏进模型权重。

## 十、小结
反思式智能体用自然语言经验替代梯度更新，是一种轻量、可解释的持续学习路径。
