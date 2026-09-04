# 检索质量指标 Precision Recall NDCG

> 对应 Gao et al. 2021《lm-evaluation-harness》与 EleutherAI/lm-evaluation-harness 评测实践。

## 一、背景与挑战
检索是 RAG 上游，其质量需独立量化。Precision/Recall 衡量检准检全，NDCG 进一步考虑排名位置，是信息检索标准指标。

## 二、核心原理
Precision@k 看前 k 相关比例，Recall@k 看相关文档被召回比例，NDCG@k 对排位加权（相关项越靠前越高）。这些指标用于离线对比不同检索器/参数。

## 三、形式化与数学基础
$\text{Precision@k} = \frac{|R \cap H_k|}{k},\quad \text{Recall@k} = \frac{|R \cap H_k|}{|R|}$
$\text{NDCG@k} = \frac{1}{\text{IDCG}} \sum_{i=1}^{k} \frac{2^{rel_i}-1}{\log_2(i+1)}$
其中 R 为相关集合，$H_k$ 为前 k 结果，$rel_i$ 为相关等级。

## 四、代码实现
```python
def ndcg_at_k(rels, k):
    dcg = sum((2**r - 1)/log2(i+2) for i, r in enumerate(rels[:k]))
    idcg = sum((2**r - 1)/log2(i+2) for i, r in enumerate(sorted(rels, reverse=True)[:k]))
    return dcg / idcg if idcg else 0.0
```

## 五、与其他技术对比
相比 RAGAS 的生成端指标，这些是纯检索指标，更直接定位上游问题；但需 gold 标注，不适合完全无参考场景。

## 六、常见误区
误区一：只报 Recall 忽略排位，NDCG 更能反映用户体验。误区二：k 取值随意，应贴合实际展示数量。

## 七、与开源书/权威来源对应
- Gao et al. 2021 提出 lm-evaluation-harness 统一评测。
- EleutherAI/lm-evaluation-harness 提供检索/QA 指标实现。
- Lewis et al. 2020 检索增强依赖检索质量。

## 八、面试题
1. 为何 NDCG 比 Precision 更关注排位？
2. Recall@k 的分母是什么？
3. 检索指标与 RAGAS 如何配合使用？

## 九、演进与趋势
从静态标注走向在线点击/满意度信号反推指标，并与生成质量联合优化检索目标。

## 十、小结
经典检索指标是诊断 RAG 上游的利器，应与生成端指标联合报告。
