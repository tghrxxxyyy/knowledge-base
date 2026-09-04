# LLM-as-judge 基础范式与自洽性

> 对应 Zheng 2023 LLM-as-judge (MT-Bench) 与 Brown 2020 in-context learning。

## 一、背景与挑战
人工评测大模型输出成本高、不可复现，且难以在 CI 中复用。LLM-as-judge 用强模型替代人类打分，核心挑战是裁判模型自身存在偏差、不稳定，以及与人类判断的对齐程度未知。

## 二、核心原理
给定问题 x 与两个回答 a、b，裁判模型在提示中先输出理由再输出偏好。其本质是把不可微的人类偏好估计过程用一个可调用模型近似，从而把评测变成可批量、可复现的函数调用。

## 三、形式化与数学基础
裁判与人类的一致性常用 Cohen kappa 度量：
$ \kappa = \frac{p_o - p_e}{1 - p_e} $
其中 $p_o$ 为观测一致率，$p_e$ 为随机一致率。$\kappa$ 越接近 1 越好。

## 四、代码实现
```python
def judge(prompt, a, b, model):
    # 构造成对比较提示
    sys = 'You are a fair judge. Output A or B with rationale.'
    user = f'Question: {prompt}\nA: {a}\nB: {b}\nWho is better?'
    return model.generate(sys, user)
```

## 五、与其他技术对比
相比规则匹配更灵活，相比人类标注更廉价且可复现，但会继承训练数据中的价值观与风格偏好，对长度、格式敏感。

## 六、常见误区
认为裁判永远正确；忽略位置偏差与自我偏好偏差；未做人工校准即直接上线用于决策。

## 七、与开源书/权威来源对应
Zheng 2023 提出 MT-Bench 并系统实验裁判一致性；Brown 2020 给出少样本评测的方法论基础。

## 八、面试题
如何量化裁判与人类的一致性？位置偏差应如何缓解？

## 九、演进与趋势
从单一裁判到多裁判投票，从 pairwise 到带 rubric 的打分制，并引入自我一致性校准。

## 十、小结
LLM-as-judge 是自动评测的核心范式，但必须配合一致性度量与人工抽检方可信赖。
