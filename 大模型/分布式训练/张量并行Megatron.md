# 张量并行 Megatron

> 对应 Megatron-LM(Shoeybi et al., 2020)。

## 一、核心概念

张量并行把单层矩阵运算切到多卡。以 `Y = XA` 为例，按列切 `A=[A1,A2]` 则 `Y=[XA1, XA2]`(列并行)或按行切输入(行并行)。Megatron 对 MLP/Attention 做精心切分，使每卡只需局部矩阵乘，再用 all-reduce 合并。

## 二、关键要点

- 注意力的 QKV 投影可列并行，输出投影行并行。
- 通信在层内，需高带宽(NVLink)。

## 三、面试题

- 列并行与行并行的输出如何合并？
