# SQL 与 NL2SQL 模型

> 见「大模型与NL2SQL/大纲」与「代码大模型深入/代码模型总览」。

## 一、背景与挑战

把自然语言转 SQL 是代码生成的特殊场景，对准确性要求高。

## 二、核心原理

专用或通用模型结合 schema 检索、Few-shot、执行校验生成 SQL；配套 Text2SQL 数据集（Spider 等）训练/评测。

## 三、代码实现

```python
sql = llm(f"schema:{schema}\n问:{q}\n仅输出SQL")
valid = execute_check(sql, db)
```

## 四、关键要点

- 相对时间（最近N天）翻译是难点。
- 执行自校验可降错。

## 五、与其他对比

- 通用代码模型可生成 SQL；专用流程更稳（含校验）。

## 六、常见误区

- 模型直接出 SQL 即可——缺 schema 易错。

## 七、与开源书对应

- Spider: https://github.com/taoyds/spider
- llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- NL2SQL 为何需要 schema 检索？

## 九、演进

规则 →  seq2seq → LLM+校验。

## 十、小结

NL2SQL 是代码模型的高价值落地。
