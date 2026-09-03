# DSI 与文档标识符

> 对应 Tay et al., *Differentiable Search Index (DSI)*, 2022。

## 一、背景与挑战

如何让模型用单一表示指向文档；标识符设计决定可学习与泛化。

## 二、核心原理

DSI 用原子 ID（每文档唯一整数）或结构化 ID（按层级/聚类），训练模型把 query 映射到文档 ID 序列；结构化 ID 助泛化。

## 三、数学形式

文档 $d$ 对应标识 $y_d=(y_1..y_m)$；损失 $\mathcal L=-\sum_t\log p(y_t|q,y_{<t})$。

## 四、代码实现

```python
id_seq = model(q)              # e.g. [12, 7, 3]
doc = doc_store[decode(id_seq)]
```

## 五、与其他对比

- 与 生成式检索总览 共享；与 嵌入模型训练深入（表示学习）对照。
- 与 多向量检索深入（外部索引）相反范式。

## 六、常见误区

- 原子 ID 无序致难泛化；宜结构化/语义 ID。
- ID 冲突（不同文档同码）致错召。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 为何用结构化 ID？答：层级/语义 ID 带聚类信息，助模型泛化到相似文档。

## 九、演进

原子 ID → 结构化 ID → 语义 ID。

## 十、小结

DSI 以可学习文档标识实现参数内检索，标识设计是核心。
