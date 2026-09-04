# 重排序在 RAG 流水线中的位置

> 对应 run-llama/llama_index 检索编排与 Lewis et al. 2020《RAG》。

## 一、背景与挑战
RAG 质量受检索 Top-k 直接影响。直接取向量检索 Top-k 常含噪声，加入重排可显著提升喂给 LLM 的证据质量。

## 二、核心原理
典型流水线：查询 → 向量召回 Top-100 → 交叉编码器重排 → 取 Top-5 → 拼入提示。重排置于召回之后、生成之前，是精度瓶颈的守门员。

## 三、形式化与数学基础
设召回集合 $C_q=\text{top}_{100}(q)$，重排输出：
$R_q = \text{top}_k\left(\{ (d, s(q,d)) \mid d \in C_q \}\right)$
整体生成质量近似随 $R_q$ 相关性单调提升，故重排直接优化下游指标。

## 四、代码实现
```python
def rag_pipeline(q, vec_index, reranker, llm, k=5):
    cands = vec_index.search(q, 100)
    ranked = reranker.rank(q, cands, k)
    ctx = "\n".join(d.text for d in ranked)
    return llm.complete(f"{ctx}\n\n{q}")
```

## 五、与其他技术对比
不重排时 LLM 被噪声干扰；过重排（候选太多）增加延迟。经验上召回 100 + 重排 5~10 是常见折中。

## 六、常见误区
误区一：重排能修复召回完全缺失的证据，其实重排只在已有候选内择优。误区二：重排分数可直接跨查询比较，实则需归一化。

## 七、与开源书/权威来源对应
- run-llama/llama_index 提供 node-postprocessor 重排接口。
- Lewis et al. 2020 强调检索质量决定 RAG 上限。
- Devlin et al. 2018 交叉编码器基础。

## 八、面试题
1. 为什么重排通常放在召回之后而非之前？
2. 重排候选数 100 与 20 对最终质量影响如何？
3. 如何判断重排是否真正生效？

## 九、演进与趋势
重排从交叉编码器走向 LLM listwise 重排，并与查询改写、压缩组成自适应检索链。

## 十、小结
重排是 RAG 流水线中性价比极高的精度提升点，应作为默认组件。
