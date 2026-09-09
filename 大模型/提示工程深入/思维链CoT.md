# 思维链 Chain-of-Thought

> 对应 Wei et al., *Chain-of-Thought Prompting Elicits Reasoning in LLMs*, 2022 与 Kojima et al., *Large Language Models are Zero-Shot Reasoners*, 2022。

## 一、背景与挑战

大模型直接「给问题、要答案」时，对多步算术、常识、符号推理容易一步错、全盘错。原因之一是：把困难映射 $x\to y$ 压到单次生成，模型在中间过程缺乏显式展开，错误难以被发现与纠正。Chain-of-Thought（CoT）通过**让模型先输出中间推理步骤、再给最终答案**，把隐式推理外显，显著提升复杂推理准确率，且无需微调、仅靠提示即可触发。

## 二、核心原理

CoT 的思想是「分而治之」：把单步难问题拆成若干模型能力范围内的小步。两种主要形式：

- **少样本 CoT**：在 prompt 中给出若干「问题 → 思考步骤 → 答案」的示范，模型据此模仿展开；
- **零样本 CoT**：仅加一句触发语如「让我们一步步思考（Let's think step by step）」（Kojima et al., 2022），无需示例即能激发推理链。

关键是用分隔符（如「思考：/答案：」）让推理步骤与最终答案清晰分开，便于下游只取答案。

## 三、形式化与数学基础

把难题 $x$ 的解分解为中间状态序列 $z_1,\dots,z_n$ 再到 $y$。CoT 让模型近似建模：

$$P(y\mid x) \approx \sum_{z_{1..n}} P(z_1\mid x)\prod_{i>1}P(z_i\mid x,z_{<i})\,P(y\mid x,z_{1..n}).$$

通过显式生成 $z$，把难的单步 $x\to y$ 拆成易的 $x\to z_1\to\cdots\to y$，每步在模型能力强范围内，整体正确性提高。**自洽性（self-consistency）**进一步对多条推理链采样、按最终答案投票：

$$\hat y = \text{majority}\big(\{y^{(k)}\}_{k=1}^K\big),$$

常比贪心单链更强。

## 四、代码实现

少样本 CoT 示范（写入 prompt）：

```text
问题：小刚有5个苹果，吃了2个，又买3箱每箱4个，共几个？
思考：初始5，吃2剩3；买3×4=12；共3+12=15。
答案：15

问题：{用户输入}
思考：
```

零样本 CoT（仅追加触发句）：

```python
prompt = user_q + "\n让我们一步步思考。"   # 或英文 "Let's think step by step."
resp = model.generate(prompt)
# 再让模型基于思考给最终答案（可二次提问 "综上，答案是？"）
```

自洽性：多次采样取答案众数（示意）：

```python
answers = [extract_answer(model.generate(prompt)) for _ in range(5)]
final = max(set(answers), key=answers.count)
```

## 五、与其他技术对比

| 形式 | 是否需要示例 | 额外成本 | 效果 |
|------|------------|---------|------|
| 直接回答 | 否 | 低 | 复杂题易错 |
| 少样本 CoT | 是 | 中（长 prompt） | 强 |
| 零样本 CoT | 否 | 低 | 中强 |
| 自洽 CoT | 否/是 | 高（多采样） | 最强 |

## 六、常见误区

- **把推理步骤当最终答案**：需明确分隔，下游只解析「答案：」段。
- **简单任务硬加 CoT**：反而增加延迟、无意义，甚至引入多余错误。
- **以为 CoT 改变模型权重**：它只是提示技巧，不改参数。
- **忽视触发句语言**：零样本 CoT 在中英文下效果可能不同，需实测。
- **长链累积误差**：CoT 步数越多，单步错越易被后续引用放大，关键任务应加自洽或校验。
- **与函数调用混用不清**：需要外部事实时应结合工具调用验证中间结论，而非纯脑内推理。

## 七、与开源书·权威来源对应

- Wei et al., *Chain-of-Thought Prompting Elicits Reasoning in LLMs*, 2022。
- Kojima et al., *Large Language Models are Zero-Shot Reasoners*, 2022。
- Prompt-Engineering-Guide（CoT）：https://www.promptingguide.ai/zh/techniques/cot
- 进阶：本系列「思维树 ToT」「自动提示工程 APE」。

## 八、面试题

- 为什么 CoT 能提升复杂推理？其数学直觉是什么？
- 零样本 CoT 的关键触发句是什么？谁提出？
- 自洽性（self-consistency）如何进一步提升效果？代价？

## 九、演进与趋势

CoT 衍生出 **Zero-Shot CoT、Self-Consistency、Least-to-Most（先分解子问题再依次解）、CoT-SC**；并与 **ReAct**（推理+工具）、**ToT**（树状搜索）、以及 **Auto-CoT**（自动构造示范）结合。CoT 也是训练「推理模型」（如 o1 类）所依赖的推理轨迹来源之一。

## 十、小结

Chain-of-Thought 通过提示模型先输出中间推理步骤再给答案，把困难问题拆成易步、显著提升算术/常识/符号推理准确率；少样本给示范、零样本靠触发语即可激发，自洽性以多采样投票进一步增强——是提示工程中最核心的推理增强技术。
