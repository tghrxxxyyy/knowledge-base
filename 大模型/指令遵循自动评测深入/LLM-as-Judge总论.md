# LLM-as-Judge总论

> 对应 Zheng et al. 2023 "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena"。

## 一、背景与挑战

人工评测昂贵且不可规模化，LLM-as-Judge 用强模型当裁判。挑战是裁判自身有偏差（位置、冗长、自偏好），且与人类一致性需严格验证。

## 二、核心原理

让裁判模型对回答打分或 pairwise 比较。两种模式：pointwise（独立打分）与 pairwise（二选一）。需校准裁判与人类标注的一致性（如相关性系数）。

## 三、数学形式

与人类的 Spearman 相关：

$$
\rho=1-\frac{6\sum d_i^2}{n(n^2-1)}
$$

裁判一致性（配对一致率）：

$$
A=\frac{1}{N}\sum\mathbf{1}[\hat{y}_i=y_i^{\mathrm{human}}]
$$

## 四、代码实现

```python
def spearman(diffs, n):
    return 1 - 6*sum(d*d for d in diffs)/(n*(n**2-1))

print(round(spearman([0,1,2,1,0], 5), 3))
```

## 五、与其他对比

相比人工评测，LLM-judge 便宜可扩展但有偏差；相比规则评测，它更灵活但需校准。

## 六、常见误区

误区一：裁判模型永远客观。误区二：高一致即无偏（可能有共同偏差）。误区三：用同一模型自评（自偏好）。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- dair-ai/Prompt-Engineering-Guide：https://github.com/dair-ai/Prompt-Engineering-Guide
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Q：LLM-as-Judge 两大模式？答：pointwise 打分与 pairwise 比较。
- Q：如何验证裁判可靠？答：与人类标注算相关性与一致率。

## 九、演进

从简单打分到结构化 rubric、多裁判投票与 self-consistency 裁判，偏差持续被研究。

## 十、小结

LLM-as-Judge 以可扩展性换偏差风险，校准与人类一致性是其生命线。
