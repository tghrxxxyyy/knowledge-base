# 浮点特殊值与非数NaN处理

> 对应 Hennessy & Patterson《Computer Architecture》与 IEEE 754 标准。

## 一、背景与挑战
除零、开方负数、0/0 等操作不能产生正常数，需要能表达无穷大、非数与次正规数的机制，并让运算在异常时继续而非立即崩溃。

## 二、核心原理
阶码全 1 表示特殊值：尾数全 0 为 ±∞，尾数非 0 为 NaN。阶码全 0 表示次正规数（隐含前导 0，用于平滑下溢）。NaN 分为静默 NaN（qNaN）与发信 NaN（sNaN）。

## 三、形式化与数学基础
次正规数的值：

    value = (-1)^S * (0 + 0.f) * 2^{1 - bias}

正规最小数与次正规数之间无间隙跳跃，从而渐进下溢。

## 四、代码实现
```c
#include <math.h>
#include <stdio.h>
int main(void) {
    double inf = 1.0 / 0.0;
    double nan = 0.0 / 0.0;
    printf("isinf=%d isnan=%d\n", isinf(inf), isnan(nan));
    return 0;
}
```

## 五、与其他技术对比
定点运算无 NaN 概念，溢出即回绕或饱和；IEEE 浮点用 NaN 传播（任何含 NaN 的运算结果仍为 NaN），便于定位错误来源。

## 六、常见误区
误以为 NaN == NaN 为真；实际上 NaN 与任何值（含自身）比较都不相等，应使用 isnan()。误以为 ∞ - ∞ = 0，实际为 NaN。

## 七、与开源书/权威来源对应
CSAPP 2.4 节列举特殊值编码；Hansimov/csapp 含演示。

## 八、面试题
1. 0.0/0.0 与 1.0/0.0 结果分别是什么？答：NaN 与 +∞。
2. 如何用位模式构造一个 qNaN？

## 九、演进与趋势
NaN 的 payload 可用于携带诊断信息；现代语言（如 Rust、Go）提供显式 NaN 处理语义。

## 十、小结
特殊值与 NaN 让浮点能在异常下继续计算并通过语义传播错误，但比较与判断必须使用库函数而非 ==。
