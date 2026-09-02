# QLoRA：量化 + LoRA 微调

> 对应 Dettmers et al., *QLoRA*, 2023 与 llm-course「QLoRA」。

## 一、核心概念

QLoRA 在 LoRA 基础上把**基座量化为 4-bit** 后冻结，仅训练 LoRA 适配器，使 65B 模型可在单张 48GB GPU 上微调。

关键技术：
- **NF4(NormalFloat4)**：针对正态分布权重量身定制的 4-bit 数据类型，比 FP4/INT4 更优。
- **双重量化(Double Quantization)**：对量化常数再量化，省显存。
- **分页优化器(Paged Optimizers)**：用 CPU RAM 分页防显存峰值溢出。

## 二、数学形式

量化把权重 `W` 映射到 4-bit 网格并存储缩放/零点常量 `c`：

```
W_dequant = dequant(quantize(W; NF4), c)
h = W_dequant · x + B A x
```

## 三、代码实现

```python
from transformers import BitsAndBytesConfig
bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                         bnb_4bit_compute_dtype="bfloat16")
model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-2-13b", quantization_config=bnb)
# 再叠加 LoRA（见 LoRA 文档）
```

## 四、关键要点

| 技术 | 作用 |
|------|------|
| NF4 | 更优 4-bit 表示 |
| 双重量化 | 省常量显存 |
| 分页优化器 | 防 OOM |

## 五、常见误区

- 误以为 4-bit 基座精度损失不影响下游——QLoRA 通过 LoRA 救回大部分能力，但极端任务仍略逊全精度 LoRA。
- 量化 dtype 与计算 dtype 不一致导致数值问题。

## 六、与开源书的对应

- Dettmers et al., *QLoRA: Efficient Finetuning of Quantized LLMs*, 2023 (arXiv:2305.14314).
- llm-course「QLoRA」：https://github.com/mlabonne/llm-course

## 七、面试题

- NF4 相比 INT4 为什么更适合大模型权重？
- QLoRA 如何在单卡微调 65B 模型？
