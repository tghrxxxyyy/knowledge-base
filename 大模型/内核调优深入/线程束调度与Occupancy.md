# 线程束调度与Occupancy

> 对应 NVIDIA, *Volta Architecture Whitepaper*, 2017（independent thread scheduling）；与 内核调优深入 衔接。

## 一、背景与挑战

SM 以 warp（32 线程）为单位调度，stall（如访存延迟）时需足量 warp 切换掩盖延迟。

## 二、核心原理

Occupancy 衡量活跃 warp 占比；高占用可隐藏延迟，但过高会争抢寄存器/共享内存，需平衡。

## 三、数学形式

隐藏延迟所需 warp 数 $W \ge \frac{L_{mem}}{T_{issue}}$；占用率 $\rho=\frac{W_{active}}{W_{max}}$。

## 四、代码实现

```python
# 通过限制寄存器数提升占用率
attrs = {"maxrregcount": "64"}
```

## 五、与其他对比

- 与 GPU内存层级与Tiling（延迟隐藏）配合。
- 与 编译部署深入（编译期占用决策）相关。

## 六、常见误区

- 高占用≠高吞吐，寄存器溢出反而更慢。
- 忽略同步点（__syncthreads）造成的 warp 等待。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 为何要高占用？答：提供足够 warp 在访存延迟期间切换，隐藏延迟提升吞吐。

## 九、演进

静态占用 → 延迟隐藏分析 → 自适应寄存器分配。

## 十、小结

占用率与延迟隐藏是吞吐核心，但须与寄存器/共享内存预算权衡。
