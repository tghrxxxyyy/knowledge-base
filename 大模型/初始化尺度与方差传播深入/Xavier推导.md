# Xavier / Glorot 初始化推导

> 对应 Glorot & Bengio, *Understanding the difficulty of training deep feedforward networks*, 2010（Xavier）。

## 一、背景与挑战

2010 年论文指出：当时常用初始化使前向方差随层骤减或骤增。作者提出让前向与反向方差都守恒的尺度。

适用于对称激活（tanh/sigmoid，近似线性区）。

## 二、核心原理

假设线性激活、权重与输入独立。前向 $\mathrm{Var}(y)=n_{in}\sigma_w^2\sigma_x^2$；反向对梯度同理含 $n_{out}$。

令二者相等并都守恒，得 $\sigma_w^2=2/(n_{in}+n_{out})$（调和平均）。

## 三、数学形式

由 $\forall l:\mathrm{Var}(y_l)=\mathrm{Var}(y_{l-1})$ 与 $\mathrm{Var}(\partial L/\partial x_l)=\mathrm{Var}(\partial L/\partial x_{l+1})$ 联立得 Xavier 方差。

均匀分布实现：$W\sim U[-a,a],\,a=\sqrt{6/(n_{in}+n_{out})}$。

## 四、代码实现

```python
import math
a = math.sqrt(6.0 / (fan_in + fan_out))
W = torch.empty(fan_in, fan_out).uniform_(-a, a)
```

## 五、与其他对比

- 与 Kaiming 推导 比较：Xavier 假定对称激活、Kaiming 针对 ReLU。
- 与 初始化总览 衔接，Xavier 是均衡解。
- 与 梯度消失机理 对应，均衡初始化减缓消失。

## 六、常见误区

- 把 Xavier 用于 ReLU 网络（方差偏小）。
- 混淆 fan_in 与 fan_out 调和/算术平均。
- 忽略偏置（Xavier 通常不含偏置缩放）。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- Xavier 为何取调和平均？答：同时让前向与反向梯度方差守恒，需兼顾 fan_in/out。
- Xavier 适用什么条件？答：对称近似线性激活（tanh），ReLU 应选 Kaiming。

## 九、演进

经验随机 → Xavier → Kaiming → LSUV 数据驱动。

## 十、小结

Xavier 以方差守恒设定对称激活网络的初始化尺度，奠定现代初始化理论。
