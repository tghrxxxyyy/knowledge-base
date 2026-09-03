# NeRF原理

> 对应 Mildenhall et al., 2020；隐式神经表示经典工作。

## 一、背景与挑战

如何从一组 2D 照片重建连续可微的 3D 场景，并任意新视角合成。

## 二、核心原理

场景被一个 MLP $F_\Theta:(x,y,z,\theta,\phi)\to(c,\sigma)$ 表示。对每条光线采样点，用体渲染积分得像素色，与真值 RGB 求 L2 监督。

## 三、数学形式

密度 $\sigma$ 经 ReLU 保证非负；颜色 $c$ 经 sigmoid 归一到 $[0,1]$；损失
$\mathcal L=\sum_{r\in R}\|C_{pred}(r)-C_{gt}(r)\|_2^2$。

## 四、代码实现

```python
sigma = F.relu(raw_sigma)
color = torch.sigmoid(raw_color)
loss = ((render_rays(mlp, rays) - gt) ** 2).mean()
```

## 五、与其他对比

- 比体素存储省空间、比网格易优化；但每像素需数百次 MLP 前向。
- 与 神经渲染总览 衔接（本节为原理）。

## 六、常见误区

- 位置编码缺失导致高频细节丢失（需用 Fourier 特征）。
- 忽视体渲染采样数 N 对质量/速度的平衡。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 为何需位置编码？答：MLP 低频偏置，Fourier 特征提升高频几何/纹理重建。

## 九、演进

NeRF→Mip-NeRF→Instant-NGP（哈希编码加速）。

## 十、小结

NeRF 以体积密度场+体渲染实现高质量新视角合成，是隐式表示里程碑。
