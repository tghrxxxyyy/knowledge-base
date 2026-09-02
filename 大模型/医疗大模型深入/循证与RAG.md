# 循证与 RAG

> 见「RAG深入/总体架构」与「医疗大模型深入/医疗应用概况」。

## 一、背景与挑战

医疗结论必须基于最新指南与文献，不能凭记忆。

## 二、核心原理

用权威指南/文献库做 RAG，强制引用出处，结合证据等级给出建议，降低幻觉。

## 三、关键要点

- 数据源权威性优先。
- 须标注证据等级。

## 四、代码实现

```python
ans = med_rag(q, guidelines_idx, cite=True, level=True)
```

## 五、与其他对比

- 记忆式回答不可靠；循证 RAG 可溯源。

## 六、常见误区

- 检索到即正确——需证据等级判断。

## 七、与开源书对应

- llm-universe: https://github.com/datawhalechina/llm-universe
- llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- 医疗 RAG 为何强调证据等级？

## 九、演进

记忆 → 文献 RAG → 循证分级。

## 十、小结

循证是医疗 LLM 的安全绳。
