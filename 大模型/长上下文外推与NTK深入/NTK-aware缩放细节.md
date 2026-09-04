# NTK-aware缩放细节

> 对应 bloc97/ntk-aware scaled rope 博客与 Reddit 讨论。

## 一、背景与挑战
PI 缩放所有频率，高频（短尺度位置）也被压缩，损失短程精度。NTK-aware 仅缩放低频，保留高频。

## 二、核心原理
原始 NTK：$\text{base} = 10000 \cdot s^{d/(d-2)}$。这样高频维度（$i$ 接近 0）的 $\theta$ 变化小，低频（$i$ 接近 $d/2$）变化大。

## 三、形式化与数学基础
设 $\theta_i = 10000^{-2i/d}$，新 $\theta_i' = (\text{base})^{-2i/d}$。当 $i$ 接近 0，$\theta_i' \approx \theta_i$；当 $i$ 接近 $d/2$，$\theta_i' \approx \theta_i / s$。周期从 $2\pi/\theta_i$ 拉到 $2\pi/\theta_i \cdot s$。

## 四、代码实现
```python
def ntk_inv_freq(dim, s, base=10000):
    new_base = base * (s ** (dim / (dim - 2)))
    return 1.0 / (new_base ** (torch.arange(0, dim, 2).float() / dim))
```

## 五、与其他技术对比
- vs PI：NTK 保留高频，PI 全部缩放。
- vs Dynamic NTK：Dynamic NTK 在推理时按序列长度动态调整 base。

## 六、常见误区
- $d$ 较小时（< 64）NTK 缩放效果有限。
- 实现时忘记 $\text{inv\_freq}$ 缓存策略。

## 七、与开源书/权威来源对应
- huggingface/transformers `LlamaDynamicNTKScalingRotaryEmbedding`。
- bloc97 博客。

## 八、面试题
- NTK 为何不缩高频？答：高频对应短尺度位置，模型已在训练中学好。

## 九、演进与趋势
NTK → Dynamic NTK → YaRN（结合温度）。

## 十、小结
NTK-aware 是 RoPE 长上下文外推的主流方案，平衡高低频。
