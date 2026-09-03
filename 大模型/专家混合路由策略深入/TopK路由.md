# TopK路由策略

> 对应 Shazeer 2017 的 Top-k 稀疏门控；后续 Switch Transformers（Fedus et al., 2021）用 Top-1。

## 一、背景与挑战

需决定每个 token 送哪些专家；路由质量直接决定专家专业化与负载均衡。

## 二、核心原理

路由网络输出 $E$ 个分数，取最大 k 个（常 k=1 或 2），softmax 归一后加权；k=1 最省算力、k=2 更稳。

## 三、数学形式

$g_e=\frac{e^{r_e}}{\sum_{j\in\text{TopK}}e^{r_j}}$，仅对选中专家归一，未选专家权重为 0。

## 四、代码实现

```python
r = router(x)
topv, topi = r.topk(2)
g = F.softmax(topv, dim=-1)
y = sum(g[i] * experts[topi[i]](x) for i in range(2))
```

## 五、与其他对比

- Top-1（Switch）算力最低但易不均；Top-2 质量更稳、略增计算。
- 与 专家混合路由策略深入 的负载均衡目标协同。

## 六、常见误区

- 用 Top-k 但未在选中集内重归一，门权重尺度错。
- k 过大退化为近稠密，失 MoE 优势。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- Top-1 与 Top-2 取舍？答：Top-1 最省但易不均，Top-2 略增计算换稳定性与质量。

## 九、演进

Top-k 多专家 → Switch Top-1 → 加辅助损失稳路由。

## 十、小结

TopK 路由是 MoE 的分配核心，k 与归一方式决定效率与质量平衡。
