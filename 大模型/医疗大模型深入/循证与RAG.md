# 循证与 RAG

> 对应 Lewis et al. 2020「Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (RAG)」、LlamaIndex / LangChain 文档与「医疗大模型深入/医疗应用概况」。

## 一、背景与挑战

医学结论必须基于最新指南与文献，而 LLM 的参数记忆会过时、且可能产生幻觉。在快速演进的医学领域，依赖「记忆式回答」风险极高：模型可能给出与现行指南冲突的用药建议。循证（evidence-based）RAG 通过实时检索权威知识库，并将回答锚定到具体证据与证据等级，成为医疗 LLM 的安全绳。

## 二、核心原理

循证 RAG 在标准 RAG 基础上增加两层约束：（1）数据源权威性筛选——仅纳入指南、综述、教科书、注册试验等可信来源，并按证据等级（如循证医学的 Level 1 随机对照 → Level 5 专家意见）标注；（2）强制引用——回答中每个论断须回链到检索片段，并标注其证据等级。检索阶段可用向量库（FAISS/Chroma）做语义召回，再用重排（rerank）提升精度，最后由 LLM 综合并生成带引用的答案。

## 三、形式化与数学基础

检索器从知识库 $\mathcal{K}$ 召回 top-$k$ 片段：$E = \text{TopK}_{e\in\mathcal{K}} \, \text{sim}(q, e)$，相似度常用内积 $\text{sim}(q,e)=q^\top e$。生成分布条件于检索证据：

$$
p_\theta(y \mid q) = \prod_{t} p_\theta(y_t \mid y_{<t}, q, E)
$$

证据等级加权可体现在重排得分： $\text{score}(e) = \lambda\, \text{sim}(q,e) + (1-\lambda)\, \text{level}(e)$，其中 $\text{level}(e)\in[0,1]$ 越高代表证据越强。最终答案效用随证据对齐度提升。

## 四、代码实现

```python
from llama_index.core import VectorStoreIndex, Settings

def evidence_rag(question: str, index: VectorStoreIndex):
    # 检索并携带证据等级
    retriever = index.as_retriever(similarity_top_k=5)
    nodes = retriever.retrieve(question)
    ctx = "\n".join(
        f"[证据等级{ n.metadata.get('level') }]\n{ n.get_content() }" for n in nodes
    )
    prompt = f"基于以下证据作答，并标注引用来源：\n{ctx}\n问题：{question}"
    answer = Settings.llm.complete(prompt)
    return str(answer)

ans = evidence_rag("ACEI 用于妊娠期高血压是否安全？", guideline_index)
```

## 五、与其他技术对比

| 方式 | 时效性 | 可溯源 | 可靠性 |
|------|--------|--------|--------|
| 记忆式回答 | 差（易过时） | 无 | 低 |
| 普通 RAG | 中 | 中 | 中 |
| 循证分级 RAG | 好 | 强 | 高 |

## 六、常见误区

- 误区一：检索到即正确。检索片段可能过时或低质量，须看证据等级。
- 误区二：引用越多越好。须区分证据强弱，低等级证据不应支撑关键结论。
- 误区三：RAG 消除一切幻觉。检索噪声与错误拼接仍可致错。
- 误区四：一次建库永久有效。指南更新须定期重建索引。

## 七、与开源书·权威来源对应

- Lewis et al. 2020「RAG」：https://arxiv.org/abs/2005.11401
- LlamaIndex 文档：https://docs.llamaindex.ai/
- LangChain 文档：https://python.langchain.com/
- llm-universe（Datawhale）：https://github.com/datawhalechina/llm-universe
- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- 医疗 RAG 为何强调证据等级？如何在检索/重排中体现？
- 循证 RAG 相比普通 RAG 增加了哪些约束？
- 检索到的低质量证据可能带来什么危害？如何过滤？
- 为什么 RAG 不能完全消除医疗幻觉？

## 九、演进与趋势

从「记忆式」到「文献 RAG」，再到「循证分级 + 多模态证据（影像/病理）+ Agent 主动查证」。趋势是自动证据等级标注、引用可追溯的可验证生成，以及与临床决策系统深度集成。

工程关键点：知识库须权威准入加版本管理，指南更新即重建索引，避免引用已废止建议；检索与生成解耦，便于单独优化召回（向量 + BM25 + 重排）；引用须可点击溯源到原文片段供医师核验，而非泛引参考文献。应设置证据不足即拒答策略：top-k 均无强证据时明确告知不确定而非强行生成；低等级证据显式降级，不支撑关键临床结论；评测同时看答案准确率与引用忠实度。

- 版本管理：指南更新即重建检索索引。
- 可点击溯源：引用直链到原文片段。
- 证据不足拒答：不强行生成无据内容。
- 等级降级：低等级证据不支撑关键结论。
- 忠实度评测：同时看答案与引用一致性。

## 十、小结

循证 RAG 是医疗 LLM 的安全绳：通过权威数据源、证据等级标注与强制引用，将回答锚定到可溯源证据，显著降低幻觉与过时风险。须配套证据质量过滤与索引定期更新。
