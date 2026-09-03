# Roofline分析

> 对应 Williams et al., *Roofline*, 2009。

## 一、背景与挑战

需诊断训练是算力受限还是带宽受限，定向优化。

## 二、核心原理

以算密（FLOPs/Byte）为横轴、性能为纵轴，画算力屋顶与带宽斜线；点落哪区即瓶颈。

## 三、数学形式

性能上限 $\min(\pi, \beta\cdot\frac{O}{I})$；算密 $O/I < \pi/\beta$ 为带宽受限。

## 四、代码实现

```python
arithmetic_intensity = flops / bytes
perf = min(peak_flops, peak_bw * arithmetic_intensity)
```

## 五、与其他对比

- 与 混合精度训练深入（提有效带宽）互补。
- 与 数值稳定性深入 衔接（精度影响字节）。

## 六、常见误区

- 误把带宽受限当算力问题去堆卡。
- 忽视不同算子算密差异。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 带宽受限如何优化？答：提算密（合并算子/大维度）或减访存（重计算/量化）。

## 九、演进

经验 → Roofline → 自动瓶颈分析。

## 十、小结

Roofline 是定位训练瓶颈的标准工具，指导算密/带宽优化。
