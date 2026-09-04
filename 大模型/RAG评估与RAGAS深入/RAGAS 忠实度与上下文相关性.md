# RAGAS 忠实度与上下文相关性

> 对应 Es et al. 2023《RAGAS》与 Zheng et al. 2023《LLM-as-a-judge》。

## 一、背景与挑战
忠实度衡量答案是否仅由检索上下文支撑（防幻觉），上下文相关性衡量检索内容是否真正针对问题。二者是 RAG 质量的第一道防线。

## 二、核心原理
忠实度：把答案拆为若干陈述，逐一判断能否被上下文蕴含，蕴含比例即分数。上下文相关性：由 LLM 判断检索段落中与问题相关的句子占比，过滤无关句后算分。

## 三、形式化与数学基础
忠实度：
$F = \frac{|\{c \in \text{claims}(a) \mid \text{ctx} \models c\}|}{|\text{claims}(a)|}$
上下文相关性：
$\text{CR} = \frac{|\text{sent}(ctx) \text{ relevant to } q|}{|\text{sent}(ctx)|}$
其中 $\models$ 表示上下文蕴含。

## 四、代码实现
```python
def faithfulness(llm, ctx, answer):
    claims = llm.decompose(answer)           # 拆分为陈述
    sup = [llm.entail(ctx, c) for c in claims]
    return sum(sup) / len(claims)
```

## 五、与其他技术对比
相比答案相关性，忠实度更关注「有据」而非「切题」；二者互补。仅靠上下文相关性无法发现生成偏离检索的幻觉。

## 六、常见误区
误区一：上下文相关性高则答案一定忠实，实则生成可能仍编造。误区二：陈述拆分过细导致分数虚低。

## 七、与开源书/权威来源对应
- Es et al. 2023 定义忠实度与上下文相关性计算。
- Zheng et al. 2023 提供 LLM 评判范式。
- run-llama/llama_index 提供评测工具。

## 八、面试题
1. 忠实度与事实正确性的区别？
2. 上下文相关性为何要按句子而非整段算？
3. 如何降低评判 LLM 的方差？

## 九、演进与趋势
用自然语言推断（NLI）小模型替代 LLM 做蕴含判断以降本；并把忠实度与生成过程对齐（如约束解码）。

## 十、小结
忠实度与上下文相关性是检测幻觉与噪声检索的核心窗口。
