# QLoRA：量化 + LoRA 微调

> 对应 Dettmers et al., *QLoRA*, 2023 与 llm-course「QLoRA」。

## 一、背景与挑战

LoRA 虽把可训练参数降到极低，但基座模型仍以 FP16/BF16 驻留显存：一个 65B 模型权重约 130GB，远超单卡容量。QLoRA 的核心贡献是：把基座**量化到 4-bit** 后冻结，仅训练 LoRA 适配器，使 65B 模型可在单张 48GB GPU 上完成微调，且精度接近 16-bit 全精度微调。它把「参数高效」与「显存高效」结合到极致。

## 二、核心原理

QLoRA 在 LoRA 基础上叠加三项关键技术：

- **NF4（NormalFloat 4-bit）**：针对「权重近似标准正态分布」定制的 4-bit 数据类型。相比均匀量化的 INT4/FP4，NF4 在非均匀分位数上放置量化点，更匹配权重分布，信息损失更小。
- **双重量化（Double Quantization）**：对量化所用的缩放常数（quantization constants）再做一次量化，进一步节省显存，尤其在大 `block_size` 下收益明显。
- **分页优化器（Paged Optimizers）**：利用 NVIDIA 统一内存，在显存峰值（如长序列）时把优化器状态分页到 CPU RAM，避免 OOM 崩溃。

## 三、形式化与数学基础

量化把权重 $W$ 映射到 4-bit 网格并存储每块的缩放/零点常量 $c$。前向时用反量化近似：

$$
W_{\text{dequant}} = \text{dequant}\big(\text{quantize}(W; \text{NF4}),\, c\big)
$$

QLoRA 的线性层输出为：

$$
h = W_{\text{dequant}}\, x + B A\, x
$$

其中 $B A$ 为 LoRA 增量（以较高精度如 BF16 计算）。双重量化可写为对常量 $c$ 再量化：$\hat c = \text{quantize}(c;\, c_2)$，存储时只保留 $\hat c$ 与二级常量 $c_2$。

## 四、代码实现

```python
from transformers import BitsAndBytesConfig, AutoModelForCausalLM

bnb = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype="bfloat16",
    bnb_4bit_use_double_quant=True,
)
model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-2-13b", quantization_config=bnb
)
# 再叠加 LoRA（见 LoRA 文档），仅 LoRA 参数可训练
```

```python
# 训练后用 keep_optimizations 合并：QLoRA 权重需先反量化再合并
merged = model.merge_and_unload()
```

## 五、与其他技术对比

| 方法 | 基座精度 | 单卡可微调规模 | 额外技术 |
|------|----------|----------------|----------|
| 全参数 FT | FP16 | 数十亿 | 无 |
| LoRA | FP16 | 十亿级（受基座显存限） | 低秩 |
| QLoRA | 4-bit(NF4) | 650 亿（48GB 卡） | NF4+双重量化+分页 |
| GPTQ/AWQ 微调 | 4-bit | 类似 | 训练后量化 |

## 六、常见误区

- 误以为 4-bit 基座精度损失不影响下游：QLoRA 借 LoRA 救回大部分能力，但极端推理/数学任务仍略逊全精度 LoRA。
- 量化 dtype 与计算 dtype 不一致：如 NF4 权重用 FP16 计算易出数值问题，应设 `bnb_4bit_compute_dtype="bfloat16"`。
- 认为 QLoRA 训练后权重可直接当普通 4-bit 模型部署而不反量化合并：需先 `merge_and_unload` 或保留适配器。
- 忽视分页优化器对 CPU 内存的占用峰值。

## 七、与开源书·权威来源对应

- Dettmers et al., *QLoRA: Efficient Finetuning of Quantized LLMs*, 2023（arXiv:2305.14314）。
- llm-course「QLoRA」：https://github.com/mlabonne/llm-course
- Hugging Face bitsandbytes 集成文档。

## 八、面试题

- NF4 相比 INT4 为什么更适合大模型权重？
- QLoRA 如何在单卡微调 65B 模型？三件套各自解决什么？
- 双重量化节省的是哪部分显存？
- QLoRA 与训练后量化（GPTQ/AWQ）的区别？

## 九、演进与趋势

QLoRA 之后出现更激进的 2/3-bit 量化（如 IQ2/3 系列）、与 LoRA+ / DoRA 的组合、以及把量化感知训练融入微调。硬件侧亦有 FP8 训练路径与之竞争。以官方最新文档为准。

**实践要点：**

- 4-bit 基座 + LoRA 时，LoRA 目标模块建议覆盖注意力 q/v 投影，必要时加 k/o 提升容量。
- 训练后若需部署为纯 4-bit 模型，应先 `merge_and_unload` 再量化保存，避免运行时重复反量化。
- 长序列易触发显存峰值，分页优化器依赖统一内存，需保证主机内存充足。
- 监控反量化误差：极端情况下可对关键层保留 8-bit 或 16-bit 以保精度。

## 十、小结

QLoRA 用 NF4 量化、双重量化与分页优化器把大模型基座压进单卡，再用 LoRA 微调，是「消费级/单卡炼大模型」的实用方案；代价是需谨慎处理量化与合并细节。
