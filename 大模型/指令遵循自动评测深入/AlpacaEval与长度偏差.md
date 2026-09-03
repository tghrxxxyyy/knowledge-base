# AlpacaEval与长度偏差

> 对应 Dubois et al. 2023 "AlpacaEval: A Single Model for Many LLM-as-a-Judge" 及长度偏差研究。

## 一、背景与挑战

AlpacaEval 用 LLM 裁判对模型回答与参考做 pairwise 比较，汇总为胜率。显著问题：裁判偏好更长回答（verbosity bias），使冗长模型虚高。

## 二、核心原理

自动裁判对 (response, reference) 比较给出胜者，聚合为排行榜。长度偏差通过长度控制实验量化：在控制长度后重排，观察名次变化。

## 三、数学形式

长度偏回归：

$$
\mathrm{win}= \beta_0+\beta_1\cdot\mathrm{len}+\epsilon
$$

控制长度后的调整胜率：

$$
\hat{w}=w-\hat{\beta}_1(\mathrm{len}-\bar{\mathrm{len}})
$$

## 四、代码实现

```python
def adjust_win(w, length, mean_len, beta):
    return w - beta * (length - mean_len)

print(round(adjust_win(0.6, 1200, 800, 0.0001), 4))
```

## 五、与其他对比

相比 MT-Bench（多轮），AlpacaEval 单轮快；相比人工，它更易受长度偏差。后续 AlpacaEval 2 引入长度去偏。

## 六、常见误区

误区一：高 AlpacaEval 即能力强（可能只是长）。误区二：忽略参考选择偏差。误区三：跨版本直接比较。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- dair-ai/Prompt-Engineering-Guide：https://github.com/dair-ai/Prompt-Engineering-Guide

## 八、面试题

- Q：AlpacaEval 主要偏差？答：长度/冗长偏差，偏好更长回答。
- Q：如何缓解？答：长度控制回归调整或长度去偏裁判。

## 九、演进

从 AlpacaEval 到 2.0（长度去偏 + GPT-4 参考），偏差量化成为标配。

## 十、小结

AlpacaEval 以自动 pairwise 实现快速排行，但长度偏差需用调整胜率修正。
