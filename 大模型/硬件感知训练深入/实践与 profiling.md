# 硬件感知训练实践与Profiling

> 对应 PyTorch Profiler / Nsight 实践；与 训练不稳定诊断深入 / 可复现性工程深入 衔接。

## 一、背景与挑战

优化需量化，盲目调参无效；profiling 定位瓶颈。

## 二、核心原理

用 profiler 看算子耗时/显存/算密，定位带宽/算力受限，定向改维度/精度/融合。

## 三、数学形式

记录每算子 $t, flops, bytes$，算算密对照 Roofline。

## 四、代码实现

```python
with torch.profiler.profile() as p:
    train_step()
print(p.key_averages().table(sort_by="cuda_time_total"))
```

## 五、与其他对比

- 与 混合精度训练深入 / 梯度累积重计算深入 协同调优。
- 与 边缘端侧推理深入（端侧 profiling）对照。

## 六、常见误区

- 只在小 batch profiling 失真（带宽受限假象）。
- 忽视主机-设备拷贝开销。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- profiling 第一步看什么？答：算子耗时分布与算密，判断算力/带宽瓶颈。

## 九、演进

手动计时 → 专业 profiler → 自动建议。

## 十、小结

profiling 把硬件感知训练落到数据，定位瓶颈才能有效优化。
