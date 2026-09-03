# Swin与DeiT变体

> 对应 Liu et al., *Swin*, 2021；Touvron et al., *DeiT*, 2021。

## 一、背景与挑战

ViT 全局注意力 $O(N^2)$ 难用于高分辨率；DeiT 解决小数据训练。

## 二、核心原理

Swin：层次化 + 移位窗口（局部注意力 + 跨窗口通信），复杂度降至 $O(N)$。
DeiT：加入蒸馏 token，用教师 logits 做软标签 + 硬标签联合训练。

## 三、数学形式

Swin 窗口数随阶段翻倍、尺寸减半；移位使相邻窗口交互。DeiT 损失 $\mathcal L = \alpha \mathcal L_{CE} + (1-\alpha)\mathcal L_{KL}$。

## 四、代码实现

```python
# Swin 窗口注意力（概念）
attn = window_partition(x); out = attn(attn); x = window_reverse(out)
```

## 五、与其他对比

- Swin 适合密集预测（检测/分割）；ViT 更适合分类。
- 窗口注意力深入 / 轴向注意力深入 提供细节。

## 六、常见误区

- 误以为 Swin 是全局注意力；实为分层局部+移位。
- DeiT 蒸馏 token 不可省略，否则退化为 ViT。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- Swin 移位窗口的作用？答：在局部注意力间建立跨窗口信息通路。

## 九、演进

ViT → DeiT → Swin → 层次视觉 Transformer 家族。

## 十、小结

Swin 与 DeiT 分别解决效率与数据效率，是 ViT 落地关键变体。
