# FSDP自动包装策略与显存建模

> 对应 Zhao 2023 (PyTorch FSDP 论文) 与 pytorch/pytorch auto_wrap。

## 一、背景与挑战
FSDP 的 reshard 粒度由"包装单元"决定：包装太粗，单卡峰值高；太细，all-gather 次数爆炸。需按模块树自动划分分片边界。

## 二、核心原理
`auto_wrap_policy` 递归遍历模块，对参数超过 `min_num_params` 的子模块套 FSDP 包装。Transformer 中通常按 transformer block 或 attention/MLP 子层为单元，使单卡峰值约等于一个单元参数 + 临时 gather。

## 三、形式化与数学基础
设单元平均参数 $s$，层数 $L$，则峰值显存：
$ M_{\\mathrm{peak}} \\approx s + (K+1)\\Psi/N + \\sum_{l}\\mathrm{act}_l $。
包装单元越小 $s$ 越小但 gather 次数增至 $O(L)$，通信开销 $C\\propto L\\cdot (s/N)$ 次 all-gather。

## 四、代码实现
```python
from torch.distributed.fsdp import(size_based_auto_wrap_policy, FSDP)
import functools

policy = functools.partial(
    size_based_auto_wrap_policy,
    min_num_params=1e7,   # 大于千万参数的子模块独立分片
)
model = FSDP(model, auto_wrap_policy=policy, use_orig_params=True)
```

## 五、与其他技术对比
DeepSpeed 用 `module` 树与 `zero_optimization` 配置分区；FSDP 的 auto_wrap 更声明式。Megatron 不依赖自动划分而是手动层并行。

## 六、常见误区
误区一：min_num_params 越小越好，实际会显著增加通信。误区二：包装后仍可单独 load 某层权重，实际参数已扁平化需借助 state_dict 钩子。误区三：忽略 buffer(如 BN 统计量)不被分片。

## 七、与开源书/权威来源对应
pytorch/pytorch auto_wrap 文档；Zhao 2023 讨论不同 wrap 粒度对吞吐与显存的影响。

## 八、面试题
问：wrap 粒度如何影响通信？答：单元越小，all-gather 次数越多，带宽压力越大。问：为何按 block 包装？答：平衡峰值显存与通信频率。

## 九、演进与趋势
HSDP 在节点内用 NO_SHARD、节点间 FULL_SHARD，减少跨节点通信；DTensor 提供 `distribute` 统一描述。

## 十、小结
包装策略是 FSDP 调优第一杠杆，应在显存上限与通信预算间折中。
