# 函数调用与API集成

> 对应 Gorilla（Patil et al., 2023）；ToolLLM 大规模 API。

## 一、背景与挑战

真实 API 海量且随版本变化；模型需准确匹配并生成合规参数。

## 二、核心原理

Gorilla 用检索增强从 API 库取文档注入上下文，再生成调用；训练用指令+API 配对数据对齐。

## 三、数学形式

检索 $\text{API}^*=\arg\max \text{sim}(q,\text{corpus}_{API})$；生成受其约束降低幻觉。

## 四、代码实现

```python
api_doc = retriever.search(user_q, top_k=1)
call = llm(prompt_with(api_doc, user_q))
```

## 五、与其他对比

- 与 检索重排序（召回 API）互补。
- 与 长上下文（放文档）权衡。

## 六、常见误区

- 直接记 API 名致版本漂移（应检索）。
- 忽视鉴权/副作用（写操作风险）。

## 七、与开源书对应

- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe
- dair-ai/Prompt-Engineering-Guide：https://github.com/dair-ai/Prompt-Engineering-Guide

## 八、面试题

- Gorilla 为何检索 API？答：API 海量且易变，检索注入最新文档避免幻觉与版本错。

## 九、演进

固定函数→检索增强调用→自我纠错调用。

## 十、小结

API 集成靠检索+约束生成，版本鲁棒与安全是重点。
