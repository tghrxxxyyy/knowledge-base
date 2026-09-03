# QLoRA与量化

> 对应 Dettmers et al., *QLoRA*, 2023。

## 一、背景与挑战

即便 LoRA，大模型底座占显存巨大；QLoRA 把底座量化到 4-bit 进一步降本。

## 二、核心原理

- 4-bit NormalFloat（NF4）：对正态分布最优量化。
- 双重量化（double quantization）：量化量化常数本身省显存。
- LoRA 仍用 16-bit 训练，梯度/优化器状态省。

## 三、数学形式

显存从 16-bit 全参微调的 $18\text{GB}$+ 降到 4-bit 底座 + LoRA 的约 $5\text{GB}$（7B 级）。

## 四、代码实现

```python
from transformers import BitsAndBytesConfig
bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4")
model = AutoModel.from_pretrained(name, quantization_config=bnb)
model = get_peft_model(model, LoraConfig(...))
```

## 五、与其他对比

- QLoRA 质量接近 16-bit LoRA，显存降数倍。
- 与 模型量化部署实战 衔接（推理侧量化）。

## 六、常见误区

- 以为 4-bit 底座无损；极端低比特有精度损失，需评估。
- 混合精度配置不当致溢出/不稳。

## 七、与开源书对应

- llm-course QLoRA：https://github.com/mlabonne/llm-course

## 八、面试题

- QLoRA 三项核心技术？答：NF4、双重量化、分页优化器。

## 九、演进

LoRA(16-bit) → QLoRA(4-bit) → 更低位/混合位宽。

## 十、小结

QLoRA 把 PEFT 显存门槛再降数倍，使单卡微调大模型成为现实。
