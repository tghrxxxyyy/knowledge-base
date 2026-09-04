# RAG 评估体系概览

> 对应 Es et al. 2023《RAGAS: Automated Evaluation of Retrieval Augmented Generation》与 run-llama/llama_index。

## 一、背景与挑战
RAG 系统由检索与生成两阶段组成，传统文本生成指标（BLEU/ROUGE）无法反映「检索是否相关、生成是否有据」。需要专门针对 RAG 的无参考评估框架。

## 二、核心原理
RAG 评估拆解为多个维度：上下文相关性（检索质量）、忠实度（生成是否被检索内容支持）、答案相关性（是否回应问题）。RAGAS 用 LLM 或自然语言推断模型自动打分，免人工标注。

## 三、形式化与数学基础
整体质量可视为各维度加权：
$\text{Quality} = w_1 \cdot \text{Faith} + w_2 \cdot \text{CR} + w_3 \cdot \text{AR}$
其中 Faith 为忠实度、CR 为上下文相关性、AR 为答案相关性，权重随业务调整。

## 四、代码实现
```python
def rag_eval(ragas, q, ctx, answer):
    return {
        "faithfulness": ragas.faithfulness(q, ctx, answer),
        "context_rel": ragas.context_relevancy(q, ctx),
        "answer_rel": ragas.answer_relevancy(q, answer),
    }
```

## 五、与其他技术对比
相比传统指标，RAGAS 维度更贴合 RAG 失败模式；相比纯人工评测，可大规模自动化。缺点是依赖评判 LLM 本身可能有偏差。

## 六、常见误区
误区一：只看答案相关性忽略忠实度，可能鼓励编造。误区二：用单一指标代表整体，掩盖维度间冲突。

## 七、与开源书/权威来源对应
- Es et al. 2023 提出 RAGAS 指标与无参考方法。
- run-llama/llama_index 集成评测回调。
- Zheng et al. 2023 的 LLM-as-judge 是评判基础。

## 八、面试题
1. 为何 RAG 评估不能只用语义相似度？
2. RAGAS 三个核心维度分别度量什么？
3. 无参考评估的局限？

## 九、演进与趋势
评估从离线指标走向在线 A/B 与用户信号，并把评判 LLM 替换为更稳的细粒度 critic；出现过程级评估（检索每步质量）。

## 十、小结
建立分维度、自动化的 RAG 评估体系是持续优化的前提。
