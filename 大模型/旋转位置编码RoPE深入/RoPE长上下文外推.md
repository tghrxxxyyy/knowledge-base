# RoPE长上下文外推

> 对应 bloc97/ntk-aware scaled rope; emozilla/YaRN; Peng et al., 2023 *YaRN*。

## 一、背景与挑战
RoPE 在训练上下文长度内表现好，超出后性能急剧下降。原因是高频维度（短尺度位置）周期短，长位置无法被正确表示。

## 二、核心原理
两条主要思路：(1) 位置插值（Position Interpolation, PI）：把位置 $m$ 缩放为 $m/s$（$s = L_\text{target}/L_\text{train}$），等价于在所有维度拉伸周期。(2) NTK-aware 缩放：仅缩放低频维度的基 $\theta_i$，保持高频不变。

## 三、形式化与数学基础
PI：$m \to m/s$。NTK：$\theta_i \to \theta_i \cdot s^{2i/(d-2)}$，高频 $i$ 接近 0 时不变，低频 $i$ 接近 $d/2$ 时 $\theta$ 缩小 $s$ 倍，等价于拉长周期。

## 四、代码实现
```python
# NTK-aware RoPE
base = 10000 * (s ** (d/(d-2)))
inv_freq = 1.0 / (base ** (torch.arange(0,d,2)/d))
# YaRN 还对部分维度加 ramp 缩放
```

## 五、与其他技术对比
- vs PI：NTK 保留高频，长程与短程兼顾。
- vs ALiBi：RoPE 缩放更灵活，ALiBi 无需缩放但精度受限。

## 六、常见误区
- 直接把 $\theta$ 全部乘 $s$ 而非 $s^{2i/d}$，破坏多尺度。
- 缩放后未做少量微调，模型精度下降。

## 七、与开源书/权威来源对应
- huggingface/transformers `LlamaDynamicNTKScalingRotaryEmbedding`。
- jquesnelle/transformer-internals YaRN 笔记。
- ofwfanfan/cosFormer 论文中的 RoPE 分析。

## 八、面试题
- NTK-aware 与 PI 区别？答：NTK 保持高频不变，仅缩放低频；PI 等比缩放所有频率。

## 九、演进与趋势
RoPE → PI → NTK-aware → YaRN（结合长度缩放与注意力温度）。

## 十、小结
RoPE 长上下文外推通过位置插值或基频率缩放实现，是开源 LLM 扩窗口的标准做法。
