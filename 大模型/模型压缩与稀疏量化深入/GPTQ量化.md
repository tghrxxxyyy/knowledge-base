# GPTQ量化

> 对应 Frantar et al., *GPTQ: Accurate Post-Training Quantization for GPT*, 2022（ICLR）。

## 一、背景与挑战

直接逐层四舍五入（RTN）在 4 比特下误差大；GPTQ 用二阶信息补偿量化误差。

## 二、核心原理

基于 Optimal Brain Quantizer：按列顺序量化，用 Hessian 逆对未量化权重做最优更新以补偿已量化列误差，逐层处理。

## 三、数学形式

对块内权重，最小二乘解 $\Delta W^* = -\frac{1}{2} H^{-1} \nabla \mathcal L$，其中 $H=2X X^\top/n$ 为激活二阶矩。

## 四、代码实现

```python
for c in columns:
    q[:,c] = quant(w[:,c])
    err = (q[:,c]-w[:,c])[:,None]
    w += err * H_inv[:,c]        # 补偿后续列
```

## 五、与其他对比

- 比 RTN 在 4bit 精度高；比 QAT 省去训练。
- 与 AWQ 同为 INT4 主流，思路不同（误差补偿 vs 保护显著权重）。

## 六、常见误区

- 认为 GPTQ 无需校准；实际需小校准集估计 H。
- 忽略 per-group 尺度（如 128 组）对精度关键。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- GPTQ 为何比 RTN 好？答：用 Hessian 逆把量化误差反向补偿到未量化权重，降低整体重建误差。

## 九、演进

OBS → OBQ → GPTQ（近似逆+分块）→ GPTQ-v2/QuIP。

## 十、小结

GPTQ 以二阶补偿实现可部署的 4bit 量化，是开源 INT4 主力。
