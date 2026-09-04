# GPTQ在LLaMA系列上的实践部署

> 对应 Frantar 2022 GPTQ 与 ggerganov/llama.cpp、huggingface/transformers 的 LLaMA 量化示例。

## 一、背景与挑战

LLaMA / LLaMA-2 系列参数量大，原版 FP16 权重显存占用高。GPTQ 让 7B~70B 模型以 4bit 运行在消费级显卡，是社区部署的主流路径。

## 二、核心原理

实践中先用校准集（如 C4、WikiText）前向收集激活估算 Hessian，再对每一线性层做 GPTQ 量化。推理侧借助 exllama / llama.cpp 的 4bit 反量化 kernel 还原计算。

## 三、形式化与数学基础

校准损失等价于最小化各层重建误差之和：

$ \\mathcal L_{\\text{calib}}=\\sum_l \\|W_l X_l-\\hat W_l X_l\\|_2^2 $

其中 $ X_l $ 为第 l 层输入激活。

## 四、代码实现

```python
# 伪代码: 使用 auto-gptq 风格 API
from auto_gptq import AutoGPTQForCausalLM

model = AutoGPTQForCausalLM.from_pretrained("meta-llama/Llama-2-7b", quantize_config)
model.quantize(calib_dataloader)   # 校准并量化
model.save_quantized("llama2-7b-4bit-gptq")
```

实际 `AutoGPTQForCausalLM` 与 `auto-gptq` 库提供该能力。

## 五、与其他技术对比

- 相比 AWQ：GPTQ 在 4bit 下常更省显存，AWQ 在部分任务更稳。
- 相比 GGUF：GGUF 偏向 llama.cpp 生态的 k-quant，跨框架兼容性不同。

## 六、常见误区

- 用与训练域差异巨大的校准集导致精度掉点。
- 忽略 padding / tokenizer 对校准样本的影响。
- 在 70B 上盲目 3bit，出现系统性退化。

## 七、与开源书/权威来源对应

- Touvron et al. 2023, LLaMA (https://github.com/facebookresearch/llama)
- ggerganov/llama.cpp: https://github.com/ggerganov/llama.cpp
- Frantar et al. 2022, GPTQ.

## 八、面试题

- 部署 7B 模型到 8G 显存，你选 GPTQ 还是 GGUF？为什么？
- 校准集应如何选取？
- 4bit GPTQ 推理的反量化在哪一步发生？

## 九、演进与趋势

GPTQ 与 vLLM、TensorRT-LLM 的融合持续推进；混合位宽（注意力 8bit、FFN 4bit）成为新默认。

## 十、小结

GPTQ 是 LLaMA 系列 4bit 部署的成熟方案，工程生态完善，但校准集与位宽选择决定最终效果。
