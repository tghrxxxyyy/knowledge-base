# PEFT 参数高效微调综述

> 对应 llm-course「Model Fine-tuning / PEFT」与 Hugging Face PEFT 库。

## 一、核心概念

PEFT(Parameter-Efficient Fine-Tuning) 冻结主干、仅训练少量参数，显存与存储大幅降低，且多任务可共享底座。主流方法：

| 方法 | 训练什么 | 参数量级 |
|------|----------|----------|
| Adapter | 插入小 MLP | ~1-3% |
| LoRA | 低秩增量 | ~0.1-1% |
| Prefix/Prompt | 软提示/前缀 | <1% |
| (IA)³ | 激活缩放向量 | 极小 |

## 二、关键要点

- **多任务部署**：一个底座 + 多个 LoRA 适配器，按需切换。
- **显存**：LoRA 训练可省去大部分梯度/优化器状态。

## 三、代码实现

```python
from peft import LoraConfig, get_peft_model
cfg = LoraConfig(r=8, lora_alpha=16, target_modules=["q_proj","v_proj"], lora_dropout=0.05)
model = get_peft_model(base_model, cfg)
model.print_trainable_parameters()   # 仅约 0.x% 可训练
```

## 四、与开源书的对应

- llm-course「PEFT」：https://github.com/mlabonne/llm-course
- Hugging Face PEFT: https://github.com/huggingface/peft

## 七、面试题

- PEFT 相比全参数微调的核心优势？列举三种 PEFT 方法。
