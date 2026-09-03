# Cross-Encoder重排

> 对应 Nogueira & Cho, 2019；Sentence-Transformers reranker。

## 一、背景与挑战

bi-encoder 向量相似度无法建模 query-doc 细粒度交互，精度有限。

## 二、核心原理

Cross-encoder 把 [CLS] query [SEP] doc [SEP] 一同输入，输出相关性分数，捕捉深层交互但需逐对编码（慢）。

## 三、数学形式

分数 $s=C_\theta([q;d])\in\mathbb R$；训练用 pairwise/pointwise 损失（如 BCE）。

## 四、代码实现

```python
scores = ce.predict([(q,d) for d in docs])   # 逐对编码
```

## 五、与其他对比

- 精度高但 O(n) 编码（n 候选），仅适合小候选集。
- 与 向量检索算法深入（bi-encoder）互补。

## 六、常见误区

- 对全库跑 cross-encoder 不可行（慢）；必须先用召回缩候选。
- 忽视输入长度截断致长 doc 信息丢。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- cross-encoder 为何准但慢？答：query-doc 联合深层交互建模，但需逐对编码无共享。

## 九、演进

单塔 → 多阶段蒸馏（用 cross-encoder 蒸馏 bi-encoder）。

## 十、小结

cross-encoder 以联合编码换精度，是大候选精排首选。
