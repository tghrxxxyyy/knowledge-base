# ALiBi与RoPE的混合

> 对应 bigscience/bloom 后续讨论；microsoft/tutel。

## 一、背景与挑战
ALiBi 外推好但表达力弱，RoPE 表达力强但需缩放。混合能否兼得？

## 二、核心原理
方案1：RoPE 为主，ALiBi 作为辅助偏置。方案2：分层使用，部分头 RoPE 部分头 ALiBi。方案3：训练时用 ALiBi，推理时用 RoPE 缩放。

## 三、形式化与数学基础
$ \text{score}_{ij} = q_i^\top R_\theta(m) k_j - \alpha \cdot m |i-j| $，$\alpha$ 为混合系数。$\alpha$ 越大越接近 ALiBi，越小越接近纯 RoPE。

## 四、代码实现
```python
# 混合
Q = apply_rope(Q, cos, sin)
K = apply_rope(K, cos, sin)
score = (Q @ K.transpose(-1,-2)) - alpha * slopes[:,None,None] * dist[None,:,:]
```

## 五、与其他技术对比
- vs 单独 ALiBi：混合后表达力提升。
- vs 单独 RoPE：混合后外推更好。

## 六、常见误区
- $\alpha$ 调参成本高，需多轮实验。
- 同时学习 RoPE 与 ALiBi 可能相互干扰。

## 七、与开源书/权威来源对应
- bigscience/bloom 配置。
- jquesnelle/transformer-internals 笔记。

## 八、面试题
- 混合方案有理论保证吗？答：暂无严格理论，依赖实验。

## 九、演进与趋势
纯 ALiBi → 纯 RoPE → 混合 → 动态混合（按层）。

## 十、小结
混合方案是工程实践中的折中，理论支持仍在探索。
