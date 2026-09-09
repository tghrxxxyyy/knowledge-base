# NF4 与 QLoRA 量化

> 对应 Dettmers et al.(2023, QLoRA) 与 Hugging Face bitsandbytes/PEFT 文档。

## 一、背景与挑战

在单张消费级显卡上微调大模型长期受显存所限：70B 模型全参数微调需数百 GB。QLoRA 的关键创新是用 **NF4（NormalFloat4）** 把基座压缩到 4-bit，再在其上训练 LoRA 适配器，使 65B 模型也能在单张 48GB 卡上微调。NF4 解决了「均匀 4-bit 不适合正态权重」的问题——大模型权重近似标准正态，均匀划分会浪费区间。挑战是低比特基座的数值误差如何不破坏 LoRA 训练稳定性，以及反向传播时梯度如何有效回流到冻结的量化权重上。

## 二、核心原理

- **NF4**：一种针对**正态分布**最优的 4-bit 数据类型。它在 $[-1,1]$ 上按分位数等距划分 16 个值，使每个量化区间包含**等概率质量**——即落在每个区间的权重数量相等。相比均匀 INT4（区间等宽），NF4 把更多量化级别分配给高频的中等权重，贴合实际分布，量化误差更小。
- **QLoRA 流程**：NF4 量化冻结基座 + 反向传播时以「量化误差补偿（double quantization + 分页优化器）」保持梯度有效 + 仅训练 LoRA。双重量化（double quantization）进一步把量化常数本身再量化，省下常量显存。分页优化器（Paged Optimizers）用 NVMe 暂存峰值显存，避免 OOM。

### 工程落地要点

- **单卡微调首选**：48GB 卡上用 QLoRA 微调 65B 已成标准范式，显存主要来自 LoRA 优化器状态与激活。
- **compute dtype 选 bf16**：NF4 权重反量化到 bf16 计算，稳定性优于 fp16。
- **双重量化必开**：大模型上能省可观常量显存，是单卡可行性的关键开关。
- **LoRA 配置**：常用 r=64、alpha=16、target 含 q/v/k/o 投影，覆盖注意力主通路。
- **评估对照**：微调后对比同精度全参结果，确认 LoRA 容量未成为瓶颈。
- **推理部署**：QLoRA 训练完可合并或保留适配器，量化基座直接用于推理省显存。

## 三、形式化与数学基础

NF4 的分位点由标准正态分布分位数决定：第 $k$ 个量化值

$$
q_k = \Phi^{-1}\!\left(\frac{k}{2^b}\right),\qquad k=1,\dots,2^b
$$

其中 $\Phi^{-1}$ 为标准正态逆 CDF，$b=4$。量化/反量化：

$$
\hat w = q_k,\quad k = \arg\min_j |w - q_j|
$$

双重量化把 scale 张量 $s$ 再做一次量化：$\hat s = \text{quant}(s)$，节省约 $0.37$ bit/param 的常量开销。QLoRA 前向近似为：

$$
h = \text{dequant}_{\text{NF4}}(W_q)\cdot x + \Delta W\,x,\qquad \Delta W = BA^\top
$$

仅 $B,A$ 可训，基座冻结且以 NF4 存储。

## 四、代码实现

用 bitsandbytes + PEFT 做 QLoRA（参数以官方为准）：

```python
from transformers import BitsAndBytesConfig, AutoModelForCausalLM
from peft import LoraConfig, get_peft_model

bnb = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",            # 关键：NF4
    bnb_4bit_use_double_quant=True,       # 双重量化
    bnb_4bit_compute_dtype="bfloat16",
)
model = AutoModelForCausalLM.from_pretrained("base-65B", quantization_config=bnb)
lora = LoraConfig(r=64, lora_alpha=16, target_modules=["q_proj","v_proj"])
model = get_peft_model(model, lora)       # 仅 LoRA 可训
```

## 五、与其他技术对比

| 方案 | 基座精度 | 可微调 | 单卡 65B |
|------|----------|--------|----------|
| 全参数 FP16 | 16-bit | 是 | 否（显存不足） |
| LoRA FP16 | 16-bit | 适配器 | 勉强 |
| QLoRA(NF4) | 4-bit | 适配器 | 是（48GB） |
| GPTQ 4-bit | 4-bit | 需额外 | 推理友好 |

## 六、常见误区

- **NF4 适合所有数据**：它假设权重近似标准正态，对非正态激活未必最优。
- **QLoRA 训练=全精度效果**：LoRA 容量有限，极难任务仍弱于全参。
- **双重量化可有可无**：在大模型上它能省可观常量显存，影响单卡可行性。
- **4-bit 基座不能训练**：QLoRA 通过 dequant+梯度近似实现，但仅适配器更新。
- **r 越大越好**：过大 r 增加显存且易过拟合，需按数据量调节。

## 七、与开源书·权威来源对应

- Dettmers et al., *QLoRA: Efficient Finetuning of Quantized LLMs*, 2023。
- Hugging Face PEFT / bitsandbytes 文档；与本系列「量化基础」「GPTQ与AWQ」互补。

## 八、面试题

1. NF4 相比 INT4 为何更适合大模型权重？它做了什么假设？
2. 双重量化（double quantization）省的是什么显存？
3. QLoRA 为何能单卡微调 65B？精度损失来自哪里？
4. 分页优化器（Paged Optimizers）解决了什么问题？

## 九、演进与趋势

QLoRA 之后出现「QA-LoRA」「QLoRA+ 更优优化器」「把 NF4 扩展到 2-3 bit」等改进；社区也把 NF4 基座与 DoRA、RSLoRA 等更稳适配器结合。趋势是「低位基座 + 高效适配器 + 分页显存管理」成为单卡微调事实标准，并向端侧微调延伸，让消费级硬件也能参与大模型定制。

## 十、小结

NF4 是针对正态权重分布最优的 4-bit 类型，按分位数等概率划分，比均匀 INT4 更贴合大模型权重。QLoRA 用 NF4 量化冻结基座 + 双重量化 + 分页优化器 + LoRA 训练，使单卡微调 65B 成为现实。其成本极低，但 LoRA 容量上限决定了极难任务仍不及全参数微调，应按任务权衡。
