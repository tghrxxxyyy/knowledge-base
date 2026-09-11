# 注意力头AllToAll并行

> 对应 Shoeybi 2019 Megatron 与 Vaswani 2017 Attention Is All You Need 的多头注意力切分。

## 一、背景与挑战

多头注意力（MHA）天然具备一个可切分的维度：头维。设有 $H$ 个头，便可把它们分到多张卡上并行计算，每卡只做 $H/p$ 个头的 Q/K/V 投影与注意力。但两个环节会引入通信：

1. 计算完各头后，输出投影 $W_O$ 需要**所有头拼接**后才能做，若每卡只持部分头，就需要重排；
2. 自注意力内部的 $QK^\top$ 需要**完整序列**，若序列也被切分（序列并行/上下文并行），则需在序列维交换数据。

这两类重排都由 all-to-all 完成。理解「切头」与「切序列」两种并行如何叠放、通信发生在哪一步，是分析注意力并行的核心。

## 二、核心原理

注意力的标准形式：

$$ \mathrm{head}_j = \mathrm{Attn}(Q_j, K_j, V_j), \qquad \mathrm{out} = \mathrm{Concat}(\mathrm{head}_1, \dots, \mathrm{head}_H)\, W_O $$

两种切分方案：

- **头并行（head parallel）**：把 $W_Q, W_K, W_V$ 按头维列切，每卡算自己的头。这与 MLP 的列并行同构——因为 $W_Q$ 的输出维正好对应头维。融合时，$W_O$ 按行切（行并行），各卡用自己的头输出乘对应行分片，最后 all-reduce 得到完整输出。因此**纯头并行不一定需要 all-to-all**，all-reduce 即可。
- **序列并行 / 上下文并行**：把序列维切分，每卡只算一段序列的 Q。但注意力中每个 query 需要访问**全部** K/V，故需用 all-to-all 在卡间交换 K/V（或交换 Q）以补齐信息。这是 all-to-all 真正出现的地方。

所以严谨的说法是：注意力的张量并行主线用 all-reduce，序列/上下文并行才引入 all-to-all。

## 三、形式化与数学基础

缩放点积注意力：

$$ \mathrm{Attn}(Q,K,V) = \mathrm{softmax}\!\left(\frac{QK^\top}{\sqrt{d_k}} + M\right) V $$

头并行切分：设并行度 $p$，每卡持 $H/p$ 个头：

$$ Q_i = X W_Q^{(i)}, \qquad \mathrm{head}_i = \mathrm{Attn}(Q_i, K_i, V_i), \qquad Q = \mathrm{Concat}(Q_1, \dots, Q_p) $$

要求 $H \bmod p = 0$。序列并行下，序列被分为 $p$ 块，第 $r$ 卡的 query 块 $Q^{(r)}$ 需要全部 K/V：

$$ \text{all-to-all}: \quad \left[\,S/p,\; \{K,V\} \text{ of all blocks}\,\right] \longleftrightarrow \left[\,S,\; \{K,V\}/p\,\right] $$

通信量为 $O(b \cdot S \cdot h)$，属带宽受限。因果掩码让通信可不对称（只需因果范围内的 K/V）。

## 四、代码实现

```python
import torch
import torch.distributed as dist

def head_parallel_attention(x, wq, wk, wv, wo, world, rank):
    # 头并行：每卡持 H/world 个头（wq/wk/wv 已按头维列切）
    q = x @ wq          # [B, S, H/world * d]
    k = x @ wk
    v = x @ wv

    out_local = torch.nn.functional.scaled_dot_product_attention(q, k, v)

    # 输出投影按行切（行并行），各自乘对应行分片后 all-reduce
    y_local = out_local @ wo
    if world > 1:
        dist.all_reduce(y_local, op=dist.ReduceOp.SUM)
    return y_local

def context_parallel_swap(kv_local, world, group):
    # 上下文并行：序列维切分下，用 all-to-all 交换 K/V 块
    chunks = list(kv_local.chunk(world, dim=1))       # 按序列块切
    recv = [torch.empty_like(chunks[0]) for _ in range(world)]
    dist.all_to_all(recv, chunks, group=group)
    return torch.cat(recv, dim=1)
```

实现中 all-to-all 前后形状需一致，且因果注意力可只交换必要区间以省带宽。

## 五、与其他技术对比

| 方案 | 切分维 | 融合时通信 | 是否需 all-to-all | 备注 |
| --- | --- | --- | --- | --- |
| 注意力头并行 | 头维 | all-reduce | 否 | 与 TP 输出投影同构 |
| 序列并行（SP） | 序列维 | all-to-all | 是 | 主要省激活 |
| 上下文并行（CP） | 序列维（注意力） | all-to-all/环形 | 是 | 面向长上下文 |
| KV 头并行（GQA/MQA） | KV 头维 | 视实现 | 视实现 | 减少 KV 体积 |

## 六、常见误区

- 认为头并行一定无通信：融合时仍需 all-reduce（或 all-to-all 重排）。
- 认为头数可任意切：$H$ 必须被并行度整除。
- 把序列并行与头并行混为一谈：二者切分维度不同，通信原语也不同。
- 忽略因果掩码带来的通信优化空间：可以只交换必要的 K/V 区间。
- 认为 GQA/MQA 与头并行冲突：KV 头数减少会限制可用的 KV 并行度，需一并规划。

## 七、与开源书·权威来源对应

Shoeybi 2019 Megatron 给出注意力的头并行与输出投影行并行方案；Vaswani 2017 定义多头注意力的拼接与投影；Korthikanti 2022 说明序列并行使用 all-to-all。具体实现以官方最新文档为准。

## 八、面试题

- 问：注意力如何做张量并行？答：按头列切 Q/K/V，输出投影行并行并 all-reduce。
- 问：all-to-all 在注意力中的用途？答：序列/上下文并行下的序列维与头维重排。
- 问：头并行的整除约束？答：注意力头数需被并行度整除。
- 问：序列并行与头并行的区别？答：前者切序列维、主要省激活；后者切头维、随 TP 一起切参数。

## 九、演进与趋势

上下文并行沿序列维 all-to-all 以支持超长上下文；与 FlashAttention 的 IO 感知内核融合降低显存；与 GQA/MQA 结合时需重新平衡 KV 头与并行度。具体实现以官方最新文档为准。

## 十、小结

注意力并行在头与序列两个维度展开：头并行随 TP 用 all-reduce 融合，序列/上下文并行用 all-to-all 重排 K/V。它是 TP 中最通信密集的部位，规划时必须同时满足头数整除与带宽预算。
