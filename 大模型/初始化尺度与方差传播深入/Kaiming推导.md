# Kaiming / He 初始化推导

> 对应 He et al., *Delving Deep into Rectifiers*, 2015（Kaiming 初始化）。

## 一、背景与挑战

ReLU 把约一半输入置零，使前向方差减半。若沿用 Xavier（按对称激活）会前向方差逐层衰减。

Kaiming 针对 ReLU 族重新推导方差尺度。

## 二、核心原理

对 $y=\max(0,Wx)$，当 $x$ 零均值且 $W$ 对称，$\mathbb E[\max(0,z)^2]=\frac12\mathrm{Var}(z)$。

前向守恒要求 $n_{in}\sigma_w^2\cdot\frac12\mathrm{Var}(x)=\mathrm{Var}(x)$，即 $\sigma_w^2=2/n_{in}$。

## 三、数学形式

ReLU 下：$\mathrm{Var}(y)=\frac12 n_{in}\sigma_w^2\mathrm{Var}(x)$；令等于 $\mathrm{Var}(x)$ 得 $\sigma_w^2=2/n_{in}$。

LeakyReLU 斜率 $a$：$\sigma_w^2=2/((1+a^2)n_{in})$。

## 四、代码实现

```python
torch.nn.init.kaiming_normal_(W, nonlinearity="relu")   # 正态，std=sqrt(2/fan_in)
torch.nn.init.kaiming_uniform_(W, a=0.01, nonlinearity="leaky_relu")
```

## 五、与其他对比

- 与 Xavier 推导 比较：ReLU 半区置零需方差翻倍。
- 与 初始化与激活协同 衔接，证明激活-初始化匹配必要。
- 与 梯度消失机理 对应，正确 Kaiming 减缓消失。

## 六、常见误区

- ReLU 网络误用 Xavier 致方差衰减。
- LeakyReLU 用普通 ReLU 的 Kaiming（斜率未计入）。
- 把 gain 忘加（如用于 GELU 需查表 gain）。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- Kaiming 为何是 2/fan_in？答：ReLU 使前向方差减半，权重方差翻倍以补偿守恒。
- LeakyReLU 如何改？答：分母乘 $(1+a^2)$ 计入负斜率保留的方差。

## 九、演进

Xavier → Kaiming(ReLU) → gain 表(GELU/SiLU)。

## 十、小结

Kaiming 为 ReLU 族修正方差尺度，是深度卷积/Transformer 常用初始化。
