# Needle-in-a-Haystack原理

> 对应 Kamradt "LLM Needle In A Haystack" 长上下文检索压力测试。

## 一、背景与挑战

模型宣称支持 128k/200k 上下文，但实际能否在长文本任意位置检索事实存疑。Needle 测试把关键句（针）插入长文本（草堆）不同深度与位置，要求模型 recall。

## 二、核心原理

在随机长度（4k-200k）与随机深度（0-100%）插入事实，问及该事实。评测绘制热力图：位置 x 长度 -> 准确率。暴露"中间遗忘"与长距衰减。

## 三、数学形式

检索准确率：

$$
\mathrm{Acc}=\mathbf{1}[\mathrm{ans}= \text{needle}]
$$

按深度分层：

$$
A(d)=\mathbb{E}_{x}[\mathbf{1}[\mathrm{retrieve}(x,d)]]
$$

## 四、代码实现

```python
def inject_needle(text, needle, depth):
    idx = int(len(text) * depth)
    return text[:idx] + needle + text[idx:]

doc = "filler " * 1000
print(inject_needle(doc, "KEY=42", 0.5)[:30])
```

## 五、与其他对比

相比 QA 基准，Needle 是合成探针更可控；相比 RULER，它只测检索不测多任务。

## 六、常见误区

误区一：Needle 满分即长文本理解强（仅检索）。误区二：忽略深度维度。误区三：用短 needle 低估难度。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- Q：Needle 测什么能力？答：长上下文中任意位置的事实检索。
- Q：热力图揭示什么？答：中间与远端位置的准确率塌陷。

## 九、演进

从单 needle 到多 needle、到 RULER 多任务，长文本评测日益综合。

## 十、小结

Needle 以合成探针量化长上下文检索可靠性，是长文本能力的第一道压力测试。
