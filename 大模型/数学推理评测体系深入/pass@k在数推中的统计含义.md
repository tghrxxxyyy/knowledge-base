# pass@k在数推中的统计含义

> 对应 Chen et al. 2021 "Evaluating Large Language Models Trained on Code" 中 pass@k 的无偏估计，广泛用于数学采样评测。

## 一、背景与挑战

单次采样准确率低估模型能力（可能一次没采到正确解）。pass@k 估计"采样 k 次至少一次正确"的概率，但朴素估计方差大，需无偏修正。

## 二、核心原理

从 n 次采样中 c 次正确，无偏 pass@k 用组合数给出。数学推理中常以 k=8/16/64 报告，反映"是否具备该能力"而非"是否稳定输出"。

## 三、数学形式

无偏估计：

$$
\mathrm{pass@k}=1-\frac{\binom{n-c}{k}}{\binom{n}{k}}
$$

期望形式（大 n 近似）：

$$
\mathbb{E}[\mathrm{pass@k}]\approx 1-(1-p)^k
$$

## 四、代码实现

```python
from math import comb

def pass_at_k(n, c, k):
    if n < k:
        return 0.0
    if n - c < k:
        return 1.0
    return 1.0 - comb(n - c, k) / comb(n, k)

print(pass_at_k(200, 40, 16))
```

## 五、与其他对比

相较 exact-match 单点，pass@k 更宽松更全面；相较 majority vote，它测上限而非稳定性。两者常并列报告。

## 六、常见误区

误区一：把 pass@k 当可用部署指标。误区二：n 太小导致估计不稳。误区三：混淆 pass@k 与投票准确率。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Q：为何需要无偏 pass@k？答：朴素按频率估计有偏，组合数修正才无偏。
- Q：pass@k 与投票区别？答：前者测能力上限，后者测稳定输出。

## 九、演进

pass@k 从代码评测扩展到数学采样评测，成为推理能力上限报告的标准统计量。

## 十、小结

pass@k 以无偏组合估计刻画采样能力上限，是数学与代码推理评测的通用货币。
