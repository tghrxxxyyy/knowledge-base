# 混合精度与 AMP

> 对应 NVIDIA AMP / BF16 实践。

## 一、核心概念

用 FP16/BF16 做前向/反向，用 FP32 做权重更新主副本(或 loss scaling)，在几乎不损精度下翻倍吞吐、减半显存。BF16 动态范围大，训练更稳定，是当今主流。

```python
with torch.cuda.amp.autocast(dtype=torch.bfloat16):
    loss = model(x)
scaler.scale(loss).backward(); scaler.step(opt)
```

## 二、关键要点

| 类型 | 范围 | 推荐 |
|------|------|------|
| FP16 | 小 | 需 loss scaling |
| BF16 | 大 | 首选 |

## 三、面试题

- BF16 相比 FP16 为何训练更稳定？
