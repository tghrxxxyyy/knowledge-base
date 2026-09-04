# AWQ激活显著性保护的核心思想

> 对应 Lin 2023 AWQ (arXiv:2306.00978, MIT Han Lab) 与 huggingface/peft 的 LoRA 适配思路对照。

## 一、背景与挑战

权重各通道对模型输出的重要性并不均等。研究发现：对应"大激活"的权重通道更关键，若被同等量化会严重损伤精度。AWQ 提出只保护这些显著通道，而非全部。

## 二、核心原理

AWQ 不重新训练或改权重数值，而是做恒等变换：对显著通道乘以缩放因子 $ s>1 $，再相应缩小激活，使该通道的量化难度降低。由于 $ \\text{diag}(s)W\\cdot (X\\text{diag}(s)^{-1}) $ 数值不变，前向等价。

## 三、形式化与数学基础

令 $ \\alpha $ 为激活显著性指数，通道缩放由激活幅度决定：

$ s_j=\\left(\\frac{1}{n}\\sum_i |x_{ij}|^{\\alpha}\\right)^{1/\\alpha},\\quad \\tilde W=\\text{diag}(s)W,\\quad \\tilde X=X\\text{diag}(s)^{-1} $

前向输出保持不变 $ \\tilde W\\tilde X=WX $。

## 四、代码实现

```python
import torch

def awq_scale(W, X, alpha=0.5):
    # X: 校准激活 [n, in]; 按通道聚合幅度
    mag = (X.abs() ** alpha).mean(dim=0) ** (1.0 / alpha)
    s = mag / mag.max()           # 归一化到 [0,1]
    s = s.clamp(min=1e-4)
    Wt = W * s                    # 放大显著通道
    Xt = X / s                    # 反向缩小激活
    return Wt, Xt, s
```

## 五、与其他技术对比

- 与 GPTQ：AWQ 不改权重值，仅缩放；GPTQ 做二阶补偿重建。
- 与 SmoothQuant：都做权重-激活均衡，但 AWQ 面向权重量化、保护显著通道。

## 六、常见误区

- 认为 AWQ 改变了模型表达；实际是数值等价变换。
- 误将权重幅度当作重要性，AWQ 依据的是激活幅度。
- alpha 随便取，未做网格搜索导致次优。

## 七、与开源书/权威来源对应

- Lin et al. 2023, AWQ: Activation-aware Weight Quantization.
- huggingface/peft: https://github.com/huggingface/peft
- ggerganov/llama.cpp: https://github.com/ggerganov/llama.cpp

## 八、面试题

- 为什么按激活而非权重幅度选重要通道？
- AWQ 的恒等变换如何保证前向不变？
- AWQ 与 SmoothQuant 区别？

## 九、演进与趋势

AWQ 已融入 llama.cpp (AWQ 导入)、vLLM、TensorRT-LLM，并衍生 TinyChat 等端侧推理栈。

## 十、小结

AWQ 用低成本激活感知缩放保护关键权重，是 4bit 部署中精度稳定、实现简单的代表方法。
