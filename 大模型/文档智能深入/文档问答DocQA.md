# 文档问答 DocQA

> 见「文档智能深入/文档智能总览」与「RAG深入」；基于文档的问答。

## 一、背景与挑战

在长文档中定位并推理答案，跨段落/表格。

## 二、核心原理

DocQA 两种：抽取式（答案在文中 span）与生成式（RAG 检索相关片段+LLM 生成）。多模态 DocQA 直接读图回答。需处理长文档分块、跨块推理。

## 三、关键要点

- 检索召回决定上限。
- 表格问答需结构感知。

## 四、代码实现

```python
chunks = split(doc); rel = retrieve(q, chunks); ans = llm(q, rel)
```

## 五、与其他对比

- 抽取式受限；生成式灵活。

## 六、常见误区

- 整文档入窗口——超长溢出。

## 七、与开源书对应

- llm-course: https://github.com/mlabonne/llm-course
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 长文档问答如何分块检索？

## 九、演进

抽取式 → 生成式 → 多模态 DocQA。

## 十、小结

DocQA，让文档「能被问」。
