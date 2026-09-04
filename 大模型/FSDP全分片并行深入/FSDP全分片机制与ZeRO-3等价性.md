# FSDP全分片机制与ZeRO-3等价性

> 对应 Zhao 2023 (PyTorch FSDP 论文) 与 pytorch/pytorch 官方实现。

## 一、背景与挑战
数据并行(DDP)在每个 rank 复制完整模型参数、梯度与优化器状态，显存占用为 $O(\\Psi)$，其中 $\\Psi$ 为参数量。当模型超过单卡显存时，DDP 无法直接训练。ZeRO-3 通过分片参数打破这一限制，FSDP (Fully Sharded Data Parallel) 是 PyTorch 原生对 ZeRO-3 的实现。

## 二、核心原理
FSDP 将每个模块的参数、梯度、优化器状态沿数据并行维度切分为 $N$ 个 shard，每个 rank 仅常驻 $1/N$。前向/反向时通过 all-gather 临时拼回完整参数，计算后立即释放；反向时各 rank 本地聚合梯度，再 reduce-scatter 得到分片梯度用于优化器更新。

## 三、形式化与数学基础
令完整参数 $W\\in\\mathbb R^{\\Psi}$，rank $r$ 持有分片 $W^{(r)}=W[r\\cdot\\Psi/N:(r+1)\\cdot\\Psi/N]$。前向重构：
$ \\hat W = \\mathrm{all\\text{-}gather}(\\{W^{(r)}\\}_{r=1}^{N}) $，
反向结束后分片梯度 $g^{(r)}=\\mathrm{reduce\\text{-}scatter}(g)$ 满足 $\\sum_r g^{(r)}=g$。单卡峰值显存约为 $(K+1)\\Psi/N + \\mathrm{act}$，其中 $K$ 为优化器状态倍率。

## 四、代码实现
```python
import torch
from torch.distributed.fsdp import FullyShardedDataParallel as FSDP
from torch.distributed.fsdp import CPUOffload

# 将子模块包装为分片单元
model = FSDP(
    transformer_block,
    cpu_offload=CPUOffload(offload_params=False),
    use_orig_params=True,   # 保留原始 param 以兼容优化器
)
# 前向时自动 all-gather，反向后自动 reshard
out = model(x)
out.backward()
```

## 五、与其他技术对比
与 DDP 相比，FSDP 显存更省但通信更频繁(每层一次 all-gather)；与 ZeRO-2 相比多了参数分片；与张量并行相比通信语义更简单但单卡仍需临时容纳整层参数。FSDP 适合跨节点大模型，张量并行适合节点内高带宽。

## 六、常见误区
误区一是认为 FSDP 完全消除显存峰值——all-gather 瞬时仍需整层参数。误区二是所有参数都按层分片最优——embedding 等大而稀疏层分片收益低。误区三是 `use_orig_params=False` 下仍能拿到同名参数做精细优化，实际参数已被扁平化。

## 七、与开源书/权威来源对应
pytorch/pytorch 的 `torch.distributed.fsdp` 文档与 Zhao 2023 论文给出设计细节；rasbt/LLMs-from-scratch 讲解单卡训练，可作为显存模型对照。

## 八、面试题
问：FSDP 与 ZeRO-3 的关系？答：FSDP 是 ZeRO-3 思想的 PyTorch 原生实现，分片对象一致(参数/梯度/优化器状态)。问：all-gather 时机？答：每层前向前 gather、用后 reshard。

## 九、演进与趋势
FSDP 已并入 DTensor 与 `torch.distributed._composable` 体系，向统一分片抽象演进；HSDP(混合分片)在节点内复制、节点间分片以平衡通信。

## 十、小结
FSDP 以分片 + 临时重构换取近乎线性的显存扩展，是训练百亿级以上模型的基础设施，代价是更密集的集合通信。
