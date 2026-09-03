# GPTQ 量化算法

> 对应 Frantar et al., *GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers*, 2022。

## 一、背景与挑战

逐层量化忽略层间误差累积；GPTQ 把二阶信息（Hessian）引入，单层内逐列量化并补偿其余列误差。

## 二、核心原理

对每层权重按列顺序量化，每量化一列后用逆 Hessian 把量化误差补偿到未量化列；大幅降 INT4 重建误差。

## 三、数学形式

补偿：$\Delta w_j = -\frac{w_q^{(i)}-w^{(i)}}{[H^{-1}]_{ii}}H^{-1}_{:,i}$；其中 $H\approx X^TX$ 为激活二阶矩。

## 四、代码实现

```python
from auto_gptq import AutoGPTQForCausalLM
model = AutoGPTQForCausalLM.from_quantized("model-gptq-4bit", device="cuda:0")
```

## 五、与其他对比

- 比朴素逐层量化更准，因考虑了列间相关性。
- 与 AWQ 路线不同：GPTQ 用误差补偿，AWQ 保重要权重。

## 六、常见误区

- 误以为 GPTQ 需训练；实为一次性校准推断。
- 校准集过小/领域不符致分布偏移。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 问：GPTQ 补偿项含义？答：用逆 Hessian 把当前列量化误差按相关性分摊到后续列，抑制累积。

## 九、演进

OBQ → GPTQ → GPTQ+整合（ExLlama 推理）。

## 十、小结

GPTQ 借二阶补偿实现 4bit 高精度量化，是 INT4 部署主流方案。
