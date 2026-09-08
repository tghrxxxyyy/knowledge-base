# FMA融合乘加指令与误差

> 对应 Hennessy & Patterson《Computer Architecture》与 Intel SDM 卷1。

## 一、背景与挑战
表达式 a*b+c 若分两步计算会产生两次舍入误差。FMA（Fused Multiply-Add）将乘法与加法融合为单条指令，仅做一次舍入。

## 二、核心原理
FMA 内部以双倍精度（乘积全宽）暂存 a×b，再与 c 对齐相加，最后整体舍入到目标格式。这既提高精度也提升吞吐（每时钟一个 FMA）。

## 三、形式化与数学基础
普通实现：

    r = round( round(a * b) + c )

FMA 实现：

    r = round( a * b + c )

后者仅一次舍入，误差更小。

## 四、代码实现
```c
#include <immintrin.h>
double fma_use(double a, double b, double c) {
    return _mm_cvtsd_f64(_mm_fmadd_sd(
        _mm_set_sd(a), _mm_set_sd(b), _mm_set_sd(c)));
}
```

## 五、与其他技术对比
分离乘加两次舍入引入累积误差；FMA 单舍入更精确，但要求编译器不将 a*b+c 优化拆分（可用 fma() 或 pragma）。

## 六、常见误区
误以为 -ffast-math 下 FMA 与分离计算等价；在快速数学模式下编译器可能重结合，改变数值结果。

## 七、与开源书/权威来源对应
Intel SDM 卷1 描述 FMA 指令编码；Hennessy & Patterson 讨论其在 SIMD 中的吞吐优势。

## 八、面试题
1. FMA 为何精度更高？答：仅一次舍入。
2. 为何确定性数值程序常要求禁用 fast-math？

## 九、演进与趋势
FMA 成为 AVX2/FMA 与 ARM SVE 的标配，广泛服务于线性代数与神经网络。

## 十、小结
FMA 通过融合乘加与单舍入在精度与性能上双赢，是数值计算的核心指令。
