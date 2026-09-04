# N比M结构化稀疏原理

> 对应 NVIDIA 的 2:4 稀疏 (Sparse Tensor Core) 与 microsoft/DeepSpeed 稀疏实践。

## 一、背景与挑战

非结构化稀疏难加速，但 2:4 (每 4 个元素保留 2 个) 等 N:M 模式可被 NVIDIA Ampere+ Sparse Tensor Core 原生加速，兼顾压缩与速度。

## 二、核心原理

N:M 稀疏要求每个连续 M 个元素中恰好保留 N 个非零。推理时硬件跳过零值，理论 2x 吞吐。训练中用掩码 + 正则引导权重收敛到该结构。

## 三、形式化与数学基础

对每组 $ g\\in\\mathbb Z_M $：

$ \\sum_{i\\in g} \\mathbb I(W_i\\ne 0)=N $

矩阵乘在硬件中仅对保留 N 个做乘加。

## 四、代码实现

```python
import torch

def to_nm_sparse(W, n=2, m=4):
    out = torch.zeros_like(W)
    for i in range(0, W.numel(), m):
        blk = W.flatten()[i:i+m]
        top = torch.topk(blk.abs(), n).indices
        out.flatten()[i:i+m][top] = blk[top]
    return out

# 训练时用 Straight-Through 保持可微, 见 QAT 文档
```

## 五、与其他技术对比

- 比随机非结构化稀疏可加速，但比通道结构化约束更细。
- 与 INT8 量化可叠加获得双加速。

## 六、常见误区

- 以为任意稀疏都能 2x；必须严格 N:M 且硬件支持。
- 训练不引导结构，推理时强行 2:4 损坏精度。

## 七、与开源书/权威来源对应

- NVIDIA/TensorRT-LLM: https://github.com/NVIDIA/TensorRT-LLM
- microsoft/DeepSpeed: https://github.com/microsoft/DeepSpeed
- pytorch/pytorch: https://github.com/pytorch/pytorch

## 八、面试题

- 2:4 稀疏为何能被硬件加速？
- 如何训练出符合 N:M 的权重？
- N:M 与量化如何叠加？

## 九、演进与趋势

更灵活的 N:M 配置 (1:2, 4:8) 与稀疏-量化联合编译是方向。

## 十、小结

N:M 稀疏以硬件友好结构实现可加速压缩，是 GPU 上稀疏推理的实用形态。
