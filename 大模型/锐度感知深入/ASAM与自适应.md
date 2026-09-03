# ASAM与自适应SAM

> 对应 Kwon et al., *ASAM: Adaptive Sharpness-Aware Minimization*, ICLR 2022。

## 一、背景与挑战

SAM 的固定半径 $\rho$ 对参数尺度敏感，不同层量级差异大时效果不稳。

## 二、核心原理

ASAM 将扰动约束在参数相对尺度（用逐元素缩放矩阵 $D$）上，使锐度度量与参数尺度无关。

## 三、数学形式

约束改为 $\|\text{diag}(D)\varepsilon\|_2\le\rho$，其中 $D_{ii}=| \theta_i |$ 或自适应缩放；扰动沿归一化方向。

## 四、代码实现

```python
scale = torch.abs(p.data).clamp_min(1e-8)
eps = rho * (g / scale) / ((g / scale).norm() + 1e-12) * scale
```

## 五、与其他对比

- 相比 SAM 更稳定，尤其与 BatchNorm/不同初始化共存时。
- 与 自适应学习率深入 思想相似（逐参数缩放）。

## 六、常见误区

- 缩放矩阵选择不当仍会引入尺度偏置。
- 误以为 ASAM 总是优于 SAM，需视任务而定。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- ASAM 相对 SAM 改进？答：用相对尺度约束扰动，消除参数量级对锐度度量的影响。

## 九、演进

固定半径 → 自适应尺度 → 与归一化层协同设计。

## 十、小结

ASAM 通过尺度不变扰动提升 SAM 的稳健性，是大模型训练更优选。
