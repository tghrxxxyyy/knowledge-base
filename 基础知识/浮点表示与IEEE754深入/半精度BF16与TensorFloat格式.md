# 半精度BF16与TensorFloat格式

> 对应 IEEE 754 格式语义；ARM Architecture Reference Manual（BF16）；NVIDIA Ampere/Tensor Core 文档（TF32）；Micikevicius et al.《Mixed Precision Training》(2018)。

## 一、背景与挑战

深度学习训练与推理的核心是大规模矩阵乘：激活、梯度、权重动辄数十 GB，FP32 存储与带宽成本极高，而张量计算又对精度「够用即可」。直接改用 IEEE FP16（1/5/10）虽然省一半带宽，但阶码只有 5 位、动态范围约 $6\times 10^{-5}$ 到 $6.5\times 10^{4}$，梯度很容易下溢为 0 或上溢为 Inf，训练不收敛。

工程界需要一种「牺牲尾数、保留 FP32 阶码范围」的 16 位格式：BF16（bfloat16，Brain Floating Point）由此而来——1 位符号、8 位阶码、7 位尾数，动态范围与 FP32 相同，精度约 2–3 位有效十进制。另一条路线是 NVIDIA 的 TF32（TensorFloat-32）：1/8/10，内部按 FP32 累加前先截断尾数，兼顾 Tensor Core 吞吐与范围。

挑战是选型：推理可接受更低精度，训练必须保梯度范围；混合精度训练（FP32 主权重 + BF16/FP16 计算）成为主流；序列化与转换要正确处理舍入，否则 checkpoint 不兼容。面试常考「BF16 与 FP16 差在哪、为何能直接截断 FP32」。

工程实践已经形成一套清晰分工：矩阵乘、卷积等「大吞吐」算子用 BF16/FP16/TF32，softmax、layer norm、loss 计算、梯度累加与权重更新留在 FP32。这种混合精度策略既吃满 Tensor Core 吞吐，又避免尾数过短导致的数值漂移。序列化方面，checkpoint 通常保存 FP32 主权重，导出推理图时再按目标硬件选择 BF16、INT8 或 FP8，并做一次校准。

挑战还包括硬件与软件的契约：同一公式在 CPU FP32、GPU BF16 累加 FP32、TPU BF16 三种路径下结果并不 bit 级一致，可复现训练要固定设备、随机种子与归约顺序。面试常考「BF16 与 FP16 差在哪、为何能直接截断 FP32、混合精度为什么保留 FP32 主权重」，答清楚这三问，基本就掌握了低精度训练的主线。

## 二、核心原理

**BF16**：位宽 16 = 1 + 8 + 7。与 FP32 共享 8 位阶码布局，偏置同为 127。因此 FP32→BF16 只需把低 16 位截断（可加 RNE 舍入）；BF16→FP32 直接补 16 个 0。动态范围：约 $\pm 3.4\times 10^{38}$，与 FP32 一致。有效位 8 位（含隐含 1），约 2.4 位十进制精度，$u_{BF16} = 2^{-8} \approx 0.0039$。

**FP16（IEEE binary16）**：1 + 5 + 10，偏置 15，动态范围小，适合图形与部分推理，训练需 loss scaling。

**TF32**：1 + 8 + 10（尾数 10 位）。在 Tensor Core 中作为「计算格式」：输入 FP32 张量被硬件隐式截断为 TF32（保阶码、砍尾数），乘加后以 FP32 累加/输出。它不是可存储的内存格式，而是加速语义；动态范围同 FP32，精度介于 FP32 与 BF16 之间。

**混合精度训练**（Micikevicius 等）：

1. FP32 保存主权重；
2. 每步把权重转 BF16/FP16 做前向/反向矩阵乘；
3. 梯度用 FP32 或高精度累加，更新主权重；
4. FP16 需要动态 loss scaling，BF16 因范围大通常可不用或少用。

不变量：范围必须覆盖梯度与激活的动态跨度；精度只需保证优化方向正确，噪声有时甚至有正则效果。

**边界条件**：BF16 尾数短，求和、归一化、softmax 等对精度敏感的算子常升到 FP32；转换必须用 RNE 或截断一致策略，否则不可复现。硬件支持：CPU（AVX512-BF16、AMX）、GPU（A100/H100）、ARM v8.6+。

**训练稳定性的机理**：梯度往往跨越多个数量级，且在反向传播中被连续乘以小系数。FP16 的 5 位阶码让小梯度下溢为 0，大梯度又容易上溢，不得不引入动态 loss scaling。BF16 因为阶码与 FP32 相同，直接避开了这两个坑，训练配置简单得多。代价是权重与激活的有效位只有 8 位，舍入噪声更大，但在随机梯度的噪声尺度下通常可接受，有时甚至起到轻微正则作用。真正关键的更新量、动量、方差统计仍放在 FP32，保证「小步累积」不被舍入吞掉。

## 三、形式化与数学基础

BF16 有效精度 $p=8$，机器精度：

$$u = 2^{-8} = \frac{1}{256} \approx 3.9\times 10^{-3}$$

相对误差界（RNE）约 $u$。最大规格化：

$$x_{max} = (2 - 2^{-7}) \times 2^{127} \approx 3.39\times 10^{38}$$

最小正规：$2^{-126}$，与 FP32 相同。

FP16 对比：$p=11$，$u=2^{-11}\approx 4.88\times 10^{-4}$，范围 $2^{\pm 15}$ 量级，最大约 65504。

TF32：$p=11$（含隐含 1），阶码 8 位。计算路径：

$$r = \mathrm{FP32\_accum}\big( \mathrm{TF32}(a) \times \mathrm{TF32}(b) \big)$$

相对 FP32 乘法，仅引入尾数截断误差 $O(2^{-11})$，累加仍 FP32，故训练损失影响小。

**转换公式**（FP32→BF16）：

$$BF16 = \mathrm{round}_{RNE}\left(\frac{x}{2^{e-7}}\right) \times 2^{e-7}$$

即把 24 位有效舍入到 8 位。实现上常用：取高 16 位，若低位舍入条件满足则加 1（注意进位跨过阶码边界）。

**带宽收益**：内存减半，峰值 FLOPS 提升（Tensor Core 对 BF16/FP16 吞吐远高于 FP32）。

## 四、代码实现

实现 FP32↔BF16 转换（截断与 RNE 两种）、构造 TF32 截断，并验证范围/精度：

```python
import struct


def f32_bits(x: float) -> int:
    return struct.unpack(">I", struct.pack(">f", x))[0]


def f32_from_bits(u: int) -> float:
    return struct.unpack(">f", struct.pack(">I", u))[0]


def fp32_to_bf16_trunc(x: float) -> int:
    """截断低 16 位（不进位）。返回 16 位 BF16 位模式。"""
    return f32_bits(x) >> 16


def fp32_to_bf16_rne(x: float) -> int:
    """RNE 舍入到 BF16。"""
    u = f32_bits(x)
    upper = u >> 16
    lower = u & 0xFFFF
    if lower > 0x8000 or (lower == 0x8000 and (upper & 1)):
        upper += 1
    return upper & 0xFFFF


def bf16_to_f32(b: int) -> float:
    return f32_from_bits((b & 0xFFFF) << 16)


def fp32_to_tf32_trunc(x: float) -> float:
    """TF32：保 8 位阶码 + 10 位尾数，清零多余尾数位。"""
    u = f32_bits(x)
    # 有效尾数 23 位，保留高 10 位，清低 13 位
    u &= ~((1 << 13) - 1)
    return f32_from_bits(u)


# 经典用例
if __name__ == "__main__":
    vals = [1.0, 0.1, 3.14159265, 1e-38, 1e30, -2.75]
    for v in vals:
        b_tr = fp32_to_bf16_trunc(v)
        b_rn = fp32_to_bf16_rne(v)
        rec = bf16_to_f32(b_rn)
        rel = abs(rec - v) / abs(v) if v != 0 else 0
        print(f"{v!r:12} bf16_rne={b_rn:04x} rec={rec} rel_err={rel:.4e}")

    # 范围对比：1e30 在 BF16 可表示；FP16（约 65504）会溢出
    print("1e30 as BF16:", bf16_to_f32(fp32_to_bf16_rne(1e30)))
    print("TF32 of pi:", fp32_to_tf32_trunc(3.141592653589793))

    # 相对误差应 < u ≈ 0.0039
    import random
    random.seed(0)
    max_rel = 0.0
    for _ in range(1000):
        v = random.uniform(-10, 10)
        rec = bf16_to_f32(fp32_to_bf16_rne(v))
        if v != 0:
            max_rel = max(max_rel, abs(rec - v) / abs(v))
    print("max rel err sample:", max_rel, "u=", 2 ** -8)
```

预期：`1.0` 与 `-2.75` 往返无误差；`0.1` 相对误差约 $10^{-3}$；`1e30` 在 BF16 仍有限（FP16 会 Inf）；采样最大相对误差小于 $2^{-8}$。这验证了「共享阶码、牺牲尾数」的结论。

## 五、与其他技术对比

| 格式 | S/E/F | 动态范围 | 精度（约） | 典型用途 |
|------|-------|----------|------------|----------|
| FP32 | 1/8/23 | $10^{\pm38}$ | 7 位十进制 | 权重主存、累加 |
| FP64 | 1/11/52 | $10^{\pm308}$ | 16 位 | 科学仿真 |
| FP16 | 1/5/10 | $10^{\pm5}$ | 3 位 | 图形、部分推理 |
| BF16 | 1/8/7 | 同 FP32 | 2–3 位 | 训练、梯度 |
| TF32 | 1/8/10 | 同 FP32 | 介于 | Tensor Core 计算 |
| FP8 E4M3/E5M2 | 1/4/3 或 1/5/2 | 较小 | 1–2 位 | 推理、前向 |

与 FP16 对比：BF16 范围宽、精度低，训练更稳；FP16 精度高些但需 loss scaling。与 TF32 对比：BF16 是存储格式，TF32 主要是计算截断语义。与 INT8 对比：INT8 需量化校准，吞吐更高但动态范围靠 scale，推理部署常用。与 FP8 对比：E4M3/E5M2 更省带宽，但范围与精度都更紧，常配合缩放因子与混合精度策略使用。

选型经验法则可以概括为三问：一是动态范围是否覆盖梯度与激活（是则可考虑 BF16，否则保留 FP32 累加）；二是精度噪声是否小于优化噪声（深度学习通常可以）；三是目标硬件是否有原生加速（没有则收益大打折扣）。数据库数值列、科学仿真、金融计算一般不使用 BF16，而继续用 FP64 或定点十进制。

## 六、常见误区

1. **「BF16 就是 FP16 的别名」**——位布局完全不同：BF16=8 位阶码/7 位尾数，FP16=5/10；二者不能位级互转。
2. **「BF16 精度足够所有算子」**——softmax、layer norm、归约求和对尾数敏感，常混用 FP32；直接用 BF16 可能数值不稳。
3. **「TF32 可以像 BF16 一样存文件」**——TF32 主要是 Tensor Core 的计算格式，内存/显存通常仍以 FP32 存储，由硬件在计算时截断。
4. **「转换只需右移 16 位」**——截断会产生系统偏差；应按 RNE 或至少对齐场景约定，并处理进位导致阶码+1 的边界。
5. **「混合精度训练一定会丢精度到不可用」**——配 FP32 主权重、适当累加与 loss scaling，实证上几乎不掉点，速度与内存大幅优化。

## 七、与开源书/权威来源对应

- IEEE 754-2019：binary16 等格式定义与舍入规则。
- ARM ARM：BF16 数据处理指令（BFCVT、BFMLAL 等）。
- NVIDIA《TensorFloat-32》与 A100 白皮书：TF32 在 Tensor Core 的角色。
- Micikevicius et al.,《Mixed Precision Training》(ICLR 2018 / arXiv:1710.03740)。
- PyTorch/NumPy 文档：`torch.bfloat16`、`ml_dtypes.bfloat16` 的位布局说明。

## 八、面试题

1. **为何 BF16 能直接取 FP32 高 16 位？**  
   参考答案：两者共享 8 位阶码布局，仅尾数宽不同；截断低 16 位即得 BF16（严格应用时再 RNE 舍入）。

2. **BF16 与 FP16 的主要差异？**  
   参考答案：阶码 8 vs 5，BF16 动态范围同 FP32、精度更低；FP16 精度稍高但易溢出/下溢，训练常要 loss scaling。

3. **混合精度训练为什么保留 FP32 主权重？**  
   参考答案：小更新量加到 BF16 权重会被舍入「吞掉」，用 FP32 存权重再转低精度计算，保证更新累积正确。

4. **TF32 是存储格式吗？**  
   参考答案：主要是 Tensor Core 计算语义：FP32 输入被截断为 1/8/10 参与乘加，再 FP32 累加/输出；不是通用文件格式。

## 九、演进与趋势

低精度格式正继续细分：FP8（E4M3/E5M2）用于推理与部分训练前向；MX（microscaling）格式引入共享指数的块浮点，提升压缩比；硬件（H100、TPU v5）原生支持这些格式。训练框架（PyTorch AMP、TensorFlow Mixed Precision、DeepSpeed）把 BF16/FP16 自动化；量化感知训练把 INT8/INT4 用于部署。序列化规范（SafeTensors、ONNX）明确格式标签避免混用。未来「可验证的混合精度误差界」与自适应格式切换，是体系结构与算法协同的研究方向。理解 BF16 与 FP32 的指数对齐、TF32 的计算截断，是跟上 AI 硬件演进的前提。

## 十、小结

BF16 用与 FP32 相同的 8 位阶码换取动态范围，以 7 位尾数换带宽与吞吐，成为深度学习训练的实用格式；TF32 则在 Tensor Core 内部截断尾数、保留 FP32 累加。正确转换、混用高精度敏感算子，并理解 $u=2^{-8}$ 量级误差，才能在速度与稳定性之间取得可验证的平衡。
