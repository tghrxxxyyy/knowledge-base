# 重排与RAG质量关系

> 对应 RAG 质量链路；RAG深入 / 检索增强生成前沿 衔接。

## 一、背景与挑战

召回的噪声 doc 进上下文会误导生成；重排直接决定进 LLM 的上下文质量。

## 二、核心原理

重排把最相关 top-k 送入生成，减少噪声/冗余，提升 faithfulness 与准确率。

## 三、数学形式

生成质量 $Q \approx f(\text{topk}_{rerank}(D, q))$；重排误差直接传导至答案。

## 四、代码实现

```python
ctx = reranker(q, retrieve(q, 100), k=5)
answer = llm(q, ctx)
```

## 五、与其他对比

- 与 混合检索深入（召回质量）互补。
- 与 检索增强生成失效深入（若新增）衔接（失效模式）。

## 六、常见误区

- 重排后仍塞过多 doc 致上下文污染/超长。
- 重排与生成语言不一致（如跨语）。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 重排如何影响 RAG 答案？答：决定进上下文的 doc 质量，直接影响 faithful 与准确。

## 九、演进

无重排 → bi-encoder topk → cross-encoder → 上下文压缩。

## 十、小结

重排是 RAG 质量守门员，优劣直接体现在答案上。
