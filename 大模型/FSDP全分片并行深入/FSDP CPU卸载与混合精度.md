# FSDP CPU卸载与混合精度

> 对应 Zhao 2023 (PyTorch FSDP 论文) 与 pytorch/pytorch CPUOffload。

## 一、背景与挑战
即便分片，超大模型优化器状态仍可能超 GPU 显存。FSDP 提供 `CPUOffload` 将分片参数/梯度卸载至主机内存，以 PCIe 带宽换显存。

## 二、核心原理
开启 offload 后，参数分片常驻 CPU，前向前 host-to-device 拷贝并在 GPU 计算，反向后梯度拷贝回 CPU 由 CPU 优化器更新。混合精度下参数以 fp16 计算、fp32 主副本留 CPU。

## 三、形式化与数学基础
显存峰值降至：
$ M_{\\mathrm{gpu}} \\approx \\Psi/N_{\\mathrm{gpu}} + \\mathrm{act} $，
代价是每步额外 $2\\Psi/N$ 的 host-device 传输，墙钟增加约 $2\\Psi/(N\\cdot B_{\\mathrm{pcie}})$。

## 四、代码实现
```python
from torch.distributed.fsdp import FullyShardedDataParallel as FSDP, CPUOffload
from torch.distributed.fsdp import MixedPrecision
import torch

mp = MixedPrecision(param_dtype=torch.float16, reduce_dtype=torch.float16)
model = FSDP(
    model,
    cpu_offload=CPUOffload(offload_params=True),
    mixed_precision=mp,
    use_orig_params=True,
)
```

## 五、与其他技术对比
DeepSpeed ZeRO-Offload 同为 CPU 卸载但集成 optimizer 融合内核；FSDP CPUOffload 依赖 CPU Adam 实现。TP 不卸载但通信少。

## 六、常见误区
误区一：offload 总能救显存——PCIe 瓶颈使吞吐骤降。误区二：混合精度即无损，实际某些层须 fp32(如 layernorm 增益)。误区三：offload 与 NO_SHARD 等价，实际前者跨 PCIe 后者占 GPU。

## 七、与开源书/权威来源对应
pytorch/pytorch MixedPrecision/CPUOffload 文档；Rasley 2020 与 Ren 2021 ZeRO-Offload 给出卸载理论。

## 八、面试题
问：offload 牺牲什么换显存？答：PCIe 带宽与 CPU 算力，吞吐下降。问：混合精度 reduce 用何类型？答：通常 fp16 以减少通信。

## 九、演进与趋势
NVMe offload、fp8 主副本、与异步拷贝内核进一步隐藏传输。

## 十、小结
CPU 卸载是显存枯竭时的兜底手段，应在不得已时启用并配合混合精度。
