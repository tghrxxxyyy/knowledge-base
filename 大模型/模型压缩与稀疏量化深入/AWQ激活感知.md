# AWQ激活感知量化

> 对应 Lin et al., *AWQ: Activation-aware Weight Quantization*, 2023（NeurIPS）。

## 一、背景与挑战

均匀量化对所有权重一视同仁，但少量“显著权重”（对应大激活）对精度影响极大，需保护。

## 二、核心原理

AWQ 发现 1% 显著权重（由激活幅值决定）应保留高精度；通过对权重乘激活缩放因子、再反缩放，等效放大显著权重的重要性，无需反量化。

## 三、数学形式

缩放后 $\tilde W = \text{diag}(\hat s^\alpha) W$，其中 $\hat s = \text{mean}(|X|)$ 为激活尺度，$\alpha\in[0,1]$ 搜索；量化后再除回。

## 四、代码实现

```python
s = (X.abs().mean(0)) ** alpha
w_scaled = w * s.view(1,-1)
q = quant(w_scaled) / s.view(1,-1)
```

## 五、与其他对比

- 与 GPTQ 互补：AWQ 不重排/补偿，仅加权保护显著权重，更省算力。
- 与 边缘设备部署优化深入（GGUF 常用 AWQ）衔接。

## 六、常见误区

- 以为 AWQ 全权重高精度；其实仅显著权重被放大保留。
- $\alpha$ 需搜索，固定次优。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- AWQ 核心思想？答：激活幅值大的权重更重要，用激活尺度加权保护，避免均匀量化破坏显著通道。

## 九、演进

均匀量化 → 混合精度 → AWQ（激活感知缩放）→ SmoothQuant。

## 十、小结

AWQ 用激活感知缩放保护显著权重，以低成本达 4bit 可用精度。
