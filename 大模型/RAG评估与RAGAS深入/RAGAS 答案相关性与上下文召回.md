# RAGAS 答案相关性与上下文召回

> 对应 Es et al. 2023《RAGAS》与 run-llama/llama_index 评测。

## 一、背景与挑战
即使上下文相关、答案忠实，若答非所问仍失败（答案相关性）；若关键证据根本没被检索到，则上游已失败（上下文召回）。需补齐这两维。

## 二、核心原理
答案相关性：以问题生成若干参考答案变体，计算与真实答案的语义相似度均值。上下文召回：给定人工或 LLM 标注的「应检索事实」，计算被检索上下文覆盖的比例。

## 三、形式化与数学基础
答案相关性：
$\text{AR} = \frac{1}{m}\sum_{i=1}^{m} \text{sim}(a, \tilde{a}_i),\ \tilde{a}_i \sim P(\cdot\mid q)$
上下文召回：
$\text{CRec} = \frac{|\text{gold facts} \cap \text{extracted(ctx)}|}{|\text{gold facts}|}$
二者分别从生成与检索两端闭合评估环。

## 四、代码实现
```python
def answer_relevancy(llm, q, a):
    variants = [llm.complete(f"用不同方式回答：{q}") for _ in range(3)]
    return mean(cosine(embed(a), embed(v)) for v in variants)
```

## 五、与其他技术对比
相比忠实度关注「有据」，答案相关性关注「切题」；上下文召回关注「检全」，与上下文相关性（检准）互补，构成检索二维。

## 六、常见误区
误区一：把答案相关性当事实正确性，它只测切题。误区二：上下文召回需 gold 事实，纯无参考场景难获取。

## 七、与开源书/权威来源对应
- Es et al. 2023 给出答案相关性与上下文召回定义。
- run-llama/llama_index 提供相关评测钩子。
- Zheng et al. 2023 LLM-as-judge 支撑打分。

## 八、面试题
1. 答案相关性与忠实度能否相互替代？
2. 上下文召回为何常需 gold 标准？
3. 如何用召回与相关性权衡检索参数？

## 九、演进与趋势
引入检索过程奖励模型直接估计召回，减少 gold 依赖；并综合四维为单一可优化目标。

## 十、小结
答案相关性与上下文召回补全了 RAG 评估的生成端与检索端，使体系闭环。
