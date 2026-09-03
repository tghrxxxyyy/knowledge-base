# KL 正则最优解闭式

> 对应最大熵强化学习与变分推断中的经典结论；在语言模型对齐语境下见 Ouyang et al., *InstructGPT*, NeurIPS 2022 与 Rafailov et al., *DPO*, NeurIPS 2023。

## 一、背景与挑战

RLHF 不是纯粹最大化奖励，而是在「别离基座太远」的约束下最大化奖励。这个约束不是工程补丁，而是整套理论的支点：没有它，最优策略会退化为把全部概率压在最高奖励序列上（确定性策略），语言多样性与流畅度立刻崩塌。

## 二、核心原理

带 KL 惩罚的期望奖励最大化，是一个可用拉格朗日/变分方法精确求解的凸问题（对分布 $\pi$ 而言）。解的形态是参考分布乘以奖励的指数倾斜（exponential tilting）：奖励越高的序列被按指数放大，$\beta$ 控制放大的锐度。$\beta\to 0$ 时退化为 argmax，$\beta\to\infty$ 时回到参考分布。这正是「温度」在对齐语境下的对应物。

## 三、数学形式

对每个 $x$ 独立求解 $\max_{\pi(\cdot|x)}\ \mathbb E_{y\sim\pi}[r]-\beta\mathrm{KL}(\pi\|\pi_{ref})$，得

$$\pi^*(y|x)=\frac{\pi_{ref}(y|x)\exp(r(x,y)/\beta)}{Z(x)},\qquad Z(x)=\sum_{y}\pi_{ref}(y|x)\exp\!\big(r(x,y)/\beta\big)$$

最优目标值为 $\beta\log Z(x)$（软最大值 / free energy）。$Z(x)$ 是对全序列空间求和，因而不可枚举——这正是需要 DPO 式消去技巧或采样近似的原因。

## 四、代码实现

```python
import torch

def tilted_policy(ref_logp, reward, beta=0.1):
    # 指数倾斜：log pi* = log pi_ref + r/beta - logZ
    unnorm = ref_logp + reward / beta
    logZ = torch.logsumexp(unnorm, dim=-1, keepdim=True)
    return unnorm - logZ                       # 返回 log pi*

def soft_value(ref_logp, reward, beta=0.1):
    # 最优目标值 beta * log Z(x)
    return beta * torch.logsumexp(ref_logp + reward / beta, dim=-1)
```

## 五、与其他对比

- 与 直接偏好优化深入：DPO 的隐式奖励定义就是本式的反解。
- 与 IPO：IPO 的回归目标 $1/(2\tau)$ 直接来自本闭式解在两点比较下的取值。
- 与 采样与解码策略：指数倾斜与温度采样、best-of-n 在形式上同源，后者可视为对倾斜分布的近似采样。

## 六、常见误区

- 把 $Z(x)$ 当作常数忽略。它随 prompt 变化，只是在同 prompt 配对差中抵消。
- 认为 KL 惩罚只是防过拟合。它同时决定了最优解的形态与「奖励尺度—分布锐度」的换算关系。
- 混淆前向与反向 KL。此处是 $\mathrm{KL}(\pi\|\pi_{ref})$（反向、mode-seeking 方向由目标决定），换方向会得到不同解。

## 七、与开源书对应

- d2l-zh（概率、softmax 与优化基础）：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course（RLHF 目标函数与实现）：https://github.com/mlabonne/llm-course

## 八、面试题

- 写出 KL 正则奖励最大化的最优策略形式并解释 $\beta$。答：$\pi^*\propto\pi_{ref}\exp(r/\beta)$；$\beta$ 控制指数倾斜锐度，越小越贪婪、越大越贴近参考分布。
- 为什么最优目标值是 $\beta\log Z(x)$？答：把闭式解代回目标，KL 项与奖励项合并后剩下归一化常数的对数，即 free energy。

## 九、演进

最大熵 RL / 变分推断闭式解 → RLHF 的 KL 惩罚工程实现 → DPO 的闭式反解 → 各类正则形态（KL、odds、间隔）的统一理解。

## 十、小结

这一条闭式解是偏好优化全部理论的地基：它同时给出了最优策略形态、隐式奖励定义、以及 $\beta$ 的物理含义。
