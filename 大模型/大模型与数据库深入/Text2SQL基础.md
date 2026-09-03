# Text2SQL 基础

> 见「大模型与数据库深入/大模型与数据库总览」；Zhong et al., *Seq2SQL*, 2017；Yu et al., *Spider*, 2018。

## 一、背景与挑战

将自然语言问题映射到 SQL 需理解语义与表结构。

## 二、核心原理

早期用序列到序列（Seq2Seq）加指针网络（Pointer-Generator）拷贝表名/列名；Spider 数据集树立了跨库泛化评测标准。现代用大模型做 few-shot + schema 提示，准确率大幅提升。

## 三、数学形式

生成概率：`P(SQL|Q, schema) = Π_t P(token_t | token_<t, Q, schema)`。

## 四、代码实现

```python
prompt = f"Tables: {schema_str}\nQ: {q}\nGenerate SQL:"
sql = llm(prompt, stop=[";"]).strip() + ";"
```

## 五、关键要点

- 跨库泛化（未见过表结构）是难点。
- 列/表名需原样出现（拷贝机制）。

## 六、与其他对比

- 模板死板；神经/大模型灵活。

## 七、常见误区

- 训练集见过表就能泛化——跨库才见真章。

## 八、与开源书对应

- Yu et al., Spider, 2018.
- llm-universe: https://github.com/datawhalechina/llm-universe

## 九、面试题

- Spider 评测为何强调跨库泛化？

## 十、演进

Seq2SQL → Spider 基准 → 大模型 prompt。

## 十一、小结

Text2SQL，是语义到语法的桥。
