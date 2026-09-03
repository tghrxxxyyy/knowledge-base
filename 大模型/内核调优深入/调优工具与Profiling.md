# 调优工具与Profiling

> 对应 NVIDIA, *Nsight Compute*（kernel profiler）；与 内核调优深入 衔接。

## 一、背景与挑战

不量测就无调优，需定位 stall 原因（访存/算力/同步）。

## 二、核心原理

用 Nsight Compute 采集 achieved occupancy、DRAM throughput、warp stall reason；用 roofline 图判断是否达到上限。

## 三、数学形式

计算效率 $\eta_c=\frac{T_{kernel}}{T_{peak\cdot FLOP}}$；访存效率 $\eta_m=\frac{B_{kernel}}{B_{peak}}$；短板决定瓶颈。

## 四、代码实现

```bash
ncu --metrics sm__throughput.avg,pcie__bytes_sum ./my_kernel
```

## 五、与其他对比

- 与 编译部署深入（端到端 profiling）互补。
- 与 服务框架深入（吞吐/延迟指标）在系统层呼应。

## 六、常见误区

- 仅看时间不看病因，调错方向。
- 在 profiler 开销下测小 kernel 失真。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 调优先测什么？答：先测 achieved occupancy、DRAM/L2 吞吐与 stall reason 定位瓶颈。

## 九、演进

nsight/printf → 结构化 profiler → 自动化瓶颈诊断。

## 十、小结

Profiling 是调优前提，量化瓶颈才能有的放矢。
