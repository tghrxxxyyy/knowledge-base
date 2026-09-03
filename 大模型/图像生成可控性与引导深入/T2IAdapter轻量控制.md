# T2IAdapter轻量控制

> 对应 Mou et al. 2023 「T2I-Adapter: Learning Adapters to Dig Out More Controllable Ability」。

## 一、背景与挑战

ControlNet 参数量大、训练重。T2I-Adapter 提出轻量适配器，在冻结扩散模型外挂小网络，把结构条件（姿态/草图）编码为紧凑特征注入，兼顾控制与效率。

## 二、核心原理

Adapter 为独立小编码器，接收条件图，输出多尺度特征图，与 U-Net 各层特征相加。相比 ControlNet 复制整 U-Net，Adapter 仅百万级参数，训练快、易组合多个适配器，控制强度可调。

## 三、数学形式

适配器输出多尺度 \{a_l\}_{l=1}^L，注入：
h_l = h_l^{base} + \gamma_l \cdot a_l
其中 \gamma_l 为每层缩放系数控制影响强度。适配器自身：
a = A(c_{map}; \phi)，\phi 远小于 U-Net 参数。

## 四、代码实现

```python
class T2IAdapter(nn.Module):
    def __init__(self, in_ch=3, out_ch=320):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(in_ch, 64, 3, 2, 1),
            nn.ReLU(), nn.Conv2d(64, out_ch, 3, 2, 1))
    def forward(self, cond, gamma=1.0):
        return self.net(cond) * gamma
```

## 五、与其他对比

相比 ControlNet，Adapter 更轻、易多组合、训练省资源；控制精度略弱于完整 ControlNet；适合快速实验与多条件融合。二者可并用。

## 六、常见误区

以为 Adapter 等同 ControlNet 精度；忽略缩放系数；混淆多适配器权重；未冻结主模型致过拟合。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- Q：T2I-Adapter 与 ControlNet？答：更轻量外挂，参少易组合。
- Q：如何注入？答：多尺度特征加和，配缩放系数。
- Q：优势场景？答：快速多条件控制、低资源。

## 九、演进

多适配器组合；与 LoRA 并行；视频/3D 适配扩展。

## 十、小结

T2I-Adapter 以极小代价把结构控制注入扩散模型，是 ControlNet 之外的高效可控生成方案。
