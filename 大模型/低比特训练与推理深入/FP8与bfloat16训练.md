# FP8与bfloat16训练

> 对应 Micikevicius et al., *FP8 Formats*, 2022；NVIDIA Hopper 支持。

## 一、背景与挑战

BF16 动态范围够但尾数少；FP8（E4M3/E5M2）更省带宽，需硬件与缩放配合。

## 二、核心原理

FP8 分 E4M3（高精计算）与 E5M2（高动态梯度）；前向用 E4M3、反向/梯度用 E5M2；延迟缩放（delayed scaling）稳定。

## 三、数学形式

E4M3 范围约 $\pm 448$，尾数 3 位；动态范围远小于 BF16，需 per-tensor 尺度 $s$ 映射。

## 四、代码实现

```python
with torch.cuda.amp.autocast(dtype=torch.float8_e4m3fn):
    y = model(x)
```

## 五、与其他对比

- 比 BF16 省一半带宽，需 Hopper+ 硬件。
- 与 8位矩阵乘深入 同为低比特，但 FP8 含指数更灵活。

## 六、常见误区

- 在老 GPU 用 FP8 无加速（无硬件）。
- 忽视缩放导致溢出/下溢。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- FP8 两种格式用途？答：E4M3 用于前向高精，E5M2 用于梯度高动态范围。

## 九、演进

FP32 → BF16 → FP8（混合格式）。

## 十、小结

FP8 在先进硬件上以半带宽训练，是规模化训练趋势。
