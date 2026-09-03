# 视觉Transformer总览

> 对应 Dosovitskiy et al., *ViT*, 2020；d2l-zh 现代卷积网络章对照。

## 一、背景与挑战

CNN 以局部归纳偏置取胜，但全局依赖需深层堆叠；ViT 把图像切块当 token，用纯Transformer建模全局关系。

## 二、核心原理

将图像切成 $P\times P$ patch，展平后线性投影为 token 序列，加位置嵌入与可学习 [cls] 向量，送入标准 Transformer 编码器。

## 三、数学形式

序列长度 $N = HW/P^2$；每个 patch 嵌入 $z_0^i = [x_p^i E; E_{pos}^i]$，其中 $E\in\mathbb R^{(P^2C)\times D}$。

## 四、代码实现

```python
x = patch_embed(img)            # (B, N, D)
x = torch.cat([cls_token, x], 1)
z = transformer_encoder(x)
logits = head(z[:, 0])          # 用 cls
```

## 五、与其他对比

- ViT 需大数据/蒸馏才超 CNN；ConvNeXt 证明改良 CNN 仍具竞争力（现代CNN深入 对照）。
- 全局注意力 $O(N^2)$ 对高分辨率贵，引出窗口/轴向注意力。

## 六、常见误区

- 小数据直接上 ViT 易过拟合；需强增强或蒸馏。
- 误以为 patch 越小越好；过小使 $N$ 爆炸。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- annotated-transformer（序列侧）：https://github.com/harvardnlp/annotated-transformer

## 八、面试题

- ViT 为何需要大数据？答：缺卷积局部偏置，需数据学局部性。

## 九、演进

ViT → DeiT（蒸馏）→ Swin（层次窗口）→ 大模型视觉骨干。

## 十、小结

ViT 把图像当 token 序列，用全局注意力建模，开启视觉 Transformer 时代。
