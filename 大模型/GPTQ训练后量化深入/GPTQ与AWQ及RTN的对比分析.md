# GPTQ与AWQ及RTN的对比分析

> 对应 Frantar 2022 GPTQ、Lin 2023 AWQ 与朴素 RTN 量化方法的对比。

## 一、背景与挑战

PTQ 方法众多，工程师常困惑该选哪种。RTN 简单但低比特差，GPTQ 与 AWQ 是 4bit 的两大主流，设计哲学不同：GPTQ 改权重，AWQ 缩放权重但保留显著性。

## 二、核心原理

- RTN：逐元素舍入，零额外成本。
- GPTQ：二阶补偿逐列量化，重建误差最小。
- AWQ：仅对"重要"权重通道放大，等价于在量化前做恒等变换，不改决策边界。

## 三、形式化与数学基础

RTN：

$ \\hat w=\\text{round}(w/s)\\cdot s $

AWQ 缩放（见 AWQ 篇）令 $ \\tilde W=\\text{diag}(s)W,\\tilde X=X\\text{diag}(s)^{-1} $。

GPTQ 见前篇 $ \\min\\|WX-\\hat W X\\|_2^2 $ 的逐列补偿。

## 四、代码实现

```python
def rtn(W, bits=4):
    qmax = 2 ** bits - 1
    s = W.abs().max() / qmax
    return torch.clamp(torch.round(W / s), -qmax, qmax) * s

# gptq / awq 见各自模块, 此处仅对比 rtn 的简洁性
print("RTN 仅需一次 round, 但 4bit 下误差最大")
```

## 五、与其他技术对比

| 方法 | 精度(4bit) | 成本 | 是否需要校准 |
|------|-----------|------|-------------|
| RTN  | 低        | 极低 | 否 |
| GPTQ | 高        | 中   | 是 |
| AWQ  | 高        | 中   | 是 |

## 六、常见误区

- 认为 AWQ 比 GPTQ"更准"是绝对的；取决于模型与任务。
- 把三种方法互斥看待，实际可组合（AWQ 缩放 + GPTQ 量化）。

## 七、与开源书/权威来源对应

- Frantar et al. 2022, GPTQ.
- Lin et al. 2023, AWQ (https://github.com/mit-han-lab/llm-awq)
- pytorch/pytorch: https://github.com/pytorch/pytorch

## 八、面试题

- 什么场景下 RTN 已足够？
- GPTQ 与 AWQ 的本质区别是什么？
- 为何二者都优于单纯 RTN？

## 九、演进与趋势

社区开始出现统一量化工具（如 llama.cpp 的 k-quant、GPTQModel）吸收各家之长。

## 十、小结

RTN 适合高比特速原型，GPTQ/AWQ 是 4bit 部署首选，按硬件与精度需求取舍。
