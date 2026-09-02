# 多模态 RAG

> 见「多模态深入」与「RAG深入/向量数据库」。

## 一、背景与挑战

知识不只文本，还有图/表/视频。多模态 RAG 需跨模态检索与生成。

## 二、核心原理

用多模态编码器（CLIP）把图文映射到统一空间，检索相关图文块，连同问题送多模态 LLM。

## 三、代码实现

```python
vec = clip.encode_image_text(doc)
hits = vector_db.search(clip.encode_text(q))
```

## 四、关键要点

- 文档解析（OCR/版式）是前置难点。
- 图表问答需结构化抽取。

## 五、与其他对比

- 文本 RAG 成熟；多模态 RAG 受解析质量制约。

## 六、常见误区

- 直接丢图进向量库——需先解析与切片。

## 七、与开源书对应

- llm-universe 多模态: https://github.com/datawhalechina/llm-universe
- ColPali: https://github.com/illuin-tech/colpali

## 八、面试题

- 多模态 RAG 的文档解析难点？

## 九、演进

文本块 → 图文联合表征 → 页面级检索(ColPali)。

## 十、小结

多模态 RAG 把检索扩展到「看懂图」。
