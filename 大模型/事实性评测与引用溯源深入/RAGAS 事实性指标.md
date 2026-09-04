# RAGAS 事实性指标

> 对应 Es 2023 RAGAS 与 Lewis 2020 RAG。

## 一、背景与挑战
RAG 系统需无人工即可评估答案基于上下文的程度。

## 二、核心原理
RAGAS 用忠实度（faithfulness）与上下文利用率等指标，由 LLM 抽取断言并比对上下文。

## 三、形式化与数学基础
忠实度：
$ F = \frac{|\text{claims supported by context}|}{|\text{all claims}|} $

## 四、代码实现
```python
def faithfulness(claims, ctx_supported):
    return len(ctx_supported) / max(1, len(claims))
```

## 五、与其他技术对比
比人工标注便宜且可批量，但依赖评判模型质量。

## 六、常见误区
上下文包含答案即判忠实，忽视推理跳跃；未区分检索与生成错误。

## 七、与开源书/权威来源对应
Es 2023 提出 RAGAS 参考-free 评测框架；Lewis 2020 定义 RAG。

## 八、面试题
faithfulness 与 answer correctness 有何区别？

## 九、演进与趋势
引入答案相关性与检索召回联合评分。

## 十、小结
RAGAS 把 RAG 评测标准化、自动化。
