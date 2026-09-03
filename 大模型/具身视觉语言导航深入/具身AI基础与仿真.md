# 具身AI基础与仿真

> 对应 具身智能研究（如 Habitat、AI2-THOR、SAPIEN 仿真器及 embodied AI 综述）。

## 一、背景与挑战

具身 AI 强调智能体在物理/仿真环境中通过感知-行动学习。瓶颈在仿真真实感、动作空间定义与样本效率。挑战是 sim-to-real、稀疏奖励与多任务泛化。

## 二、核心原理

仿真器提供可微分/高效渲染与物理。智能体观测（RGB/深度/位姿）经编码器成状态，策略输出动作（离散导航或连续控制）。训练可用 RL（PPO）或 IL（模仿）。具身预训练（如视觉表征）提升样本效率。

## 三、数学形式

POMDP：状态 s、观测 o、动作 a、转移 p、奖励 r。策略优化：
\max_\pi \mathbb{E}_{\tau\sim\pi}\left[\sum_t \gamma^t r_t\right]
IL 则最小化 \mathbb{E}[\|a_t - a_t^{expert}\|^2] 或行为克隆交叉熵。

## 四、代码实现

```python
def rollout(env, policy, max_step=50):
    obs = env.reset(); total=0
    for _ in range(max_step):
        a = policy(obs)
        obs, r, done, _ = env.step(a)
        total += r
        if done: break
    return total
```

## 五、与其他对比

相比纯视觉任务，具身需行动闭环；相比游戏 RL，具身更重语义与语言；仿真器速度决定可训规模。Habitat 强调高速渲染，THOR 强调交互。

## 六、常见误区

忽视 sim-to-real 差距；稀疏奖励不设计内在激励；混淆观测空间与状态；过度依赖 IL 致分布偏移。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：具身 AI 关键？答：感知-行动闭环、仿真与泛化。
- Q：训练范式？答：RL（PPO）与 IL（行为克隆）。
- Q：sim-to-real？答：仿真与真实差距需适配。

## 九、演进

从离散导航到连续控制；从单任务到多任务基础策略；大模型作 zero-shot 规划器。

## 十、小结

具身 AI 以仿真为训练场，把感知、语言与行动统一，是通向通用智能体的重要路径。
