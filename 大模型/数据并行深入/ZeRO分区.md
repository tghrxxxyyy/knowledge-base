# ZeRO 优化器状态分区

> 对应 Rajbhandari et al., 《ZeRO: Memory Optimization Toward Training Trillion Parameter Models》, 2020。

## 一、背景与挑战

数据并行每卡复制优化器状态（Adam 的 m/v）与梯度，显存成瓶颈。

## 二、核心原理

ZeRO 把优化器状态（ZeRO-1）、梯度（ZeRO-2）、参数（ZeRO-3）分区到各卡，仅用时收集；显存从 $O(\phi)$ 降到近似 $O(\phi/K)$。

## 三、数学形式

ZeRO-3 单卡显存 $\approx \frac{12\phi+2\phi+\phi}{K}$（状态/梯度/参数均分）；通信量适度增加。

## 四、代码实现

```python
from deepspeed import initialize
model, opt = initialize(model, opt, config={"zero_optimization":{"stage":3})
```

## 五、与其他对比

- 与 张量并行深入 都省显存但机制不同（分区 vs 切分）。
- 是 混合并行深入 常用组合。

## 六、常见误区

- ZeRO-3 误当纯 DP（其实跨卡收集参数，近 TP 语义）。
- 分区致通信增，需高带宽。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- ZeRO-3 与张量并行省显存区别？答：ZeRO 分区状态/参数，TP 切分矩阵计算。

## 九、演进

ZeRO-1 → 2 → 3 → ZeRO-Offload。

## 十、小结

ZeRO 通过分区优化器状态与参数突破 DP 显存墙。
