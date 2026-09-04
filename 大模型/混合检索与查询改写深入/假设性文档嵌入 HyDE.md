# 假设性文档嵌入 HyDE

> 对应 Lewis et al. 2020《RAG》检索思路与 run-llama/llama_index 的 HyDE 实现。

## 一、背景与挑战
用户短查询与长文档在向量空间分布错位，直接编码查询检索效果有限。HyDE 让 LLM 先生成一个「假设答案」，用其向量去检索真实文档。

## 二、核心原理
LLM 针对查询生成一段可能回答（无需事实正确），将该假设文档编码为向量，在文档库中近邻检索。假设答案的向量更接近真实文档分布，从而提升召回。

## 三、形式化与数学基础
设查询 q，生成假设文档 $\tilde{d} = \text{LLM}(q)$，检索：
$\text{top}_k = \arg\max_{d} \, E_d(d)^\top E_{\tilde{d}}(\tilde{d})$
关键假设：语义方向上 $E_{\tilde{d}}(\tilde{d}) \approx E_d(d^+)$，尽管 $\tilde{d}$ 事实可能错误。

## 四、代码实现
```python
def hyde_retrieve(llm, enc, index, q, k=5):
    hypo = llm.complete(f"写一个可能回答该问题的段落：{q}")
    vec = enc.encode_text(hypo)
    return index.search(vec, k)
```

## 五、与其他技术对比
相比原查询直接检索，HyDE 缓解查询-文档错位；相比查询改写，它生成的是「文档式」而非「问句式」表示。缺点依赖 LLM 生成质量，且增加延迟。

## 六、常见误区
误区一：以为 HyDE 的假设答案要事实正确，其实只需语义对齐。误区二：在长文档库上不验证就直接用，可能引入偏向。

## 七、与开源书/权威来源对应
- Lewis et al. 2020 检索增强框架。
- run-llama/llama_index 提供 HyDE 检索器封装。
- huggingface/transformers 用于编码。

## 八、面试题
1. HyDE 为何能用「虚构」答案提升检索？
2. HyDE 与稠密检索的训练目标是否冲突？
3. 哪些场景 HyDE 会失效？

## 九、演进与趋势
结合改写与 HyDE 形成多假设表示，并用重排过滤 HyDE 引入的噪声。

## 十、小结
HyDE 用生成弥合查询与文档的分布鸿沟，是优雅的零样本检索增强技巧。
