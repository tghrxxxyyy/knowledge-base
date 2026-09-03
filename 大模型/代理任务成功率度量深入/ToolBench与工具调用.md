# ToolBench与工具调用

> 对应 Qin et al. 2023 "ToolLLM: Facilitating Large Language Models to Master 16000+ Real-world APIs" (ToolBench)。

## 一、背景与挑战

工具调用代理需从海量 API 中检索、规划、执行并汇总。评测难点是 API 空间巨大、执行真实服务不稳定、且需测泛化。

## 二、核心原理

ToolBench 提供真实 API 环境与指令，评测用通过率（是否得到可用结果）与执行成功率，并以 GPT-4 裁判评响应质量。

## 三、数学形式

工具调用通过率：

$$
\mathrm{Pass}=\frac{1}{N}\sum\mathbf{1}[\mathrm{exec}(a)=\mathrm{valid}]
$$

计划步准确率：

$$
\mathrm{Step}=\frac{|\mathrm{correct\_calls}|}{|\mathrm{total\_calls}|}
$$

## 四、代码实现

```python
def tool_pass(results):
    return sum(1 for r in results if r["valid"])/len(results)

print(tool_pass([{"valid":True},{"valid":False},{"valid":True}]))
```

## 五、与其他对比

相比 WebArena（网页），ToolBench 面向 API；相比静态函数调用，它真实执行更贴近实用。

## 六、常见误区

误区一：调用格式对即成功（需执行有效）。误区二：忽略 API 选择错误。误区三：评测用模拟服务失真。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Q：ToolBench 测什么？答：从海量 API 检索、规划、执行的真实工具调用能力。
- Q：为何需真实执行？答：格式对不等于结果有效。

## 九、演进

从函数调用格式评测到真实 API 执行，工具代理评测走向实用化。

## 十、小结

ToolBench 以真实 API 执行评测工具调用，连接格式正确与结果有效的鸿沟。
