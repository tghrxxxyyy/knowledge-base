# IPO/KTO等DPO变体

> 对应 IPO（Azar et al., 2023）、KTO（Ethayarajh et al., 2024）、ORPO。

## 一、背景与挑战

标准 DPO 在有噪声/规模偏好下过拟合；变体改进泛化与数据效率。

## 二、核心原理

IPO 加正则防过拟合；KTO 用“有益/有害” pointwise 信号（不需配对）；ORPO 在 SFT 损失加 odds-ratio 惩罚免参考模型。

## 三、数学形式

IPO：$\mathcal L_{IPO} = (\log\frac{\pi_w}{\pi_{ref}\pi_l} - \frac1{2\beta})^2$ 回归式。KTO 基于 Kahneman-Tversky 前景理论。

## 四、代码实现

```python
# ORPO: 在 SFT 上加惩罚
loss = sft_loss + lambda_* odds_ratio_penalty
```

## 五、与其他对比

- KTO 对未配对数据友好（更省标注）。
- 与 偏好优化前沿（目录）共享前沿。

## 六、常见误区

- 以为 DPO 变体都优于原版；需按数据形态选。
- ORPO 省参考模型但需更仔细调 $\lambda$。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- KTO 相对 DPO 优势？答：用 pointwise 有益/有害信号，不需配对偏好，标注更省。

## 九、演进

DPO → IPO → KTO/ORPO → 多目标对齐。

## 十、小结

DPO 变体针对噪声/配对稀缺改进，按数据形态选择。
