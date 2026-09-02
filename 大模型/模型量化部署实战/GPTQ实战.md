# GPTQ 实战

> 见「推理优化/GPTQ与AWQ」。

## 一、背景与挑战

GPTQ 是二阶信息驱动的训练后量化（PTQ）方法，将权重压到 4-bit 且精度损失小。

## 二、核心原理

按列顺序量化，利用逆 Hession 近似补偿量化误差到未量化列，逐层补偿累积误差。

## 三、数学形式

量化列更新：

```
Δw = (Q(c) - c) · (H^{-1}_c · c) / (H^{-1}_c · c · c + ε)
```

其中 H 为 Hessian 近似。

## 四、代码实现

```python
from transformers import AutoModelForCausalLM, GPTQConfig
m = AutoModelForCausalLM.from_pretrained("model", quantization_config=GPTQConfig(bits=4, dataset="c4"))
```

## 五、关键要点

- 需校准集（如 C4 小样本）估计 Hessian。
- 4-bit 下 7B 模型仅 ~4GB。

## 六、与其他对比

- GPTQ 精度好、需校准；AWQ 更关注保护重要权重、对校准更鲁棒。

## 七、常见误区

- 校准集太小导致分布偏移、精度崩塌。

## 八、与开源书对应

- Frantar et al., *GPTQ*, 2022.
- llm-course: https://github.com/mlabonne/llm-course

## 九、面试题

- GPTQ 为何用二阶信息？

## 十、演进

GPTQ → GPTQ-Mixed（混合比特） → 与稀疏结合。

## 十一、小结

GPTQ 是 4-bit 服务端部署的事实标准之一。
