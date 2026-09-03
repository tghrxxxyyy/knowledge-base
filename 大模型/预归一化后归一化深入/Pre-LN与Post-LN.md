# Pre-LN与Post-LN

> 对应 Xiong et al., 2020（指出 Pre-LN 训练更稳但 Post-LN 最终质量常更高需暖启）。

## 一、背景与挑战

原始 Transformer 用 Post-LN，深层易训不稳需 warmup；Pre-LN 更稳但可能欠拟合/质量略低。

## 二、核心原理

Pre-LN 让残差路径恒等直连、梯度易回传，训练稳；Post-LN 归一化截断残差，信号经层混合更充分但需小心学习率。

## 三、数学形式

Pre-LN 残差梯度含恒等项 $\frac{\partial h_{t+1}}{\partial h_t}=I+\dots$，天然不消失；Post-LN 缺此直连项。

## 四、代码实现

```python
def block(x, sub, norm, pre=True):
    return x + sub(norm(x)) if pre else norm(x + sub(x))
```

## 五、与其他对比

- 现代 LLM（如 LLaMA）普遍 Pre-LN + RMSNorm，兼顾稳定与效率。
- 与 RMSNorm 篇衔接：Pre-LN 常与 RMSNorm 组合。

## 六、常见误区

- 认为 Pre-LN 一定质量差；配合好学习率/深度可接近甚至更优。
- 直接把 Post-LN 权重用于 Pre-LN 结构，不兼容。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 为何 Pre-LN 更稳？答：残差恒等直连使梯度含单位阵项，避免深层消失。

## 九、演进

Post-LN（原版）→ Pre-LN（稳定）→ Pre-LN+RMSNorm（现代默认）。

## 十、小结

Pre-LN 以残差直连换稳定，是现代大模型训练的工程首选。
