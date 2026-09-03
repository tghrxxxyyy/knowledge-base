# Token计费模型

> 对应按 token 计费（OpenAI 式 pricing）；输入与输出分别计价。主流 API 按 token 计费。

## 一、背景与挑战

LLM 成本主要来自 token，输入与输出价不同，需分别计量。

## 二、核心原理

计费按输入 token 数乘输入单价加输出 token 数乘输出单价；用 tokenizer 精确计数。

## 三、数学形式

费用 $fee = n_{in}\cdot p_{in} + n_{out}\cdot p_{out}$；注意缓存命中价更低。

## 四、代码实现

```python
nin = len(tok.encode(prompt))
nout = len(tok.encode(completion))
fee = nin * p_in + nout * p_out
```

## 五、与其他对比

- 与 GPU利用率核算（底层成本）对照。
- 与 批处理成本优化（批摊薄）衔接。

## 六、常见误区

- 忽略输出价远高于输入价。
- 缓存命中仍按全价计致虚高。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- dair-ai/Prompt-Engineering-Guide：https://github.com/dair-ai/Prompt-Engineering-Guide

## 八、面试题

- 为何输入输出分开计价？答：输出需逐 token 生成、算力远高于输入编码。

## 九、演进

字数 → token → 输入、输出、缓存分层。

## 十、小结

Token 计费是最直观的成本单位，须区分输入输出与缓存。
