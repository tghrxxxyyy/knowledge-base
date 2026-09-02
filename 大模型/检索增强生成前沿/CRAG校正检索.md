# CRAG 校正检索

> 见「RAG深入/重排序ReRank」与「检索增强生成前沿/Self-RAG自适应检索」。

## 一、背景与挑战

检索质量不稳，错误文档会带偏生成。CRAG 给检索结果做「置信度校正」。

## 二、核心原理

评估检索文档相关性得分，低置信时触发网络检索补充或丢弃，再用知识精炼分割保留相关句。

## 三、关键要点

- 轻量校正器提升鲁棒。
- 可与 Self-RAG 互补。

## 四、代码实现

```python
score = confidence(retrieved)
if score < thr: docs = web_search(q)
```

## 五、与其他对比

- ReRank 只排序；CRAG 还判定并补偿。

## 六、常见误区

- 检索到了就可用——需相关性判定。

## 七、与开源书对应

- CRAG: https://github.com/Hanbin-Wang/CRAG
- Yan et al., 2024.

## 八、面试题

- CRAG 在检索失败时如何补偿？

## 九、演进

无校验 → 重排 → 校正+补充。

## 十、小结

CRAG 让 RAG 更抗脏检索。
