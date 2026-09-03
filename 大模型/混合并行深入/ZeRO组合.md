# 混合并行与 ZeRO 组合

> 对应 Rajbhandari et al., 《ZeRO-Offload / ZeRO-3》, 2020/2021。

## 一、背景与挑战

3D 并行中 DP 维仍可能复制优化器状态，需进一步省。

## 二、核心原理

在 DP 维启用 ZeRO 分区优化器/梯度/参数；TP/PP 负责结构切分，ZeRO 在 DP 组再分区；也可 ZeRO-Offload 把状态卸 CPU/NVMe。

## 三、数学形式

DP 维单卡状态 $\approx \frac{12\phi+2\phi+\phi}{DP\cdot stage}$；配合 TP/PP 再除。

## 四、代码实现

```python
ds_config = {"zero_optimization": {"stage": 2},
             "tensor_parallel": 8, "pipeline_parallel": 4}
```

## 五、与其他对比

- 与 数据并行深入 ZeRO 同机制扩展到混合。
- 与 张量并行深入 互补省显存。

## 六、常见误区

- ZeRO-3 与 TP 同时切参数致双重通信。
- Offload 增 CPU 带宽瓶颈。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 混合中 ZeRO 作用？答：在 DP 维再分区状态/参数，进一步降单卡显存。

## 九、演进

纯 ZeRO → ZeRO+TP/PP → Offload。

## 十、小结

ZeRO 与结构并行互补，是显存扩展双引擎。
