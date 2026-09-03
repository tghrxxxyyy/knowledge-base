# MaxSim 算子详解

> 对应 Khattab & Zaharia, 2020（ColBERT 的 MaxSim 核心是迟交互）。

## 一、背景与挑战

如何聚合 query 与文档 token 向量为单分数，且保留最佳词对齐。

## 二、核心原理

对每 query token 取其与所有文档 token 的最大内积（最匹配项），累加得最终分；Max 实现软对齐，容忍词序差异。

## 三、数学形式

$\text{MaxSim}(q_i, D)=\max_{j} q_i^\top d_j$；$S(Q,D)=\sum_{i=1}^{|Q|}\text{MaxSim}(q_i, D)$。

## 四、代码实现

```python
def maxsim(q_tok, d_toks):
    return (q_tok @ d_toks.T).max(dim=-1).values.sum()
```

## 五、与其他对比

- 与 双塔 单内积对比：MaxSim 多对多软对齐。
- 与 多向量检索深入（同公式）共享。

## 六、常见误区

- 未做查询端 token 裁剪，停用词加噪声。
- 维度未归一致分数尺度不稳。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- MaxSim 为何用 max 而非 mean？答：取每 query token 最匹配的文档 token，实现词级软对齐。

## 九、演进

单向量内积 → 逐 token max → 加权/可解释 max。

## 十、小结

MaxSim 是迟交互的打分核心，以软对齐兼顾词级匹配与可索引。
