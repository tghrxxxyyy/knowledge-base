# FMA融合乘加指令与误差

> 对应 IEEE Std 754-2008/2019（fusedMultiplyAdd）；Hennessy & Patterson《Computer Architecture》；Intel SDM Vol. 1 FMA 章节。

## 一、背景与挑战

线性代数、多项式求值、神经网络里最常见的形式是 $a\times b + c$。若硬件把它实现成两条独立指令：

$$r = fl\big(fl(a\times b) + c\big)$$

乘积会先舍入一次，加法再舍入一次，误差累积。对大量项的点积、矩阵乘，两次舍入的误差会随 $n$ 增长；而若硬件提供「融合乘加」（FMA）单指令：

$$r = fl(a\times b + c)$$

乘积在全精度中间保留，只在最后舍入一次，既更精确又往往更快（少一次舍入与一次写回）。

挑战在于：编译器是否允许把 $a*b+c$ 折叠成 FMA？这会改变数值结果（即使更精确），因此 `-ffast-math`、`-mfma`、括号与 `fma()` 函数有微妙语义差异；调试时「同一公式不同优化等级结果不同」是经典陷阱。另一方面，FMA 内部要求宽中间表示（乘积 $2p$ 位），硬件成本不低；不是所有 CPU/嵌入式 DSP 都有。

面试与数值工程要求：理解单次舍入误差界、会用 `fma()` 保证语义、知道 FMA 用于 Kahan 补偿、矩阵乘、多项式（Horner）与提高精度的补偿算法。

工程界与学术界的共识是：FMA 在绝大多数情况下是「免费的精度」，但必须把「语义确定性」写进构建规范。CUDA 的 `__fmaf_rn`、OpenCL 的 `fma`、x86 的 `vfmadd231sd` 都承诺单次舍入；而 C 的 `a*b+c` 在 `-ffp-contract=fast`（GCC/Clang 默认之一）下可能被折叠，换编译器或换优化等级就换数值。科学计算团队常用「严格 IEEE + 显式 fma + 禁 fast-math」的组合，换取跨平台可复现。

另一个实际问题是误差预算管理：多项式求值、ODE 积分器、物理引擎都会估算累计误差。两次舍入的非融合实现在长链乘加中误差随项数增长；FMA 与补偿求和能把误差压回 $O(nu)$ 甚至 $O(u)$ 量级。面试中，能说清单次舍入误差界、消去与条件数、以及「为何要显式 fma」这三点，基本可以过关。

## 二、核心原理

**FMA 语义**：计算 $a\times b + c$，乘积 $a\times b$ 以无限精度（或至少不先舍入）保留，与 $c$ 对齐相加，最后一次性舍入到目标格式并设置一次 inexact 标志。这符合 IEEE 754 对 `fusedMultiplyAdd` 的规定（C 的 `fma()` 必须如此，不得拆成两次舍入）。

**与分离实现的差异**：

$$r_{fma} = \mathrm{round}(a b + c),\quad r_{split} = \mathrm{round}(\mathrm{round}(ab) + c)$$

两者可能差 1 ulp 以上；在消去或 $c$ 与 $ab$ 量级接近时差异明显。

**误差界**：

$$|r_{fma} - (ab+c)| \le \frac12 ulp(ab+c)$$

相对误差仍约 $u=2^{-p}$，但相对「真实 $ab+c$」而言是单次舍入误差，没有中间舍入的额外项。

**硬件实现**：乘法器产生宽乘积（$2p$ 或 $2p+2$ 位），加法前对齐 $c$（指数差可能很大），使用 GRS 位跟踪尾部，最后统一规格化舍入。吞吐上 FMA 常与乘法同延迟但双倍吞吐资源（FMA 单元常独立于加法/乘法）。

**编译器折叠规则**：语言标准要求 `fma(a,b,c)` 精确；而表达式 `a*b+c` 是否折叠为 FMA 由编译器决定。GCC/Clang 在 `-mfma` / `-ffp-contract=fast` 时可能折叠；严格 IEEE 模式（`-ffp-contract=off`）禁止。要可复现结果，应显式调用 `fma()` 或固定编译选项。

**边界条件**：Inf/NaN 传播与非融合一致；中间乘积可能溢出但最终被加法消去——FMA 仍按 IEEE 规定在最后舍入时判断溢出（与「先乘后加」不同，可能减少假溢出）。

**数值稳定的经典用法**：多项式求值用 Horner 规则并配合 FMA，可减少中间舍入；差积、行列式、Gram-Schmidt 正交化里，把「减法」写成 FMA 形式能避免消去放大误差。Kahan 求和与 Priest 精确求和则在加法层面补偿，与 FMA 正交、可叠加。需要注意的是，FMA 不能修复病态问题本身——若条件数 $\kappa$ 很大，最终相对误差仍是 $\kappa u$ 量级，此时应改写公式或提高工作精度。

## 三、形式化与数学基础

设精度 $p$（FP64 为 53），真实值 $s = ab + c$。非融合：

$$r_{split} = (ab(1+\delta_1) + c)(1+\delta_2),\quad |\delta_i|\le u$$

展开：

$$r_{split} \approx ab + c + ab\delta_1 + (ab+c)\delta_2 + O(u^2)$$

误差包含 $ab\delta_1$ 项。当 $|ab|$ 很大而 $c$ 相反符号且接近 $-ab$ 时，该绝对误差在消去后相对误差巨大。

FMA：

$$r_{fma} = (ab + c)(1+\delta),\quad |\delta|\le u$$

只有一次乘性扰动。对点积 $r = \sum_{i=1}^n a_i b_i$，若逐项 FMA 累加（`acc = fma(a[i], b[i], acc)`），误差界约为 $O(nu)$ 但常数更优；若先乘后加则更差。Kahan 补偿求和可进一步降到 $O(u)$。

**溢出安全**：若 $|ab|$ 超过 $x_{max}$ 但 $ab+c$ 在范围内，分离实现可能先得到 Inf，FMA 则可能给出有限结果。这是 FMA 数值优越性的另一面。

**条件数**：定义 $\kappa = (|ab|+|c|)/|ab+c|$。消去时 $\kappa$ 很大，相对误差 $\approx \kappa u$，FMA 不能消除问题本身的病态，只是减少额外舍入。

## 四、代码实现

用 Python `math.fma`（3.13+ 或回退实现）对比分离与融合误差，并展示补偿求和：

```python
import math


def split_madd(a, b, c):
    """普通两次舍入（用 float 模拟，Python float 是 FP64）。"""
    return (a * b) + c


def kahan_dot(xs, ys):
    """用补偿求和降低点积误差。"""
    s = 0.0
    comp = 0.0
    for x, y in zip(xs, ys):
        prod = x * y
        t = s + prod
        if abs(s) >= abs(prod):
            comp += (s - t) + prod
        else:
            comp += (prod - t) + s
        s = t
    return s + comp


def demo_fma():
    # 经典差异：0.1*0.2 + (-0.02...) 分离舍入得 0，融合得非零
    a, b, c = 0.1, 0.2, -0.020000000000000004
    r_split = split_madd(a, b, c)
    try:
        r_fma = math.fma(a, b, c)   # Python 3.13+
    except AttributeError:
        from fractions import Fraction
        r_fma = float(Fraction(a) * Fraction(b) + Fraction(c))
        print("note: math.fma unavailable, used exact Fraction then one rounding")
    print("split:", r_split, "fma:", r_fma)
    assert r_split != r_fma or abs(r_fma) > 0

    # 点积：大量极小项 + 一个大项，朴素左累加 vs 补偿求和
    n = 10000
    xs = [1.0] * n
    ys = [1e-16] * n
    ys[0] = 1.0
    naive = 0.0
    for x, y in zip(xs, ys):
        naive = naive + (x * y)   # 逐次左累加，不用 sum 的内建补偿
    comp = kahan_dot(xs, ys)
    print("naive dot:", naive, "kahan:", comp, "diff:", naive - comp)


if __name__ == "__main__":
    demo_fma()
```

预期：在有 `math.fma` 的环境，`fma` 结果更接近精确值；点积中补偿求和与朴素 `sum` 出现可见差异。实际工程 C 侧应使用 `#include <math.h>` 的 `fma()`，并 `#pragma STDC FP_CONTRACT OFF` 控制折叠。

## 五、与其他技术对比

| 方式 | 舍入次数 | 精度 | 吞吐 | 备注 |
|------|----------|------|------|------|
| 分离乘加 | 2 | 较低 | 2 条指令 | 依赖优化是否折叠 |
| FMA | 1 | 高 | 1 条，常更快 | IEEE `fma` |
| 更高精度累加 | 1（宽） | 最高 | 寄存器压力大 | FP64 累加 FP32 |
| Kahan 补偿 | 逻辑 | 极高 | 慢 | 纯软件 |

与「普通乘法+加法」对比：FMA 省中间写回与舍入，现代 CPU 上矩阵乘、卷积都用 FMA 吞吐。与「双精度累加」对比：GPU Tensor Core 常用 BF16 乘 + FP32 累加，是硬件版「宽中间」思想。与「高精度库」对比：MPFR 任意精度可把误差压到任意小，但吞吐极低；FMA 是硬件层几乎零成本的精度提升，适合热路径。

从误差分析角度再看：设单次舍入相对误差界 $u=2^{-p}$，非融合乘加最坏含两个独立 $\delta$，而 FMA 只含一个。对 $n$ 项点积，误差从「乘加链累积」变为「累加链累积」，配合补偿求和还能进一步下降。这是数值线性代数库（BLAS、LAPACK）把 FMA 当作基本原语的根本原因。

## 六、常见误区

1. **「`-ffast-math` 下 FMA 与分开算等价」**——不等价，且 fast-math 还允许重结合、近似倒数，数值结果不可复现。
2. **「FMA 总是更快」**——在某些乱序核上 FMA 单元紧张时可能成为瓶颈；要基准测试。
3. **「FMA 消除了所有误差」**——只是减少一次舍入；病态问题（消去、大条件数）仍需数值方法（补偿、改写公式）。
4. **「`a*b+c` 写出来就一定用 FMA」**——取决于编译器、标志与目标 ISA；要保证语义请调用 `fma()`。
5. **「FMA 改变结果因此禁止使用」**——结果通常更精确；问题在于可复现性与跨平台一致性，而不是「变错」。

## 七、与开源书/权威来源对应

- IEEE 754-2008/2019：`fusedMultiplyAdd` 语义定义。
- Intel SDM Vol. 1：`VFMADD`、`VFMSUB` 系列指令编码与延迟。
- Hennessy & Patterson：SIMD/FMA 在峰值 FLOPS 中的作用。
- C 标准 `fma()`、GCC 文档 `-ffp-contract`。
- 补偿算法：Kahan 求和、Priest/Shewchuk 精确求和（《Adaptive Precision Floating-Point Arithmetic and Fast Robust Geometric Predicates》）。

## 八、面试题

1. **FMA 为何精度更高？**  
   参考答案：乘积不先舍入，只在加完后舍入一次；避免 $round(round(ab)+c)$ 的中间误差项。

2. **为何确定性数值程序常要求禁用 fast-math 并显式 `fma()`？**  
   参考答案：fast-math 允许重结合与折叠，跨编译器/等级结果不一致；`fma()` 保证单舍入语义，便于复现与验证。

3. **FMA 对消去问题有帮助吗？**  
   参考答案：不能消除病态条件数，但减少额外舍入误差；严重消去仍需补偿求和或改写。

4. **矩阵乘为什么用 FMA？**  
   参考答案：每个乘积立即加进累加器，单舍入、高吞吐（FMA 常 1 条指令 2 FLOP 乘+加），是 BLAS/GPU 的基础。

## 九、演进与趋势

FMA 已是 AVX2/AVX-512、ARM NEON/SVE 的标配，GPU Tensor Core 更把「乘加宽累加」做成矩阵指令。可复现科学计算推动编译器提供严格的收缩控制；数值库（如 BLIS、Eigen）显式用 FMA。混合精度训练里 FP16 乘 + FP32 累加是 FMA 思想的延伸。未来可能出现更宽累加（FP64 累加 FP16/BF16）、可变精度 FMA，以及面向误差可控的硬件开关。理解单次舍入与 $fl(ab+c)$，才能正确解释跨平台数值差异并设计稳定算法。

## 十、小结

FMA 将乘加融合为一次舍入，误差更小、吞吐更高，是数值计算与深度学习的核心指令；它不改变 IEEE 语义框架，却要求程序员理解折叠规则与可复现性。结合补偿求和与条件数分析，才能把 FMA 的精度优势落到实处。
