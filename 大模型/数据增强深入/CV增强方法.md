# 计算机视觉数据增强

> 对应 AutoAugment/CutMix/RandAugment。

## 一、背景与挑战

需丰富视角/尺度/色彩不变性，且增强策略影响大。

## 二、核心原理

基础：翻转/裁剪/旋转/色彩抖动；进阶：CutMix（区域替换）、RandAugment（随机子策略）、AutoAugment（搜索）。

## 三、数学形式

CutMix：$x_{new}=M\odot x_a + (1-M)\odot x_b$（$M$ 二值掩码），标签按面积混合。

## 四、代码实现

```python
box = random_box(); x[box]=x_b[box]; y = area_a*y_a+area_b*y_b
```

## 五、与其他对比

- 与 正则化与Dropout深入（DropPath）互补于深度网络。
- 与 卷积神经网络深入（平移等变）呼应。

## 六、常见误区

- AutoAugment 搜出的策略未必迁移到新数据集。
- 增强破坏任务假设（如医学影像方向有意义）。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- CutMix 与 Mixup 区别？答：CutMix 在像素空间区域混合，Mixup 在整图线性插值。

## 九、演进

手工 → RandAugment → 学习增强(DAE)。

## 十、小结

CV 增强从几何到混合样本，RandAugment 简化自动化策略。
