# 张量并行 Megatron

> 对应 Shoeybi et al. 2019（Megatron-LM: Efficient Large-Scale Language Model Training）。

## 一、背景与挑战

当单卡放不下一个 Transformer 层（权重+激活+优化器状态超限），需要把「层内」的矩阵运算切分到多卡，这就是**张量并行（Tensor Parallelism, TP）**。它与数据并行（切样本）、流水线并行（切层）正交。Megatron-LM 由 Shoeybi 等人提出，给出了对 MLP 与 Attention 的精妙切分方案，使每卡只持有局部权重与局部激活，再用集合通信合并结果。挑战在于：切分方式必须让通信量最小、且数学等价于单机计算。

## 二、核心原理

以线性层 $Y = XA$ 为例，两种切法：

- **列并行（column parallel）**：把权重按列切 $A=[A_1,A_2]$，则 $Y=[XA_1,\ XA_2]$，各卡算一列，天然无通信（输入 $X$ 已复制）。
- **行并行（row parallel）**：把输入按列切、权重按行切 $A=[A_1;A_2]^\top$，得 $Y=X_1A_1+X_2A_2$，需一次 **all-reduce** 求和。

Megatron 对 Transformer 块的组合：① 对 `QKV` 投影用列并行（三个投影并行算）；② 对 `attention output`（即 `Y = XA` 把输出拼回）用行并行，紧跟一个 all-reduce；③ MLP 的 first linear 列并行、second linear 行并行。这样每层只在「行并行输入处」发生一次 all-reduce，通信集中在层内、带宽要求高（需 NVLink）。

Megatron 切分的精妙处在于「让通信只发生在必须之处」。以 Attention 块为例：QKV 投影用列并行，三个投影在各卡并行计算、互不通信；而把列并行的输出拼回完整隐藏态、再做输出投影（行并行）时，需要一次 all-reduce 把各卡的部分和相加。关键在于这个 all-reduce 紧跟在列并行之后、且每个 Transformer 块只发生一次，于是通信被「压缩」在层内一个固定点，而非散布于每个算子。

这种编排还带来一个工程启示：列并行与行并行应「配对出现」，中间夹一个无需通信的逐元素操作（如 GeLU、dropout、LayerNorm 的部分）。因为逐元素操作在每卡本地即可完成（各卡持有各自的局部 tensor），不引入通信；只有跨卡拼接的维度才需 all-reduce。于是整个 Transformer 块的通信量被最小化，且可通过把多个 all-reduce 与反向计算 overlap（通信计算重叠）进一步隐藏延迟。

TP 的扩展度受限于单层结构：列并行的度数不能超过输出维（如 attention 的 head 数、MLP 的中间维），否则无法均匀切分。因此单靠 TP 通常只能切到 8 卡左右，更大规模需与 PP、DP 组成 3D 并行，把「层内切（TP）+ 层间切（PP）+ 样本切（DP）」三者正交组合，才能既放得下模型又扛得住吞吐。

## 三、形式化与数学基础

列并行：给定 $A=[A_1\ A_2]$，$X\in\mathbb{R}^{s\times d}$：

$$Y = XA = [X A_1,\ X A_2] = [Y_1,\ Y_2],\quad Y_i = X A_i$$

行并行：给定 $X=[X_1\ X_2]$，$A=[A_1;A_2]$（$A_1,A_2$ 为行块），输出：

$$Y = X_1 A_1 + X_2 A_2 = \text{all-reduce}\big(\{X_i A_i\}_{i}\big)$$

MLP 组合（GeLU 在列并行后、行并行前）保证等价性：

$$H = \text{GeLU}(X A_1^{\text{(fc1)}})\ \|\ \text{GeLU}(X A_2^{\text{(fc1)}}),\quad Y = H\,A^{\text{(fc2)}}$$

整体计算图与单卡逐元素等价，仅插入 all-reduce 同步。

## 四、代码实现

Megatron-LM / 现代框架（如 `torch.distributed.tensor`、Colossal-AI）中，行/列并行是现成层：

```python
# 概念示意（非原始 API）
# 列并行 Linear：weight 按输出维切
qkv = ColumnParallelLinear(d, 3*d)(x)        # 各卡算一部分
attn_out = RowParallelLinear(3*d, d)(qkv)    # 内部 all-reduce
# 下一层输入已同步
```

## 五、与其他技术对比

| 并行 | 切分对象 | 通信 | 硬件要求 |
|------|---------|------|---------|
| 数据并行 DP | 样本 | 梯度 all-reduce | 中 |
| 张量并行 TP | 层内权重 | 层内 all-reduce | 高（NVLink） |
| 流水线并行 PP | 层 | 激活传输 | 低 |

## 六、常见误区

- 把 TP 与 DP 混用却忽略通信拓扑，导致跨节点 TP 带宽不足变瓶颈。
- 以为 TP 能无限扩展：TP 度受单层矩阵列数限制（如 attention head 数）。
- 忽视 TP 需在节点内高带宽互联（NVLink），跨节点 TP 极慢。
- 未与 PP/DP 组成 3D 并行，单靠 TP 扩展度有限。

## 七、与开源书·权威来源对应

- Shoeybi et al., 2019, *Megatron-LM: Training Multi-Billion Parameter Language Models Using Model Parallelism*。
- Megatron-LM 仓库：https://github.com/NVIDIA/Megatron-LM
- 以官方最新文档为准。

## 八、面试题

- 列并行与行并行的输出如何合并？为何行并行需要 all-reduce？
- Megatron 对 Attention 的 QKV/输出投影如何切分？
- 张量并行为何对通信带宽要求高？

## 九、演进与趋势

Megatron 的 TP 思想被集成进 Megatron-Core、DeepSpeed、FSDP、以及 `torch.distributed.tensor`（DTensor）等。后续与序列并行（sequence parallelism）结合，进一步切分 LayerNorm/dropout 的激活，缓解 TP 下的激活显存。

## 十、小结

张量并行把单层矩阵运算切到多卡：列并行免通信、行并行用 all-reduce，Megatron 据此精巧编排 Transformer 块，使每卡只算局部、数学等价。它适合节点内高带宽扩展，常与 DP/PP 组成 3D 并行。
