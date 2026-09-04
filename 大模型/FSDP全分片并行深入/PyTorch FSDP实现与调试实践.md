# PyTorch FSDP实现与调试实践

> 对应 pytorch/pytorch 官方 FSDP 教程 与 Zhao 2023 工程经验。

## 一、背景与挑战
FSDP 易因 wrap 顺序、device 放置、state_dict 处理出错。工程落地需掌握初始化、检查点与常见报错定位。

## 二、核心原理
FSDP 要求先用 `init_process_group` 初始化进程组，再构造分片模型；`summon_full_params` 上下文临时拼回完整参数用于推理或保存；`state_dict` 提供分片/完整两种格式。

## 三、形式化与数学基础
保存分片检查点省带宽：
$ \\mathrm{ckpt\\_size} = \\Psi/N_{\\mathrm{dp}} $，
加载时各 rank 仅读自身分片，再由 DDP/FSDP 重组，避免单点聚合瓶颈。

## 四、代码实现
```python
import torch
import torch.distributed as dist
from torch.distributed.fsdp import FullyShardedDataParallel as FSDP

dist.init_process_group("nccl")
model = FSDP(build_model(), use_orig_params=True)
with FSDP.summon_full_params(model):   # 临时完整参数
    torch.save(model.state_dict(), f"full_{dist.get_rank()}.pt")
```

## 五、与其他技术对比
DeepSpeed 用 `zero_to_fp32.py` 重组检查点；FSDP 用 `summon_full_params` 更内聚。DDP 直接 `state_dict` 即可。

## 六、常见误区
误区一：未 `init_process_group` 就建 FSDP，会报 device 错。误区二：在 FSDP 外直接 `model.parameters()` 拿到空或扁平参数。误区三：误用 `summon_full_params` 常驻导致显存爆。

## 七、与开源书/权威来源对应
pytorch/pytorch FSDP 入门教程；huggingface/transformers 的 `FSDP` 集成示例可参照。

## 八、面试题
问：如何保存可迁移检查点？答：`summon_full_params` 取完整 state_dict 或保存分片供重组。问：device 放置原则？答：参数随 rank 在本卡。

## 九、演进与趋势
`torch.distributed.checkpoint` 分片保存成为标准，与 DTensor 融合。

## 十、小结
FSDP 调试核心是进程组、wrap 顺序与 state_dict 三类约定，掌握后即可稳定扩展至千卡。
