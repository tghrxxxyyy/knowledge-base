# BatchNorm 数值稳定性

> 对应 Ioffe & Szegedy, 2015（Batch Normalization）；推理期用滑动平均统计。

## 一、背景与挑战

BN 在 batch 维算均值/方差，batch 过小（如 2）时统计噪声大，归一化反而引入不稳。

推理需用训练期累积的 running_mean/running_var，模式不一致会致输出漂移。

## 二、核心原理

训练：$\mu_B,\sigma_B^2$ 来自当前小批；推理：$\mu=\mathrm{running\_mean},\sigma^2=\mathrm{running\_var}$。

$\epsilon$ 防止方差近 0 时除以 0；但 $\epsilon$ 过大引入偏置。

## 三、数学形式

$y=\gamma\frac{x-\mu_B}{\sqrt{\sigma_B^2+\epsilon}}+\beta$；running 统计 $\mu\leftarrow(1-m)\mu+m\mu_B$，$m$ 动量。

## 四、代码实现

```python
bn = torch.nn.BatchNorm2d(64, eps=1e-5, momentum=0.1)
bn.eval()                       # 推理用 running 统计
out = bn(x)
```

## 五、与其他对比

- 与 LayerNorm 数值 比较：BN 依赖 batch、LN 不依赖。
- 与 混合精度实践陷阱 衔接，running_var 应 FP32。
- 与 训练发散诊断与恢复深入 相关，BN 统计崩可致发散。

## 六、常见误区

- 训练时误用 eval() 致统计不更新。
- batch=1 时 BN 方差为 0（除 0 被 eps 挡但退化为无归一化）。
- 多卡未同步 BN 统计，分布式不一致。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- BN 在推理期用什么统计？答：训练累积的 running_mean/var，非当前 batch。
- 为何小 batch BN 不稳？答：batch 统计噪声大，归一化引入额外方差。

## 九、演进

BN → SyncBN（多卡同步） → GN/Instance Norm（不依赖 batch）。

## 十、小结

BN 数值稳定依赖充足 batch 与正确 train/eval 模式，running 统计须 FP32。
