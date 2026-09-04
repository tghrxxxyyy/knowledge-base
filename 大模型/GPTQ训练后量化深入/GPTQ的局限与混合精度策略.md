# GPTQ的局限与混合精度策略

> 对应 Frantar 2022 GPTQ 与 huggingface/transformers 的混合精度量化实践。

## 一、背景与挑战

GPTQ 在极低位（2~3bit）下仍会退化，且不同层、不同张量对量化的敏感度差异巨大。统一 4bit 并非最优。

## 二、核心原理

混合精度 (mixed-precision) 为敏感层（如注意力输出投影）保留更高位宽（8bit/FP16），对冗余层用 4bit/3bit，从而在固定显存预算下最大化精度。敏感度可用量化后 perplexity 增量度量。

## 三、形式化与数学基础

设位宽分配 $ b_l $，约束 $ \\sum_l c_l(b_l)\\le B $（显存预算），目标

$ \\min_{\\{b_l\\}} \\sum_l \\Delta\\text{PPL}(b_l) $

常用贪心：按敏感度降序逐层提升位宽直至预算耗尽。

## 四、代码实现

```python
def sensitivity(W, calib_X):
    q = grouped_quant(W, bits=4)[0]
    base = ((W @ calib_X) ** 2).sum()
    err = (((W - dequant(q)) @ calib_X) ** 2).sum()
    return (err / base).item()   # 越大越敏感

# 敏感层 -> 8bit, 其余 -> 4bit
```

## 五、与其他技术对比

- 均匀 4bit 实现简单，混合精度需调度逻辑但精度更好。
- 与稀疏结合可在同预算下进一步提精度。

## 六、常见误区

- 用单层重建误差代替端到端 perplexity，灵敏度估计偏。
- 过度混合导致 kernel 碎片化、推理变慢。

## 七、与开源书/权威来源对应

- Frantar et al. 2022, GPTQ.
- huggingface/transformers: https://github.com/huggingface/transformers
- microsoft/DeepSpeed: https://github.com/microsoft/DeepSpeed

## 八、面试题

- 如何自动决定哪些层用更高位宽？
- 混合精度对推理 kernel 有何挑战？
- 3bit GPTQ 的瓶颈在哪？

## 九、演进与趋势

位宽搜索自动化（基于 Hessian 或强化学习）与硬件原生混合精度指令（如 FP8）将降低工程成本。

## 十、小结

GPTQ 在极低位受限，混合精度是兼顾显存与精度的务实策略，核心在于准确的灵敏度估计。
