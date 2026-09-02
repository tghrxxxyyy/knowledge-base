# RAG 总体架构

> 对应 datawhalechina/llm-universe（动手学大模型应用开发）与 mlabonne/llm-course「RAG」。RAG = 检索 + 生成，用外部知识补足模型参数知识的时效性与专业性。

## 一、核心概念

RAG(Retrieval-Augmented Generation) 在生成前先从知识库检索相关片段，拼入上下文，让模型基于「检索证据」作答，缓解幻觉、支持私有/实时知识。

标准离线-在线两阶段：

```
离线：文档 → 切片 → 嵌入 → 存入向量库
在线：查询 → 嵌入 → 检索 Top-k → 拼上下文 → LLM 生成
```

## 二、为什么需要 RAG

| 痛点 | RAG 解法 |
|------|----------|
| 知识过时 | 检索最新文档 |
| 领域私有 | 检索企业内资料 |
| 幻觉 | 引用可溯源片段 |
| 长尾知识 | 检索补足 |

## 三、关键要点

- RAG 质量 = 检索质量 × 生成质量，检索是瓶颈。
- 切分粒度、嵌入模型、检索策略共同决定效果。

## 四、常见误区

- 把 RAG 当「万能药」，忽视检索召回率。
- 上下文塞太多无关片段反而稀释注意力。

## 五、与开源书的对应

- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe （在线文档：https://datawhalechina.github.io/llm-universe/）
- llm-course「RAG」：https://github.com/mlabonne/llm-course#llm-engineer

## 七、面试题

- RAG 相比直接微调模型，在知识更新上有何优势？
- RAG 效果差，应先调检索还是先调生成？
