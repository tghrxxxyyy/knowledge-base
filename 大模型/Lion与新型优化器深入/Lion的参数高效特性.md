# Lion的参数高效特性

> 对应 Chen et al. 2023《Lion》(arXiv:2302.06675) 与 Microsoft DeepSpeed ZeRO 文档、mlabonne/llm-course。

## 一、背景与挑战

当模型参数量进入百亿、千亿，优化器状态（如 Adam 的 $m$、$v$）的显存可达参数本身的 2 倍（以 FP16 参数 + FP32 状态计）。这意味着训练一个 7B 模型，仅优化器状态就可能占用数十 GB 显存，成为扩展的直接瓶颈。降低状态成本，等价于释放可训练规模。

Lion 的参数高效性正体现在这里：它把每参数状态从两份降到一份。

## 二、核心原理

Lion 每个参数只保留一个与参数**同形状**的动量缓冲区 $m$，不保存二阶矩 $v$。在混合精度训练中，这份动量可用与原参数相同或更低的精度存储（如 FP32 或 BF16），状态显存从 $2P\cdot\text{prec}$ 降为 $1P\cdot\text{prec}$。当配合 ZeRO/FSDP 把状态切分到多卡时，省下的绝对量随模型规模线性放大，收益显著。

注意：省的是**显存与可扩展性**，不是每步计算量——Lion 每步的矩阵运算与 AdamW 相近，主要价值在「能训更大 / 更大 batch」。

## 三、形式化与数学基础（含 LaTeX）

显存状态占用对比（FP32 状态、参数精度无关）：

$$
\mathrm{State}_{AdamW}=2\cdot P\cdot 4\ \text{Bytes},\qquad
\mathrm{State}_{Lion}=1\cdot P\cdot 4\ \text{Bytes}
$$

对 $P=7\text{B}$、FP32 状态，AdamW 约 $28\text{GB}$ 状态，Lion 约 $14\text{GB}$，**省约 14GB**。若动量改用 BF16，Lion 可进一步降到约 $7\text{GB}$。在总显存 $M$ 固定时，可训练参数量

$$
P \approx \frac{M - \text{activation}}{\text{param\_bytes}+\text{state\_bytes}}
$$

状态项减半直接放大 $P$。

## 四、代码实现（围栏配平）

```python
import torch

# 状态张量数量对比：AdamW 两份，Lion 一份
adamw_state = {
    "exp_avg": torch.zeros_like(p),       # 一阶矩
    "exp_avg_sq": torch.zeros_like(p),    # 二阶矩（Lion 没有）
}
lion_state = {
    "momentum": torch.zeros_like(p),       # 仅一份动量
}
# 在 ZeRO 切分下，lion_state 的通信与存储压力均减半
```

## 五、与其他技术对比

- 与 **AdamW** 相比：AdamW 需一阶+二阶两份状态，Lion 仅一份，显存省一半。
- 与 **Adafactor** 相比：Adafactor 用因式分解近似二阶矩也减状态，但实现复杂；Lion 直接去掉二阶矩，更简洁。
- 与 **SGD** 相比：SGD 状态最少（近乎零），但大模型难调，Lion 是状态与效果的折中。

## 六、常见误区

- 「省状态就能直接更快」——Lion 每步计算量相近，主要收益在显存与可扩展性，而非单步加速。
- 「所有规模都该用」——小模型上显存不是瓶颈时，Lion 优势不明显，还可能不如 AdamW 稳。
- 「动量精度随便降」——过低精度动量可能引入数值抖动，需验证收敛。

## 七、与开源书·权威来源对应

- Chen et al. 2023 报告 Lion 在 ImageNet、语言模型上以更少状态达到同等或更优效果。
- Microsoft DeepSpeed / ZeRO 文档说明状态切分如何放大「省状态」收益。
- mlabonne/llm-course 把 Lion 列为低状态优化器的代表。

## 八、面试题

- 问：7B 模型用 Lion 省多少优化器显存？答：省一份 FP32 动量，约 14GB（若动量降精度还可更少）。
- 问：省状态为何重要？答：它直接决定同硬件下可训的最大模型与最大 batch。
- 问：Lion 真比 AdamW 快吗？答：单步未必，胜在可扩展性与显存上限。

## 九、演进与趋势

与 **8-bit 状态、FSDP/ZeRO 切分**结合，进一步释放大模型训练显存；低精度动量与符号更新的天然适配，使 Lion 在 FP8 训练栈中更具吸引力。

### 关键要点速查

- Lion 每参数仅一份动量，状态从 2P 降到 1P，显存省一半。
- 7B 模型 FP32 状态：AdamW 约 28GB，Lion 约 14GB，动量降精度可更少。
- 省的是显存上限与可扩展性，不是单步算力，每步计算量相近。
- 与 Adafactor 比：Lion 直接去二阶矩更简洁，Adafactor 用因式分解近似。
- 与 SGD 比：SGD 状态近零但大模型难调，Lion 是状态与效果的折中。
- 在 ZeRO/FSDP 切分下，省下的状态绝对值随规模线性放大。
- 动量精度不可随意降，过低可能引入数值抖动影响收敛。
- 与 8-bit 状态、低精度训练栈天然契合，是大规模训练的现实选项。

- FSDP 下 Lion 的通信量也因状态减半而下降。
- 对 embedding 等大参数层，状态节省最显著。
- 量化训练时，低精度动量需注意溢出与舍入。
- 优化器状态 checkpoint 变小，利于频繁快照。

## 十、小结

Lion 的参数高效性（一份动量、无二阶矩）使其在资源受限的大规模训练中具有现实价值：省下的是显存上限，换来的是更大的模型与 batch 空间。
