# TruthfulQA深度解析

> 对应 Lin et al. 2021 "TruthfulQA: Measuring How Models Mimic Human Falsehoods"。

## 一、背景与挑战

模型常复制训练数据中的人类误解（如迷信、谣言），而非刻意说谎。TruthfulQA 用 817 道易触发误解的题测真实性。

## 二、核心原理

每题含问题、人工正确答案与常见错误答案。评测用模型生成是否被人类标注者判为真实。强调"truthful而非仅informative"。

## 三、数学形式

真实率：

$$
\mathrm{Truth}=\frac{1}{N}\sum_{i}\mathbf{1}[y_i\text{ truthful}]
$$

与模仿错误的负相关：

$$
\rho=\mathrm{Corr}(\mathrm{imitative}, \mathrm{false})
$$

## 四、代码实现

```python
def truth_rate(labels):
    return sum(labels)/len(labels)

print(truth_rate([1,1,0,1,0]))
```

## 五、与其他对比

相比 FACT 类事实题，TruthfulQA 测"避免人类错觉"；相比 MMLU（知识），它测抗误导。

## 六、常见误区

误区一：高分即知识强（它测的是不传播误解）。误区二：用准确率混淆真实率。误区三：忽略反向题。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：TruthfulQA 测什么？答：模型是否模仿训练中的人类错误信念。
- Q：为何设计常见错误答案？答：作为诱饵测模型是否落入误区。

## 九、演进

TruthfulQA 开启"真实性"独立维度，影响 RLHF 中 truthful 奖励设计。

## 十、小结

TruthfulQA 以易误导题集隔离真实性，是幻觉事实维度的经典基准。
