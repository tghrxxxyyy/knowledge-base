# Reflexion语言强化

> 对应 Shinn et al., *Reflexion: Language Agents with Verbal Reinforcement Learning*, NeurIPS 2023。

## 一、背景与挑战

在决策式任务里，失败后的经验通常需要梯度更新才能利用，但对闭源或大模型而言反复微调不现实。
Reflexion 提出用自然语言承载「策略改进」：失败后写一段自我反思存入记忆，下一次尝试把它当作额外上下文，从而在不改权重的情况下跨试次学习。

## 二、核心原理

- 三个部件：执行器（与环境交互产出轨迹）、评估器（给出成功/失败或标量反馈）、自我反思器（把失败轨迹压缩成可操作教训）。
- 反思文本进入长期记忆缓冲，后续 episode 以「上次为何失败、这次应避免什么」的形式注入提示。
- 学习信号是语言而非梯度：更新发生在上下文中，因此单任务内可快速迭代，但不会沉淀到权重里。

## 三、数学形式

把语言记忆 $m$ 视为策略条件：$\pi_\theta(a\mid s, m)$，试次 $i$ 后更新 $m_{i+1}=m_i\cup \{\mathcal F(\tau_i, r_i)\}$。

与策略梯度对照：策略梯度是 $\theta\!\leftarrow\!\theta+\alpha\nabla_\theta\log\pi_\theta(a\mid s)A$，而这里被替换成对条件变量 $m$ 的非参数更新，故称语言强化。

## 四、代码实现

```python
memory = []
for episode in range(N):
    traj, reward = rollout(policy, env, hints=memory[-3:])
    if reward >= threshold:
        break
    lesson = llm(f"任务失败轨迹:\n{traj}\n用三条要点写出下次应改进之处")
    memory.append(lesson)          # 语言形式的经验回放
```

## 五、与其他对比

- 与 ReAct：ReAct 是单 episode 内的思考—行动交错；Reflexion 在其外层加跨 episode 的经验循环。
- 与 RL 微调：无需梯度与环境海量交互，但记忆受上下文长度限制，且不具备跨任务的参数级泛化。

## 六、常见误区

- 把整条失败轨迹原文塞进记忆：噪声大、占用上下文，应压缩成少量可执行教训。
- 记忆无界增长导致后期提示被历史淹没，需要按相关性检索或滚动淘汰。
- 在没有可靠成功判定的任务上使用：评估器错误会把错误教训固化，越试越偏。

## 七、与开源书对应

- dair-ai/Prompt-Engineering-Guide（Reflexion 与 ReAct 章节）：https://github.com/dair-ai/Prompt-Engineering-Guide
- mlabonne/llm-course（Agent 与强化学习相关章节）：https://github.com/mlabonne/llm-course

## 八、面试题

- 为什么叫「语言强化」？答：奖励信号被转写为自然语言教训并作为上下文影响下次行为，起到类似策略更新的作用但不改参数。
- 它的主要限制是什么？答：依赖可靠的成功/失败判定与有限上下文，经验不沉淀到权重，跨任务迁移弱。

## 九、演进

单次尝试 → 失败重采样 → 语言反思记忆（Reflexion）→ 反思经验检索复用 → 反思数据回流做微调。

## 十、小结

Reflexion 把「经验」从梯度搬到文本，用极低成本实现试错学习，代价是记忆容量与评估器可靠性。
