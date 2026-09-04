# 多查询检索 Multi-Query

> 对应 dair-ai/Prompt-Engineering-Guide 与 Wei et al. 2022《chain-of-thought》及 run-llama/llama_index。

## 一、背景与挑战
单条查询视角有限，可能遗漏某方面证据。Multi-Query 让 LLM 从不同角度生成多个查询变体，分别检索后合并，扩大覆盖。

## 二、核心原理
LLM 将原查询扩展为 n 个语义不同但意图一致的子查询，对各子查询独立检索，再用 RRF 或去重合并结果。它相当于在查询侧做集成。

## 三、形式化与数学基础
设变体集合 $Q'=\{q_1,\dots,q_n\}$，合并得分：
$S(d) = \sum_{q_i \in Q'} \text{sim}(E_q(q_i), E_d(d))$
或用 RRF 对各自排名融合，抑制单一视角偏差。

## 四、代码实现
```python
def multi_query(llm, enc, index, q, n=4, k=5):
    variants = llm.generate_variants(q, n)     # 生成 n 个改写
    hits = set()
    for v in variants:
        hits.update(index.search(enc.encode_text(v), k))
    return hits
```

## 五、与其他技术对比
相比单查询，覆盖更广；相比 HyDE，它保留多角度问法而非单文档假设；代价是 n 倍检索与一次 LLM 调用。

## 六、常见误区
误区一：变体越多越好，过多变体引入无关方向并增延迟。误区二：变体间高度重复，未真正多角度。

## 七、与开源书/权威来源对应
- dair-ai/Prompt-Engineering-Guide 总结多视角提示。
- Wei et al. 2022 的 CoT 体现多角度推理价值。
- run-llama/llama_index 提供 MultiQueryRetriever。

## 八、面试题
1. Multi-Query 与混合检索的融合层次差异？
2. 如何衡量变体的多样性？
3. 何时 Multi-Query 收益递减？

## 九、演进与趋势
变体生成与路由结合：先判断查询类型再决定生成几个变体，并用重排去冗余。

## 十、小结
Multi-Query 以查询侧集成的低成本方式提升召回覆盖，是改写技术的自然延伸。
