# 现代CNN与大模型

> 对应 ConvNeXt (Liu et al., 2022) 与 Vision Transformer 对照；d2l-zh 现代卷积网络。

## 一、背景与挑战

Transformer 在视觉上超越 CNN 后，社区反思 CNN 设计，提出现代化卷积（ConvNeXt）逼近 Swin。

## 二、核心原理

ConvNeXt 借鉴 ViT 经验：大核（7×7 深度卷积）、Patchify 式 stem、更少激活/归一化、LayerNorm 替代 BN、倒置瓶颈。

## 三、数学形式

计算复杂度：自注意力 $O(N^2 d)$（$N$ 为 token 数）vs 卷积 $O(N K^2 d)$，大分辨率下卷积更省。

## 四、代码实现

```python
# ConvNeXt block 简化
x = dwconv7(gelu(layernorm(x)))   # 大核深度卷积
x = pw1(gelu(layernorm(x)))       # 升维
x = pw2(x)                        # 降维
```

## 五、与其他对比

- ViT 全局建模强但需大数据/蒸馏；ConvNeXt 在中等数据更稳。
- 大模型视觉骨干常混合卷积（局部）+ 注意力（全局）。

## 六、常见误区

- 以为注意力全面碾压卷积；实际卷积的归纳偏置（局部性）在小数据很有用。

## 七、与开源书对应

- d2l-zh 现代卷积网络章：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- ConvNeXt 借鉴了 ViT 哪些设计？答：大核、LN、倒置瓶颈、更少激活。

## 九、演进

CNN 纯卷积 → 混合卷积-注意力（CoAtNet）→ 纯注意力（ViT）→ 现代化卷积反超（ConvNeXt）。

## 十、小结

现代 CNN 通过吸收 Transformer 设计哲学重回 SOTA 竞争，证明卷积归纳偏置仍有价值。
