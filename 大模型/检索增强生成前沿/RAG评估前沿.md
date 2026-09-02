# RAG 评估前沿

> 见「RAG深入/RAG评估」与「模型评测指标深入」。

## 一、背景与挑战

RAG 质量受检索与生成双重影响，需分环节评估。

## 二、核心原理

拆成**检索指标**（命中率/MRR/NDCG）与**生成指标**（忠实度/答案相关/上下文利用），用 LLM 裁判或框架（RAGAS）自动打分。

## 三、代码实现

```python
from ragas import evaluate
res = evaluate(dataset, metrics=[faithfulness, context_precision])
```

## 四、关键要点

- 检索与生成指标解耦定位瓶颈。
- 忠实度最关键（防编造）。

## 五、与其他对比

- 纯生成评测只看答案；RAG 评测需看上下文链路。

## 六、常见误区

- 只测最终答案——难定位是检索差还是生成差。

## 七、与开源书对应

- RAGAS: https://github.com/explodinggradients/ragas
- llm-universe: https://github.com/datawhalechina/llm-universe

## 八、面试题

- RAG 评测为何要区分检索与生成指标？

## 九、演进

人工 → 规则 → RAGAS 自动 → 在线评估。

## 十、小结

分环节评估是 RAG 持续优化的前提。
