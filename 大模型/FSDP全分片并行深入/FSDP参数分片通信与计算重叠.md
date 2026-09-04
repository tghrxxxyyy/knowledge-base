# FSDP参数分片通信与计算重叠

> 对应 Zhao 2023 (PyTorch FSDP 论文) 与 pytorch/pytorch 通信原语。

## 一、背景与挑战
FSDP 每层前向需 all-gather 完整参数，反向需 reduce-scatter 梯度。若通信串行执行，GPU 计算空转，吞吐严重下降。核心优化是让通信与相邻层计算重叠。

## 二、核心原理
FSDP 沿模块顺序调度：当前层做计算时，预取下一层分片参数；反向时本层梯度 reduce-scatter 与上层梯度计算重叠。通过 `forward_prefetch` 与反向调度实现流水线式重叠，使通信隐藏于计算之后。

## 三、形式化与数学基础
设第 $l$ 层计算耗时 $t^{c}_{l}$，all-gather 通信 $t^{g}_{l}$。理想重叠下墙钟近似：
$ T \\approx \\sum_l t^{c}_{l} + \\max_{l} t^{g}_{l} $ 而非 $ \\sum_l (t^{c}_{l}+t^{g}_{l}) $。
重叠效率 $\\eta = 1 - T_{\\mathrm{serial}}/T_{\\mathrm{overlap}}$。

## 四、代码实现
```python
from torch.distributed.fsdp import ShardingStrategy
from torch.distributed.fsdp import BackwardPrefetch

model = FSDP(
    block,
    sharding_strategy=ShardingStrategy.FULL_SHARD,
    backward_prefetch=BackwardPrefetch.BACKWARD_PRE,  # 反向预取
    forward_prefetch=True,                            # 前向预取重叠
)
# 预取使下一层参数早于本层结束前就位
```

## 五、与其他技术对比
与 Megatron 的通信计算重叠相比，FSDP 重叠粒度在层、依赖自动 hook；DeepSpeed 亦用类似 prefetch。TP 的 all-reduce 重叠在 GEMM 内部，粒度更细。

## 六、常见误区
误区一：开启 prefetch 必然提速——过小模型时预取开销反而增加显存峰值。误区二：重叠能消除全部通信——首层 all-gather 与末层 reduce-scatter 仍暴露在关键路径。误区三：prefetch 深度越大越好，实际受显存限制。

## 七、与开源书/权威来源对应
pytorch/pytorch FSDP 文档描述 `forward_prefetch`/`backward_prefetch`；Zhao 2023 量化了重叠收益。

## 八、面试题
问：FSDP 如何隐藏通信？答：前向预取下一层参数、反向预取使 reduce-scatter 与上层计算并行。问：哪些通信无法隐藏？答：临界路径首尾通信。

## 九、演进与趋势
向异步 all-gather 与基于 DTensor 的调度器发展，支持更细粒度 overlap 与通信内核融合。

## 十、小结
通信计算重叠是 FSDP 实用化的关键，prefetch 配置需按层大小与带宽共同调优。
