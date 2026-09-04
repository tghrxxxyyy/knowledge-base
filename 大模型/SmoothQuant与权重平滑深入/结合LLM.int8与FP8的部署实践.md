# 结合LLM.int8与FP8的部署实践

> 对应 Xiao 2023 SmoothQuant、Dettmers 2022 LLM.int8 与 NVIDIA FP8 推理实践。

## 一、背景与挑战

W8A8 在多数硬件可行，但离群值仍可能溢出 INT8 范围。LLM.int8 用混合精度保护离群值，FP8 则提供更宽动态范围，二者可与 SmoothQuant 配合。

## 二、核心原理

SmoothQuant 先把难度均衡，使大部分张量适合 INT8；残余极个别离群列可用 FP8/FP16 单独处理（混合精度），兼顾吞吐与精度。

## 三、形式化与数学基础

混合精度分配：

$ b_j=\\begin{cases}8,& s_j\\text{ 均衡后范围可接受}\\\\16,& \\text{残余离群列}\\end{cases} $

整体误差 $ \\approx\\sum_j \\epsilon(b_j) $，通过 $ \\alpha $ 与离群阈值联合优化。

## 四、代码实现

```python
import torch

def mixed_quant(W, X, alpha=0.5, outlier_ratio=0.001):
    Wt, Xt, s = smooth(W, X, alpha)
    # 对仍超范围的列用 FP16, 其余 INT8 (概念)
    q = torch.where(Xt.abs().max(0).values > 127, Wt.float(), quant_i8(Wt))
    return q
```

## 五、与其他技术对比

- 纯 INT8 简单但怕离群；FP8 动态范围大但需 Hopper+ 支持。
- SmoothQuant + 混合精度兼顾二者。

## 六、常见误区

- 假设 FP8 无需平滑；离群仍会损精度。
- 全 FP8 忽视 kernel 成熟度与带宽。

## 七、与开源书/权威来源对应

- Xiao et al. 2023, SmoothQuant.
- Dettmers et al. 2022, LLM.int8 (https://github.com/TimDettmers/llm-int8)
- NVIDIA/TensorRT-LLM: https://github.com/NVIDIA/TensorRT-LLM

## 八、面试题

- 为什么 FP8 仍需 SmoothQuant？
- 混合精度如何分配通道位宽？
- LLM.int8 与 SmoothQuant 可否叠加？

## 九、演进与趋势

FP8 原生 Tensor Core 将使 W8A8 更普及，平滑成为标准预处理。

## 十、小结

SmoothQuant 配合混合精度/FP8，是 8bit 推理精度保障的成熟组合。
