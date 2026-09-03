# 激活与 KV 量化

> 对应激活量化与 KV 缓存量化；与 KV缓存优化深入 衔接。

## 一、背景与挑战

激活含离群值难直接 INT8；KV 随长度增长，量化可大幅降显存。

## 二、核心原理

激活用 SmoothQuant（迁移离群到权重）或 FP8；KV 用 per-token 缩放量化到 INT8/FP8，decode 时反量化。

## 三、数学形式

SmoothQuant：$Y=X\text{diag}(s)^{-1}\cdot \text{diag}(s)W$，把离群从 $X$ 移到 $W$。

## 四、代码实现

```python
kv_q = quantize_kv(kv, dtype=torch.float8_e5m2)
```

## 五、与其他对比

- 与 权重量化深入 互补（激活更难）；
- 与 预填充解码分离深入 KV 传输复用。

## 六、常见误区

- 直接 INT8 激活遇离群致崩；
- KV 量化损长上下文精度。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- SmoothQuant 解决什么？答：迁移激活离群到权重，使激活可低比特量化。

## 九、演进

FP16 → INT8 激活 → FP8/KV 量化。

## 十、小结

激活/KV 量化需处理离群，配合权重量化降本。
