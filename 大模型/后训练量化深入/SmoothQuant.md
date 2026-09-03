# SmoothQuant 激活-权重量化

> 对应 Xiao et al., *SmoothQuant: Accurate and Efficient Post-Training Quantization for LLMs*, 2022。

## 一、背景与挑战

LLM 激活含极端 outlier（个别通道值极大），直接 INT8 激活误差巨大；权重分布较平。

## 二、核心原理

SmoothQuant 把激活的量化难度“平滑”到权重：对通道乘 $\frac{1}{\sqrt{s}}$ 到激活、乘 $\sqrt{s}$ 到权重，使两者都易量化，实现 W8A8。

## 三、数学形式

$Y=XW$，令 $X' = X \text{diag}(s)^{-1},\ W' = \text{diag}(s)W$，$s_j=\max(|X_j|)^\alpha / \max(|W_j|)^{1-\alpha}$。

## 四、代码实现

```python
# 用 smoothquant 平滑因子
s = (abs(X).amax(-1).pow(alpha) / abs(W).amax(0).pow(1-alpha)).clamp(min=1e-5)
Xq, Wq = quant(X/s), quant(W*s)
```

## 五、与其他对比

- 专注激活量化（W8A8），与 GPTQ/AWQ（权重量化）互补，可叠加。
- 与 LLM.int8() 异常值分离思路不同。

## 六、常见误区

- 误以为只量化权重即可服务；激活也占算力。
- $\alpha$ 选错致某一侧仍难量化。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 问：SmoothQuant 为何平滑？答：把激活 outlier 难度迁移到易量化的权重，使 W8A8 可行。

## 九、演进

FP16 → W8A8（难）→ SmoothQuant → W4A8 组合。

## 十、小结

SmoothQuant 解激活 outlier 难题，使 8bit 全量化服务成为现实。
