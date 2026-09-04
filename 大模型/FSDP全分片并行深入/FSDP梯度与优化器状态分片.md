# FSDP梯度与优化器状态分片

> 对应 Zhao 2023 (PyTorch FSDP 论文) 与 pytorch/pytorch 优化器分片。

## 一、背景与挑战
大模型优化器状态(如 Adam 的动量、方差)可达参数量的 12 倍。仅分片参数不足以放下百亿模型，必须同时分片梯度与优化器状态，这正是 FSDP 相对 ZeRO-2 的进阶。

## 二、核心原理
反向传播得到本地梯度后，FSDP 用 reduce-scatter 将梯度在分片维度求和并分发，使每个 rank 仅获得自己 shard 对应的梯度；优化器在该分片上原地更新参数分片，无需持有全局状态。

## 三、形式化与数学基础
Adam 每参数状态为 $m,v$ 与 $W$，总量 $12\\Psi$ 字节(fp16 参数 + fp32 副本 + 2 状态)。分片后每 rank 占用：
$ M_{\\mathrm{opt}} = 12\\Psi / N + \\mathrm{act} + \\Psi/N $。
其中 $N$ 为数据并行度，显存随 $N$ 近线性下降。

## 四、代码实现
```python
from torch.distributed.fsdp import FullyShardedDataParallel as FSDP
import torch.optim as optim

model = FSDP(model, use_orig_params=True)
opt = optim.AdamW(model.parameters(), lr=1e-4)

for x, y in loader:
    opt.zero_grad(set_to_none=True)
    model(x).backward(y)
    opt.step()   # 仅更新本 rank 分片，reduce-scatter 已在 backward 内完成
```

## 五、与其他技术对比
ZeRO-3 同等分片；ZeRO-2 不分片参数故仍需整层参数驻留；DDP 三者全复制。FSDP 在显存上最优但通信量最大。

## 六、常见误区
误区一：reduce-scatter 后才 reduce——实际一次完成求和与分发。误区二：分片后各 rank 更新等价全局——是，因分片梯度之和即全局梯度。误区三：fp16 参数无需 fp32 主副本，实际 FSDP 默认维护主副本保精度。

## 七、与开源书/权威来源对应
pytorch/pytorch 的 FSDP 优化器说明；Rasley 2020 (DeepSpeed ZeRO) 给出 12Ψ 显存模型来源。

## 八、面试题
问：为何 Adam 状态是 12Ψ？答：fp16 参数 2Ψ、fp32 主副本 4Ψ、m 4Ψ、v 4Ψ。问：reduce-scatter 作用？答：求和并分发分片梯度。

## 九、演进与趋势
与 fp8 优化器状态、分片检查点结合进一步压缩，offload 将冷状态放 CPU。

## 十、小结
梯度与优化器状态分片使显存随并行度线性收缩，是超大规模训练可落地的根本。
