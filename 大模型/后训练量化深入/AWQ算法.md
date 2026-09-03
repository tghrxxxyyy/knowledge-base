# AWQ 激活感知权重量化

> 对应 Lin et al., *AWQ: Activation-aware Weight Quantization*, 2023。

## 一、背景与挑战

并非所有权重同等重要；少量“显著权重”主导性能，均匀量化会伤它们。

## 二、核心原理

AWQ 发现重要性与激活大小相关：按激活幅度选约 1% 重要权重不被量化（或加缩放），其余均匀量化，避免重要通道崩。

## 三、数学形式

缩放：$w'_i = w_i \cdot s_i,\ s_i=\begin{cases}\alpha>1 & \text{重要}\\1 & \text{其他}\end{cases}$，仅调比例不改值。

## 四、代码实现

```python
from awq import AutoAWQForCausalLM
model = AutoAWQForCausalLM.from_quantized("model-awq", quant_config={"w_bit":4,"q_group_size":128})
```

## 五、与其他对比

- 与 GPTQ 互补：AWQ 不调权重值只调比例，更稳定且不依赖大校准。
- 与 混合精度深入 思路一致（重要权重保精度）。

## 六、常见误区

- 误以为 AWQ 也补偿误差；它只保重要权重比例。
- group_size 过大失细粒度保护。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 问：AWQ 为何保护 1% 权重？答：激活大的通道对应显著权重，量化它们误差放大，保其比例即保性能。

## 九、演进

均匀量化 → 混合精度 → AWQ 比例保护 → 硬件友好。

## 十、小结

AWQ 以激活感知保护关键权重，4bit 下稳健且部署友好。
