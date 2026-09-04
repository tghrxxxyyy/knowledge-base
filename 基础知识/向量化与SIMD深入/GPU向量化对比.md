# GPU向量化对比

> 对应 Hennessy & Patterson 第4章；CUDA 编程模型（NVIDIA 文档定性）。

## 一、背景与挑战

CPU SIMD 与 GPU SIMT 都并行处理数据，但执行模型与适用场景不同，需理解取舍。

## 二、核心原理

SIMT(Single Instruction Multiple Threads)：GPU 以 warp(通常32线程)为单位，所有线程同 PC 执行，遇分支则分叉(serial mask)。对比 CPU SIMD 由编译器显式排通道。GPU 靠海量线程隐藏延迟，CPU SIMD 靠低延迟核心。

## 三、形式化 / 数学基础

GPU 吞吐由并发 warp 数 $W$ 与延迟 $L$ 决定：

$$Throughput \approx \frac{W}{L} \times ALU\_width$$

需足够并行度填满调度器以隐藏内存延迟。

## 四、代码实现

```c
// CUDA：每个线程处理一个元素（SIMT）
__global__ void add(float *a, float *b, float *c, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) c[i] = a[i] + b[i];
}
```

## 五、与其他技术对比

- CPU SIMD：低延迟、乱序、通用；GPU SIMT：高吞吐、长延迟、需大规模并行。
- GPU 分支分叉降效；CPU 用预测。

## 六、常见误区

- 误以为 SIMT = SIMD：前者多线程各状态，后者单线程多通道。
- 忽视 warp 分叉代价。

## 七、与开源书 / 权威来源对应

- Hennessy & Patterson《Computer Architecture: A Quantitative Approach》
- CSAPP 中文笔记：https://github.com/Hansimov/csapp

## 八、面试题

- SIMT 与 SIMD 区别？答：多线程 vs 单线程多通道，分支处理不同。
- 为何 GPU 需大量线程？答：用并行度隐藏长内存延迟。

## 九、演进与趋势

统一 CPU/GPU 向量(ISPC、AMX、矩阵单元)模糊边界，张量核心专攻 ML。

## 十、小结

CPU SIMD 与 GPU SIMT 是 DLP 的两种形态，按延迟与并行度取舍。
