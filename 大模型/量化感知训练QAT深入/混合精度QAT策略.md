# 混合精度QAT策略

> 对应 pytorch/pytorch 的混合精度量化与 NVIDIA/TensorRT-LLM 的逐层位宽配置。

## 一、背景与挑战

统一低比特浪费表达能力。混合精度 QAT 在训练中为不同层/张量分配不同位宽，敏感部分保留高位，整体在显存预算内最优。

## 二、核心原理

把位宽 $ b_l $ 作为（可微或搜索的）超参，训练中每层独立伪量化；可用灵敏度（量化后任务损失增量）指导位宽分配，约束总 bit 预算。

## 三、形式化与数学基础

约束优化：

$ \\min_{\\{b_l\\}}\\sum_l \\Delta\\mathcal L(b_l)\\quad \\text{s.t.}\\ \\sum_l c(b_l)\\le B $

$ c(b_l) $ 为层 l 的 bit 体积。常用基于 Hessian 的灵敏度近似。

## 四、代码实现

```python
import torch

def mixed_qat(model, bits_map):
    # bits_map: {layer_name: bit_width}
    for name, m in model.named_modules():
        if isinstance(m, torch.nn.Linear) and name in bits_map:
            m.weight = torch.nn.Parameter(fake_quant(m.weight, bits_map[name]))
    return model
# 训练后按 bits_map 导出真实混合精度模型
```

## 五、与其他技术对比

- 比均匀 QAT 精度高，但部署需支持混合精度 kernel。
- 与混合精度 PTQ (GPTQ 篇) 思路一致，只是 QAT 可学习。

## 六、常见误区

- 位宽组合过碎，推理 kernel 不支持。
- 训练中频繁切换位宽导致不稳定。

## 七、与开源书/权威来源对应

- pytorch/pytorch: https://github.com/pytorch/pytorch
- NVIDIA/TensorRT-LLM: https://github.com/NVIDIA/TensorRT-LLM
- huggingface/transformers: https://github.com/huggingface/transformers

## 八、面试题

- 如何决定每层位宽？
- 混合精度 QAT 对部署的要求？
- 与混合精度 PTQ 区别？

## 九、演进与趋势

自动位宽搜索 (NAS 式) 与硬件原生混合精度指令降低部署成本。

## 十、小结

混合精度 QAT 在训练中优化位宽分配，兼顾精度与体积，但依赖硬件支持。
