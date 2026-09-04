# 多模态 RAG 流水线

> 对应 run-llama/llama_index 多模态检索与 huggingface/transformers 多模态生成。

## 一、背景与挑战
多模态知识分散在文本、图像、表格中，单一检索器无法统一。需要把多模态检索结果组织成可供多模态 LLM 消费的统一上下文。

## 二、核心原理
流水线：多模态查询 → 路由到文本/图像/表格检索器 → 各自召回并统一为「带类型的内容块」→ 可选重排 → 拼入多模态 LLM 提示（文本+图像输入）生成答案。

## 三、形式化与数学基础
设多检索器集合 $R=\{R_t,R_i,R_{tab}\}$，融合得分：
$s(c) = \sum_{m} \alpha_m \cdot s_m(q, c),\quad \sum_m \alpha_m=1$
最终上下文 $C^* = \text{top}_k(\{c\})$ 以多模态形式送入生成器。

## 四、代码实现
```python
def mm_rag(q, retrievers, llm, k=4):
    cands = []
    for name, r in retrievers.items():
        cands += r.search(q, k)
    ranked = rerank_mm(q, cands, k)
    return llm.generate_mm(q, ranked)   # 接收图文混合上下文
```

## 五、与其他技术对比
相比文本 RAG，多模态 RAG 能利用视觉证据，答案更丰富；工程复杂度显著更高，需要统一的内容表示与多模态生成器。

## 六、常见误区
误区一：把图像直接转文字就够，丢失视觉细节。误区二：所有模态等权融合，应路由加权。

## 七、与开源书/权威来源对应
- run-llama/llama_index 提供多模态检索器与索引。
- huggingface/transformers 支持多模态生成模型。
- facebookresearch/faiss 承载向量检索。

## 八、面试题
1. 多模态上下文如何拼接给生成器？
2. 路由失败如何降级？
3. 如何重排异构候选？

## 九、演进与趋势
统一多模态索引（单一向量空间容纳文/图/表）减少路由，并与 Agentic 多模态检索结合自动决定查哪种模态。

## 十、小结
多模态 RAG 流水线把异构知识统一检索与生成，是走向通用知识助手的关键。
