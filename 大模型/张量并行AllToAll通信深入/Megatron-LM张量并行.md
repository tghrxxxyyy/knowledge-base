# Megatron-LM张量并行

> 对应 Shoeybi 2019 (Megatron-LM 论文) 与 NVIDIA Megatron 实践。

## 一、背景与挑战
在单节点高带宽(NVLink)内，沿隐藏维切分矩阵比流水线和数据并行通信更少、延迟更低。Megatron 提出系统的行/列并行方案。

## 二、核心原理
将每个线性层按行或列切分，使 GEMM 在单卡局部完成；注意力按头切分(列并行)，MLP 用 列->行 配对。层归一化与 dropout 在切分前/后保持完整输入。

## 三、形式化与数学基础
MLP：$h = \\mathrm{GeLU}(X A_1)$(列)，$Y = h A_2$(行)，$A_1\\in\\mathbb R^{h\\times 4h}$ 列切、$A_2\\in\\mathbb R^{4h\\times h}$ 行切。整体：
$ Y = (\\mathrm{GeLU}(X A_1)) A_2 $，
切分后各卡算局部块，注意力输出需一次 all-reduce 求和。

## 四、代码实现
```python
import torch
import torch.distributed as dist
# 列并行第一层
h = torch.nn.functional.gelu(x @ A1_col)   # 每卡列分片
# 行并行第二层
y_local = h @ A2_row                        # 每卡部分输出
y = torch.empty_like(y_local)
dist.all_reduce(y_local, op=dist.ReduceOp.SUM)  # 行并行需求和
```

## 五、与其他技术对比
TP 通信在节点内低延迟；与 PP 正交(纵向)、与 DP/ZERO 正交(横向)。TP 度受单卡显存与头数约束。

## 六、常见误区
误区一：TP 无 all-reduce——行并行输出需跨卡求和。误区二：TP 度可任意——受注意力头数整除约束。误区三：TP 跨节点高效，实际跨节点带宽低应优先 PP/ZeRO。

## 七、与开源书/权威来源对应
Shoeybi 2019 Megatron-LM；Ainslie 2023 GQA 影响头并行度。

## 八、面试题
问：Megatron 如何切 MLP？答：列并行第一层+行并行第二层，仅末层 all-reduce。问：TP 适合场景？答：节点内高带宽。

## 九、演进与趋势
序列并行、上下文并行扩展切分维；与 MoE 专家并行融合。

## 十、小结
Megatron 张量并行以行/列配对最小化通信，是节点内扩展的核心技术。
