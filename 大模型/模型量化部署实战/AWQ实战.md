# AWQ 实战

> 见「推理优化/GPTQ与AWQ」。

## 一、背景与挑战

AWQ（Activation-aware Weight Quantization）观察到仅少量权重（对应显著激活）对性能关键，应被保护。

## 二、核心原理

不直接量化所有权重，而是对重要权重通道乘缩放因子「保护」，降低其相对误差，再统一量化。

## 三、数学形式

```
q(w_i) = Q(α_i · w_i) / α_i,  α_i 由激活幅度估计
```

## 四、代码实现

```python
from awq import AutoAWQForCausalLM
model = AutoAWQForCausalLM.from_pretrained("model")
model.quantize("calib", qconfig={"w_bit":4,"q_group_size":128})
```

## 五、关键要点

- 不需反向传播，仅需激活统计。
- 对校准集分布更鲁棒。

## 六、与其他对比

- AWQ 推理时不需反量化额外开销（缩放可融合）；GPTQ 需补偿列。

## 七、常见误区

- 认为「保护」等于不量化——仍是低比特，只是误差更小。

## 八、与开源书对应

- Lin et al., *AWQ*, 2023.
- llm-course: https://github.com/mlabonne/llm-course

## 九、面试题

- AWQ 的「重要权重」如何确定？

## 十、演进

AWQ → AWQ+（结合稀疏） → 端侧适配。

## 十一、小结

AWQ 以激活感知保护关键权重，4-bit 部署高效。
