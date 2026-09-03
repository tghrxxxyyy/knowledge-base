# LiveCodeBench与持续评测

> 对应 Jain et al. 2024 "LiveCodeBench: Holistic and Contamination-Free Evaluation of LLMs for Code"。

## 一、背景与挑战

HumanEval/MBPP 已大量泄漏进训练集，分数失真。LiveCodeBench 用竞赛题（LeetCode/Codeforces）按时间窗口收集，确保评测时题目未公开，抗污染。

## 二、核心原理

持续抓取竞赛题并设定发布缓冲期，分时段评测防止泄漏。除 pass@k 还报格式遵从、指令遵循与 repo 级任务，提供时间切片对比。

## 三、数学形式

按时间窗口污染率：

$$
\pi(t)=\frac{|\mathcal{D}_{\mathrm{train}}^{(t)}\cap\mathcal{Q}|}{|\mathcal{Q}|}
$$

时段准确率：

$$
A_t=\frac{1}{|\mathcal{Q}_t|}\sum_{q\in\mathcal{Q}_t}\mathbf{1}[\mathrm{pass}(q)]
$$

## 四、代码实现

```python
def window_acc(results):
    return sum(results) / len(results) if results else 0.0

print(window_acc([1,1,0,1,1]))
```

## 五、与其他对比

相较 HumanEval（静态易污染），LiveCodeBench 时间新鲜；相较 MBPP，它更难更竞赛化。

## 六、常见误区

误区一：认为所有代码基准都已污染（新题仍可用）。误区二：忽略时间窗口设置。误区三：只用 pass@1 忽略指令遵循维度。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- Q：LiveCodeBench 抗污染机制？答：时间窗口收集竞赛题，评测时尚未公开训练。
- Q：它比 HumanEval 多了什么？答：时间切片、指令遵循与格式维度。

## 九、演进

持续评测（rolling benchmark）成为对抗数据污染的主流范式，扩展到多语言与 repo 级。

## 十、小结

LiveCodeBench 以时间新鲜度重建代码评测可信度，是防泄漏评测的标杆。
