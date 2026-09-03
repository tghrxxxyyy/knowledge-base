# 召回与排序中的 LLM

> 见「搜索推荐大模型深入/搜索推荐总览」；LLM-as-embedding / LLM-as-ranker。

## 一、背景与挑战

关键词召回漏语义；精排特征工程成本高。

## 二、核心原理

- **语义召回**：用 LLM/强编码器产 query 与 doc embedding（见嵌入检索几何），替代/补充 BM25。
- **LLM 重排**：把候选列表喂给 LLM 让其重排（pointwise 打分或 listwise 输出顺序），质量高但慢。
- **查询改写**：LLM 扩展/改写 query 提升召回。

## 三、关键要点

- 重排只在 top-k 候选做（省成本）。
- 生成式重排需约束输出格式。

## 四、代码实现

```python
rank = llm(f"对候选按相关性排序: {candidates}")
```

## 五、与其他对比

- 双塔快但粗；LLM 精但慢。

## 六、常见误区

- 重排全量——延迟不可承受。

## 七、与开源书对应

- llm-course: https://github.com/mlabonne/llm-course
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 为何 LLM 重排只用于 top-k？

## 九、演进

BM25 → 双塔 → LLM 重排。

## 十、小结

LLM，是排序的「终审法官」。
