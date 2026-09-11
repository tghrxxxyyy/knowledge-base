# 序列并行与AllToAll

> 对应 Korthikanti 2022《Reducing Activation Recomputation in Large Transformer Models》与 Shoeybi 2019 Megatron-LM。

## 一、背景与挑战

张量并行（TP）沿隐藏维切分权重，让每张卡只算部分 GEMM。但 Transformer 中有一类算子**必须看到完整的隐藏维输入才能正确计算**，典型是 LayerNorm、Dropout、以及注意力的 softmax 归一化。在朴素 TP 下，这些算子的输入会被复制到每张卡，激活内存并未随并行度真正下降。

序列并行（Sequence Parallelism, SP）的思路是：在这些「逐 token 独立」的算子上，把**序列维**切分到各卡，从而让激活内存随并行度线性下降；只在需要跨序列信息的算子处用 all-to-all 收集。

## 二、核心原理

TP 与 SP 的配合可以概括为**沿两条正交的维切分**：

- TP 切隐藏维：权重被分片，输入需完整或在分片后对齐；
- SP 切序列维：LayerNorm/Dropout 等逐 token 算子在局部序列块上计算，激活只存 $S/n$。

关键的结构对应关系：

1. 列并行层的输入：沿序列维切分（每卡持自己的序列块）；
2. 行并行层的输出：沿序列维切分（各卡得到完整隐藏维但部分序列）；
3. 在行并行（all-reduce）与列并行（读取完整序列）之间插入 all-to-all，把数据在「序列切分」与「隐藏维完整」两种布局间转换。

这样，all-reduce 的通信量被 all-to-all 分摊，同时消除了激活复制。Korthikanti 2022 的贡献正是把这套变换形式化并给出与选择性重计算的组合。

## 三、形式化与数学基础

设序列长度 $S$、隐藏维 $h$、序列并行度 $n$。逐 token 算子的激活从

$$ O(S \cdot h) \quad \text{降为} \quad O\!\left(\frac{S}{n} \cdot h\right) $$

布局转换由 all-to-all 完成。设输入按序列切分为 $n$ 块，每块形状 $\frac{S}{n} \times h$，all-to-all 后每卡得到 $S \times \frac{h}{n}$ 的切片（或反向）：

$$ \underbrace{\left[\frac{S}{n},\, h\right]}_{n \text{ 块}} \xrightarrow{\text{all-to-all}} \left[S,\, \frac{h}{n}\right] $$

每次转换的通信量为 $O(S \cdot h)$（每卡发送与接收同量），且是**带宽受限**而非延迟受限的集合通信。张量并行 MLP 的计算形式：

$$ h_{mid} = \mathrm{GeLU}(X A_1), \qquad Y = h_{mid} A_2 $$

其中 $A_1$ 列切、$A_2$ 行切，SP 负责在其前后对齐序列维布局。

## 四、代码实现

```python
import torch
import torch.distributed as dist

def sequence_parallel_layernorm(x, weight, bias, sp_group):
    # x: [B, S, H]，已按序列维切分到各 rank
    rank = dist.get_rank(sp_group)
    world = dist.get_world_size(sp_group)

    # 局部序列块上做 LayerNorm（逐 token 独立，无需跨卡）
    x_local = x.chunk(world, dim=1)[rank]
    normed = torch.nn.functional.layer_norm(
        x_local, (x_local.size(-1),), weight, bias
    )

    # 进入注意力前 all-to-all：序列切分 -> 隐藏维切分
    chunks = list(normed.chunk(world, dim=2))
    recv = [torch.empty_like(chunks[0]) for _ in range(world)]
    dist.all_to_all(recv, chunks, group=sp_group)
    return torch.cat(recv, dim=2)

# all-to-all 需通信域内张量形状一致，配合 TP 的 all-reduce 使用
```

实现要点是保证 all-to-all 前后各卡的张量形状一致，并在反向中对称地再做一次。

## 五、与其他技术对比

| 技术 | 切分维度 | 主要收益 | 主要通信 | 是否省参数量 |
| --- | --- | --- | --- | --- |
| 数据并行 DP | batch | 吞吐扩展 | 梯度 all-reduce | 否 |
| 张量并行 TP | 隐藏维 | 单层内存与算力 | all-reduce | 是 |
| 序列并行 SP | 序列维 | 激活内存 | all-to-all | 否 |
| 流水线并行 PP | 层 | 模型纵深扩展 | 激活点对点 | 是 |
| 上下文并行 CP | 序列（注意力） | 长上下文 | all-to-all/环形 | 否 |

## 六、常见误区

- 认为 SP 省参数量：它只切激活，参数仍由 TP 切分。
- 认为不需要 all-to-all：跨序列的注意力与布局转换必须通信。
- 把 SP 与上下文并行混为一谈：上下文并行专门切注意力的序列维，SP 更侧重逐 token 算子的激活。
- 认为 SP 可替代重计算：二者正交，常组合使用。
- 忽略反向通信：all-to-all 在反向需再做一次，通信量翻倍计入。

## 七、与开源书·权威来源对应

Korthikanti 2022 系统提出序列并行并与选择性激活重计算结合；Shoeybi 2019 Megatron-LM 分析了 TP 下的激活复制问题。具体实现与 API 以官方最新文档为准。

## 八、面试题

- 问：序列并行切什么？答：序列长度维，主要目的是省激活内存。
- 问：为何需要 all-to-all？答：在「序列切分」与「隐藏维切分」两种布局间转换。
- 问：SP 与 TP 的关系？答：正交但互补，常组合为「张量+序列并行」。
- 问：SP 的通信量与什么成正比？答：与 $S \cdot h$ 成正比，属带宽受限通信。

## 九、演进与趋势

序列并行与 FP8 激活、选择性重计算、上下文并行结合，成为长上下文训练的标配；与 FlashAttention 融合进一步降低激活峰值。具体方案以官方最新文档为准。

## 十、小结

序列并行沿序列维扩展，把逐 token 算子的激活从 $O(Sh)$ 降到 $O(Sh/n)$，与 TP 互补。代价是布局转换所需的 all-to-all，属带宽受限通信，适合节点内高带宽场景。
