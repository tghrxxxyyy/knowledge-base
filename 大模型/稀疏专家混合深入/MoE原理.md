# MoE 原理

> 对应 llm-course 与 Shazeer et al., *Sparsely-Gated MoE*, 2017；综述见 Fedus et al., 2022。

## 一、背景与挑战

模型要更大但推理成本受控，MoE 用稀疏激活解耦参数量与计算量。

## 二、核心原理

每层含多个前馈专家，门控网络按 token 选 top-k 专家，仅激活少数，参数量大但单 token 计算小。

## 三、数学形式

```
y = Σ_{i in topk(g(x))} g_i(x) · E_i(x)
```

## 四、代码实现

```python
weights, idx = gate(x).topk(k=2)
y = sum(w * expert[i](x) for w,i in zip(weights, idx))
```

## 五、关键要点

- 参数量↑、单步算力≈不变。
- 负载均衡是关键。

## 六、与其他对比

- 稠密模型全激活；MoE 稀疏激活。

## 七、常见误区

- MoE 推理更便宜——显存占用更大。

## 八、与开源书对应

- llm-course: https://github.com/mlabonne/llm-course
- Fedus et al., *Switch Transformers*, 2022.

## 九、面试题

- MoE 为何能扩参不增算力？

## 十、演进

稠密 → 硬路由 → 软门控稀疏。

## 十一、小结

MoE 是「大模型低成本」主流路径。
