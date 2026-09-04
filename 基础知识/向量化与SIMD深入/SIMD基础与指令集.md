# SIMD基础与指令集

> 对应 Hennessy & Patterson 第4章；CSAPP 中文笔记 https://github.com/Hansimov/csapp 第5章；CS-Notes https://github.com/CyC2018/CS-Notes 。

## 一、背景与挑战

单指令多数据(SIMD)用一条指令对向量寄存器多个通道并行运算，适合多媒体、科学计算，提升数据级并行(DLP)。

## 二、核心原理

x86 从 MMX(64b)→SSE(128b)→AVX/AVX2(256b)→AVX-512(512b)；ARM NEON(128b)与 SVE(可伸缩)；RISC-V 有 V 扩展。一条加法同时加 8 个 float32(256b)。编程可用内建(intrinsic)或编译器自动向量化。

## 三、形式化 / 数学基础

宽度 $W$ 位，通道数 $L = W / bits(elem)$。加法吞吐：

$$Throughput_{add} = L \times scalar\_rate$$

理论加速 $\le L$（受限于内存带宽与依赖）。

## 四、代码实现

```c
#include <immintrin.h>
__m256 a = _mm256_loadu_ps(x);
__m256 b = _mm256_loadu_ps(y);
__m256 c = _mm256_add_ps(a, b);   // 8 个 float 并行
_mm256_storeu_ps(z, c);
```

## 五、与其他技术对比

- SIMD 同一线程内 DLP；多线程是 TLP；GPU 是 SIMT。
- 长向量(AVX-512)提升峰值但降频率(功耗)。

## 六、常见误区

- 误以为向量化自动快：对齐、跨步、分支会破坏。
- 忽视 AVX-512 降频与发热。

## 七、与开源书 / 权威来源对应

- CSAPP 中文笔记：https://github.com/Hansimov/csapp
- CS-Notes：https://github.com/CyC2018/CS-Notes
- Hennessy & Patterson《Computer Architecture: A Quantitative Approach》

## 八、面试题

- SSE/AVX 宽度？答：128/256/512 位，分别 4/8/16 个 float32。
- SIMD 与多线程区别？答：DLP 同指令多数据 vs 多控制流。

## 九、演进与趋势

可伸缩向量(SVE/SVE2、RISC-V V)按硬件定长，提升可移植性。

## 十、小结

SIMD 以数据级并行大幅提升规则计算的吞吐，是数值与多媒体核心。
