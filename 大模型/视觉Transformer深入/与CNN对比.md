# ViT与CNN对比

> 对应 ConvNeXt（Liu et al., 2022）对照；现代CNN深入 衔接。

## 一、背景与挑战

二者各有归纳偏置与计算特性，需按数据量/分辨率权衡选型。

## 二、核心原理

CNN：局部连接+权值共享+平移等变，样本效率高。ViT：全局自注意力，容量大但需大数据。

## 三、数学形式

感受野：CNN 随深度线性增；ViT 第一层即全局。复杂度：CNN $O(N K^2 D)$，ViT $O(N^2 D)$。

## 四、代码实现

```python
# 同分辨率下
cnn_out = resnet(x)      # 局部堆叠
vit_out = vit(patch_embed(x))   # 全局一步
```

## 五、与其他对比

- 小数据：CNN/ConvNeXt 更稳；大数据：ViT/Swin 上限高。
- 高分辨率：窗口/轴向注意力（本批）缓解 ViT 平方复杂度。

## 六、常见误区

- 以为 ViT 全面超越 CNN；ConvNeXt 在中等数据反超。
- 忽视 ViT 对增强/蒸馏的依赖。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 何时选 ViT 而非 CNN？答：大数据/需全局建模/高容量场景。

## 九、演进

CNN 主导 → ViT 挑战 → 混合（CoAtNet）→ ConvNeXt 反超。

## 十、小结

ViT 与 CNN 互补，现代架构常混合二者优势。
