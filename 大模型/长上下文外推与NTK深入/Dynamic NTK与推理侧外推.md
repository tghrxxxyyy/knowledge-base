# Dynamic NTK与推理侧外推

> 对应 huggingface/transformers `LlamaDynamicNTKScalingRotaryEmbedding`。

## 一、背景与挑战
固定 NTK 缩放对所有序列用同一 $s$，但短序列不应被过度缩放。Dynamic NTK 按当前序列长度动态调整 $s$。

## 二、核心原理
$s_\text{eff} = \max(1, L / L_\text{train})$，仅当 $L > L_\text{train}$ 时启用缩放。短序列 $s=1$ 等价于无外推。

## 三、形式化与数学基础
Dynamic NTK 维护一个 inv_freq buffer，按当前 $L$ 重新计算：$\text{inv\_freq}_i = 1/(\text{base} \cdot s_\text{eff}^{d/(d-2)})^{2i/d}$。

## 四、代码实现
```python
class DynamicNTKRotaryEmbedding:
    def forward(self, x, L):
        if L > self.max_seq:
            s = L / self.max_seq
            self.inv_freq = compute_ntk_inv_freq(s)
        cos, sin = get_cos_sin(L, self.inv_freq)
        return apply_rope(x, cos, sin)
```

## 五、与其他技术对比
- vs 固定 NTK：Dynamic 在短序列上无副作用。
- vs 重新加载模型：Dynamic 推理侧切换，无需新模型。

## 六、常见误区
- 每次长度变化都重算 inv_freq 成本高。
- 缓存策略需谨慎。

## 七、与开源书/权威来源对应
- huggingface/transformers。
- meta-llama/llama 官方。

## 八、面试题
- Dynamic NTK 优势？答：短序列不被过度缩放。

## 九、演进与趋势
固定 → Dynamic → per-layer NTK。

## 十、小结
Dynamic NTK 是工程上更友好的方案，避免短序列精度损失。
