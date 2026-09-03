# GPTQ 与 AWQ

> 对应 Frantar et al., *GPTQ*, 2022；Lin et al., *AWQ*, 2023。

## 一、背景与挑战

朴素 RTN 在 3-4bit 崩；GPTQ/AWQ 以二阶/重要权重保精度。

## 二、核心原理

GPTQ：按列顺序量化并用 Hessian 补偿后续列误差（OBQ 思路）。AWQ：识别激活显著权重（占少量）保护，余下低比特。

## 三、数学形式

GPTQ 更新 $\Delta w_j = -\frac{w_j - \hat w_j}{[H^{-1}]_{jj}} H^{-1}_{:,j}$；AWQ 缩放重要通道 $W\cdot\text{diag}(s)$。

## 四、代码实现

```python
Wq = gptq_quantize(W, H, bits=4)      # 需 Hessian
Wq = awq_quantize(W, act_stats, bits=4)
```

## 五、与其他对比

- AWQ 不需 Hessian、更轻；GPTQ 精度略优；
- 与 权重量化深入 是进阶方法。

## 六、常见误区

- 以为 4bit 通用无损（仍有损）；
- 校准集分布偏移致失效。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- GPTQ 与 AWQ 区别？答：GPTQ 用二阶补偿误差，AWQ 保护显著权重、更轻。

## 九、演进

RTN → GPTQ → AWQ → 混合。

## 十、小结

GPTQ/AWQ 以误差补偿/权重保护把 4bit 推到可用。
