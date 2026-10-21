# 浮点特殊值与非数NaN处理

> 对应 IEEE Std 754-2019（特殊值、NaN 传播）；CSAPP 2.4；Hennessy & Patterson 浮点异常讨论。

## 一、背景与挑战

除零、对负数开方、$0/0$、$\infty - \infty$ 等操作没有普通实数解。若硬件直接触发致命异常，数值程序会在第一个边界情况崩溃，科学计算与仿真就无法「带病运行」完成扫描。IEEE 754 的回答是把 $\pm\infty$、NaN、$\pm 0$、次正规数纳入编码空间，让异常运算产生可传播的特殊值，程序可以在最后统一检查，而不是每步都防御。

这套语义也带来陷阱：NaN 与任何数（包括自身）比较都不相等，`isnan` 才可靠；$\infty - \infty = NaN$，$0/0 = NaN$，而 $1/0 = \infty$；次正规数用于平滑下溢，但会使性能骤降（有些硬件处理次正规很慢）。不理解这些规则，调试数值 bug 会浪费大量时间，安全审计也可能忽略「NaN 混入排序/断言」造成的绕过。

工程上还有一层文化差异：Python 对 `0.0/0.0` 抛 `ZeroDivisionError`，C/NumPy/Java 则返回 NaN；同一算法跨语言移植时，异常路径必须显式对齐。深度学习框架里 Inf/NaN 一旦出现往往意味着 loss 爆炸或梯度污染，需要 gradient clipping 与异常检测钩子。面试中常考：如何从位模式判断 qNaN/sNaN、为何 NaN 不等于自己、如何安全传播诊断信息（payload）。这是 IEEE 754 语义完整性的关键一环，也是写出健壮数值软件的底线知识。

## 二、核心原理

阶码字段全 1（$E = 2^{w_E}-1$）表示特殊值：

- 尾数全 0：$\pm\infty$（符号位决定正负）。
- 尾数非 0：NaN。

阶码字段全 0：

- 尾数全 0：$\pm 0$。
- 尾数非 0：次正规数（subnormal），隐含前导位为 0，真实阶码固定为 $1-bias$，用于渐进下溢。

**NaN 分类**：

- **qNaN（quiet NaN）**：尾数最高有效位为 1，参与运算不发信，默认静默传播。
- **sNaN（signaling NaN）**：尾数最高位为 0，用于指示未初始化；参与运算应触发无效操作异常，可转化为 qNaN。

qNaN 与 sNaN 的分工类似「已知坏值」与「尚未初始化」：qNaN 适合在结果确定无效后继续传播，sNaN 则希望尽早暴露错误。编译器与调试器可以利用 sticky 标志在 sNaN 被使用时断点，帮助定位污染源头。生产代码里默认产生和传播 qNaN，避免无谓异常。

**传播规则**：任何含 NaN 的操作数（除少数函数如 `maxNum` 等被明确定义的）结果通常为 NaN，优先传递 payload；同为 NaN 时实现可选择哪一个传播（常见是左操作数或带 sNaN 的那个）。

**无穷算术**：$\infty + \infty = \infty$，$\infty - \infty = NaN$，$\infty \times 0 = NaN$，$x / 0 = \pm\infty$（$x\neq 0$），$0/0 = NaN$。

**零的符号**：$+0 = -0$ 为真，但 $1/+0 = +\infty$，$1/-0 = -\infty$；这保留了极限方向信息。

**次正规的意义**：若无次正规，最小正规数 $2^{1-bias}$ 之下直接变 0，会破坏「相对误差连续」的性质，出现吸收洞；次正规让误差平滑，但有效精度逐渐下降到 0。

**NaN 传播的工程语义**：一旦计算链条中出现 NaN，后续几乎所有算术结果都变成 NaN，这相当于在数值流水线里插入了一个「有毒染色标记」。调试时可以在关键算子后检查 `isnan`，定位第一次污染的位置。矩阵库（NumPy、Eigen）常提供 `nan_to_num`、`isnan().any()` 等工具做哨兵检测。机器学习训练中，loss 一旦变 NaN 通常意味着学习率过大、log(0) 或未归一化输入，需要回溯最近若干 step 的激活值。

**±0 的微妙差异**：符号零保留了极限方向信息。复数的分支切割、`atan2(y,x)`、对数在负实轴的行为都依赖 $x$ 逼近 0 的符号。若在中间步骤把 `-0.0` 优化成 `0.0`，边界条件的数学结果可能出错。

## 三、形式化与数学基础

FP32 下设阶码字段 $E\in[0,255]$，尾数 $F\in[0,2^{23})$：

$$
value =
\begin{cases}
(-1)^S \cdot 0, & E=0, F=0 \\
(-1)^S \cdot 0.F \cdot 2^{-126}, & E=0, F\neq 0 \\
(-1)^S \cdot 1.F \cdot 2^{E-127}, & 0 < E < 255 \\
(-1)^S \cdot \infty, & E=255, F=0 \\
NaN, & E=255, F\neq 0
\end{cases}
$$

NaN 的 payload 高位约定：

$$qNaN: F \ge 2^{22} \text{（MSB of }F=1\text{）},\quad sNaN: 0 < F < 2^{22}$$

比较运算的结果为布尔，但若操作数为 NaN，`<, <=, >, >=, ==` 全为 false，`!=` 为 true——这保证了「有序性检查」：`if (a < b)` 与 `if (a >= b)` 在 NaN 下都不成立。

IEEE 754 异常标志（sticky flags）：invalid、div-by-zero、overflow、underflow、inexact；可单独 mask，用于调试而不中断。

次正规误差模型：结果 $|x| < 2^{1-bias}$ 时，可表示间隔固定为 $2^{1-bias-t}$，相对误差界变大直至 100%（结果为 0）。

## 四、代码实现

解析位模式、构造 qNaN、验证传播与比较语义：

```python
import math
import struct


def f32_bits(x):
    return struct.unpack(">I", struct.pack(">f", x))[0]


def f32_from_bits(u):
    return struct.unpack(">f", struct.pack(">I", u))[0]


def classify_f32(x):
    u = f32_bits(x)
    s = (u >> 31) & 1
    e = (u >> 23) & 0xFF
    f = u & 0x7FFFFF
    if e == 0:
        return "zero" if f == 0 else "subnormal"
    if e == 0xFF:
        if f == 0:
            return "inf"
        return "qNaN" if (f >> 22) & 1 else "sNaN"
    return "normal"


def make_qnan(payload=0x400000):
    return f32_from_bits((0 << 31) | (0xFF << 23) | (payload | 0x400000))


def make_snan(payload=0x200000):
    return f32_from_bits((0 << 31) | (0xFF << 23) | payload)


# 经典用例
if __name__ == "__main__":
    # Python 默认对 0.0/0.0 抛 ZeroDivisionError；C/NumPy 按 IEEE 产生 NaN/Inf
    # 这里用位模式构造，并用 float('inf')/float('nan') 展示语义
    inf = float("inf")
    ninf = float("-inf")
    print("classify +inf/-0:", classify_f32(inf), classify_f32(-0.0))
    print("float('nan') kind:", classify_f32(float("nan")))

    # IEEE 语义：0/0 -> NaN，1/0 -> Inf（C/NumPy；Python 需捕获）
    try:
        _ = 0.0 / 0.0
    except ZeroDivisionError:
        print("python 0.0/0.0 -> exception; IEEE would return NaN")
    print("inf-inf is nan:", math.isnan(inf - inf))
    print("inf + 1 is inf:", math.isinf(inf + 1.0))

    nan = make_qnan()
    print("qnan == qnan:", nan == nan)          # False
    print("qnan != qnan:", nan != nan)          # True
    print("qnan < 1.0:", nan < 1.0)             # False
    print("use math.isnan:", math.isnan(nan))

    # 次正规
    tiny = f32_from_bits(1)   # 最小正次正规 2^-149
    print("min subnormal bits=1 ->", tiny, classify_f32(tiny))
    print("tiny*tiny underflows:", tiny * tiny)

    # payload 传递：NaN + 1
    r = nan + 1.0
    print("nan+1 still nan:", math.isnan(r), "bits", hex(f32_bits(r)))
```

预期：`qnan == qnan` 为 False；`inf-inf` 为 NaN；最小次正规约 $1.4\times 10^{-45}$；`nan+1` 仍为 NaN。覆盖分类、构造、传播与比较。

## 五、与其他技术对比

| 特性 | IEEE 浮点 | 定点/整数 | 语言级选项 |
|------|-----------|-----------|------------|
| 除零 | ±Inf | 异常或未定义 | 可抛异常 |
| 无效运算 | NaN | 未定义 | Option/Result |
| 下溢 | 次正规平滑 | 回绕/饱和 | 检查 |
| 溢出 | ±Inf | 回绕/饱和 | 检查 |
| 比较 NaN | 全序失败 | 正常 | 自定义 |

与饱和运算对比：DSP/INT8 常用饱和，无 NaN 但丢失「异常可传播」；与抛异常对比：NaN 让向量化/流水线不因单点异常中断，适合批量科学计算，但需要事后检查。

再看「可诊断性」：NaN payload 最多 22 位（FP32）或 51 位（FP64）可用于编码错误来源，例如把不同算子的错误码写进 payload，最后统一回收分析。这比单纯的 sticky 异常标志信息量更大，但跨硬件传播时 payload 可能被归一化为默认 qNaN，不能当作可靠协议字段。与语言级 `Result`/`Option` 相比，NaN 不要求改签名，却让错误悄悄扩散；两者适合不同层：核心数值内核用 IEEE 特殊值，应用层用显式错误类型做边界。

## 六、常见误区

1. **「NaN == NaN 为真」**——错误，任何涉及 NaN 的有序比较都为假；必须用 `isnan`。
2. **「∞ - ∞ = 0」**——实际是 NaN，表示未定式；$1/0=\infty$ 与 $0/0=NaN$ 要区分。
3. **「所有 NaN 都一样」**——qNaN 与 sNaN 语义不同，payload 可携带诊断信息；不同实现传播哪个 payload 可能不同。
4. **「次正规可以忽略」**——逐步下溢保护了相对误差连续性，但某些硬件上运算次正规很慢（denormal penalty），数值代码有时会 flush-to-zero。
5. **「用 (x == x) 判断 NaN 就万事大吉」**——技术上可行，但可读性差且可能被优化器假设「无 NaN」时消除；应使用标准库并理解编译选项。

## 七、与开源书/权威来源对应

- IEEE Std 754-2019 Section 3.4（特殊值）与 5.11（NaN 传播）。
- CSAPP 2.4 节：FP32 特殊值编码表；中文笔记 https://github.com/Hansimov/csapp。
- Hennessy & Patterson：浮点异常与状态寄存器。
- SoftFloat/TestFloat：权威边角行为测试向量。
- C/C++ `math.h`：`isnan`、`isinf`、`fpclassify`。

## 八、面试题

1. **0.0/0.0 与 1.0/0.0 结果分别是什么？**  
   参考答案：前者是 NaN（未定式），后者是 $+\infty$（实无穷极限）。负数侧对应 $-\infty$。

2. **如何用位模式构造一个 qNaN？**  
   参考答案：阶码全 1，尾数 MSB 为 1，其余 payload 任意非零。例如 FP32 `0x7FC00000`。

3. **为什么 NaN 与自身不相等？**  
   参考答案：IEEE 规定有序比较在 NaN 下一律假，便于发现错误值；无序比较 `!=` 为真。`isnan` 才是正确检测方式。

4. **次正规数的作用与代价？**  
   参考答案：作用是平滑下溢、避免吸收洞；代价是精度递减，且部分硬件处理慢，可选 FTZ/DAZ（flush/denormals-are-zero）但会改变数值结果。

## 九、演进与趋势

NaN 的 payload 被用于传诊断、指针标记（如 JavaScript/Java 用 NaN boxing 表示任意值）；GPU 与 AI 格式（BF16/FP8）定义自己的 NaN/sNaN 与 flush-to-zero 策略以省硬件。语言层面：Rust 的 `f64` 语义、Python 的 `math.isnan`、C++ `std::isnan` 鼓励显式处理；编译器优化（`-ffinite-math-only`）会假设无 NaN 而删检查，数值库要小心。可复现计算要求异常标志与舍入模式的确定性。

混合精度与低精度格式把特殊值问题放大：FP8 只有 4 位阶码，Inf/NaN 编码空间更拥挤，训练框架必须定义溢出策略（scale 或截断）。硬件监控也更细：NVIDIA 的 `cuda-gdb`、AMD 的 ROCgdb 可以在 NaN 产生时断点；性能计数器统计「非规格化」与「无效操作」次数。未来「可解释 NaN」（带类型标签）与混合精度的溢出检测，仍是体系结构与语言接口的活跃话题，而正确使用 `isnan`、理解传播规则，是这一切的基础。

## 十、小结

特殊值与 NaN 让浮点在边界情况下继续计算并把错误向后传播：阶码全 1 表示 Inf/NaN，全 0 表示零与次正规。正确使用 `isnan`、理解传播与比较语义、区分 qNaN/sNaN 与次正规代价，是写出健壮数值程序、并通过面试关的基础。
