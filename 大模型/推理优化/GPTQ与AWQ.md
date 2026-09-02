# GPTQ 与 AWQ 权重量化

> 对应 Frantar et al.(GPTQ, 2022) 与 Lin et al.(AWQ, 2023)。4-bit 权重量化的两大主流。

## 一、核心概念

- **GPTQ**：逐层、逐列量化，利用剩余未量化权重的 Hessian 信息做误差补偿，近似二阶最优。一次标定即可把 175B 量化到 4-bit。
- **AWQ(Activation-aware Weight Quantization)**：观察到「少量权重通道对激活贡献大」，对重要通道不做量化(或缩放保护)，用激活幅度指导保护，简单高效、硬件友好。

## 二、关键要点

| 方法 | 核心 |
|------|------|
| GPTQ | 二阶补偿、逐列 |
| AWQ | 保护重要通道 |

## 三、代码实现

```python
from transformers import AutoModelForCausalLM, BitsAndBytesConfig
# AWQ 常见用 autoawq 库
from awq import AutoAWQForCausalLM
model = AutoAWQForCausalLM.from_quantized("model-awq-4bit")
```

## 四、与开源书的对应

- GPTQ: Frantar et al., *GPTQ: Accurate Post-Training Quantization*, 2022.
- AWQ: Lin et al., *AWQ: Activation-aware Weight Quantization*, 2023.
- llm-course「Quantization」。

## 七、面试题

- AWQ 为何只保护「重要通道」而不是所有权重都量化？
- GPTQ 与 AWQ 在工程实现复杂度上的差异？
