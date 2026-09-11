# Megatron-LM张量并行

> 对应 Shoeybi 2019 Megatron-LM（arXiv:1909.08053）与 NVIDIA Megatron 工程实践。

## 一、背景与挑战

在单节点内，GPU 之间通过 NVLink 互联，带宽远高于跨节点网络。张量并行（Tensor Parallelism, TP）正是为这种高带宽场景设计的：把单层的权重矩阵切到多张卡上，让 GEMM 在卡内局部完成，仅用少量集合通信保证数学等价。相比流水线并行，TP 的通信更频繁但单次更小、延迟更低，因而适合放在带宽最高的域内。

难点在于：如何切分才能让通信次数最少、且不破坏 LayerNorm 等需要完整输入算子的正确性。Megatron 的答案是「行切 + 列切配对」。

## 二、核心原理

Megatron 对每个线性层采用两种切分之一：

- **列并行（Column Parallel）**：权重按列分块，输入完整复制，各卡算部分输出，输出天然沿列切分；
- **行并行（Row Parallel）**：权重按行分块，输入沿列切分，各卡算部分和，最后 all-reduce 求和。

MLP 采用「列并行第一层 + 行并行第二层」的配对：

$$ h = \mathrm{GeLU}(X A_1), \qquad Y = h A_2 $$

第一层列切使 $h$ 按列分片，恰好作为第二层行切所需的输入布局，于是两个 GEMM 之间**无需通信**，只在第二层输出处做一次 all-reduce。注意力部分按头切分（本质是列并行），输出投影为行并行。这样每个 Transformer 层的额外通信被压缩到少数几次集合通信。

## 三、形式化与数学基础

MLP 权重形状：$A_1 \in \mathbb{R}^{h \times 4h}$（列切），$A_2 \in \mathbb{R}^{4h \times h}$（行切）。整体：

$$ Y = \left(\mathrm{GeLU}(X A_1)\right) A_2 $$

按 $p$ 张卡切分，每卡持 $A_1^{(i)} \in \mathbb{R}^{h \times 4h/p}$、$A_2^{(i)} \in \mathbb{R}^{4h/p \times h}$，则

$$ Y_i = \mathrm{GeLU}(X A_1^{(i)})\, A_2^{(i)}, \qquad Y = \sum_{i=1}^{p} Y_i \quad (\text{all-reduce}) $$

由求和的线性性，分片计算后求和严格等于未切分结果。注意 $h$ 与 $4h$ 需被并行度 $p$ 整除，注意力头数也需被 $p$ 整除（头并行约束）。

## 四、代码实现

```python
import torch
import torch.distributed as dist

class ColumnParallelLinear(torch.nn.Module):
    def __init__(self, in_features, out_features, world):
        super().__init__()
        self.world = world
        self.weight = torch.nn.Parameter(
            torch.empty(out_features // world, in_features)
        )

    def forward(self, x):        # x 完整复制到本卡
        return torch.nn.functional.linear(x, self.weight)

class RowParallelLinear(torch.nn.Module):
    def __init__(self, in_features, out_features, world):
        super().__init__()
        self.world = world
        self.weight = torch.nn.Parameter(
            torch.empty(out_features, in_features // world)
        )

    def forward(self, x):        # x 已按列切分
        y = torch.nn.functional.linear(x, self.weight)
        if self.world > 1:
            dist.all_reduce(y, op=dist.ReduceOp.SUM)   # 行并行需求和
        return y

# MLP：Column -> GeLU -> Row，仅在 Row 输出处 all-reduce
```

反向传播中 all-reduce 会自动求导，框架会插入对应的通信以取得梯度。

## 五、与其他技术对比

| 并行方式 | 切分对象 | 通信原语 | 通信频率 | 适用域 |
| --- | --- | --- | --- | --- |
| 张量并行 TP | 层内权重 | all-reduce | 每层多次 | 节点内 NVLink |
| 流水线并行 PP | 层 | 点对点激活 | 每 microbatch | 跨节点 |
| 数据并行 DP | batch | 梯度 all-reduce | 每步 | 跨节点 |
| ZeRO | 优化器/梯度/参数 | all-gather/reduce-scatter | 每步 | 跨节点友好 |

TP 与 PP 正交（纵向切层）、与 DP/ZeRO 正交（横向切 batch），三者可组合成多维并行。

## 六、常见误区

- 认为 TP 无 all-reduce：行并行的部分输出必须跨卡求和，否则结果错误。
- 认为 TP 度可任意设置：受注意力头数与隐藏维整除约束。
- 认为 TP 跨节点也高效：节点间带宽低，逐层通信会成瓶颈，应优先 PP/ZeRO。
- 忘记列并行输入需完整复制：这会带来少量激活冗余，是设计取舍而非 bug。
- 混淆头并行与序列并行：前者切头维，后者切序列维，通信模式不同。

## 七、与开源书·权威来源对应

Shoeybi 2019 Megatron-LM 给出了行/列配对切分与通信分析；NVIDIA Megatron 工程实践提供了可运行的实现与配置建议；Ainslie 2023 GQA 表明 KV 头数会影响可用的头并行度。具体实现以官方最新文档为准。

## 八、面试题

- 问：Megatron 如何切 MLP？答：列并行第一层 + 行并行第二层，仅末层一次 all-reduce。
- 问：TP 适合什么场景？答：节点内高带宽互联，通信延迟敏感。
- 问：列并行与行并行如何衔接？答：列并行输出按列分片，正好是行并行所需的输入布局。
- 问：TP 的整除约束有哪些？答：隐藏维、中间维、注意力头数都需被并行度整除。

## 九、演进与趋势

序列并行、上下文并行把切分维扩展到序列方向；与专家并行（MoE）融合以支持更大模型；通信压缩与计算-通信重叠持续降低 TP 开销。具体方案以官方最新文档为准。

## 十、小结

Megatron 张量并行以「列切 + 行切配对」把每层通信压到最少次数，是节点内扩展的核心技术。记住两个约束：整除性（头数/隐藏维）与部署域（必须高带宽）。
