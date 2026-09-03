# ColBERT 原理

> 对应 Khattab & Zaharia, *ColBERT: Efficient and Effective Passage Search*, 2020。

## 一、背景与挑战

既要词级细粒度匹配又要离线可检索；ColBERT 在 BERT 上加分块与迟交互层。

## 二、核心原理

query/doc 各过 BERT 得 token 向量，经线性投影降维；检索时文档向量离线存，查询用 MaxSim 累积每 query token 与文档 token 最大相似度。

## 三、数学形式

$S(Q,D)=\sum_{i=1}^{|Q|}\max_{j=1}^{|D|} E_q(q_i)^\top E_d(d_j)$；仅用 [D] 与 [Q] 等特殊符外的 token。

## 四、代码实现

```python
def maxsim(Q, D):
    return sum((Q[i] @ D.T).max(dim=1).values.sum() for i in range(Q.shape[0]))
```

## 五、与其他对比

- 与 双塔模型深入（单向量）对比表达力。
- 与 迟交互深入（迟交互即 MaxSim）衔接。

## 六、常见误区

- 未过滤查询停用词 token 致噪声相似度。
- 维度/投影未调致召回不稳。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- ColBERT 为何离线可检索？答：文档 token 向量离线存索引，查询在线编码后用 MaxSim 匹配。

## 九、演进

BERT 单向量 → ColBERT → ColBERTv2/PLAID。

## 十、小结

ColBERT 以 token 向量+迟交互首次兼顾细粒度匹配与可检索性。
