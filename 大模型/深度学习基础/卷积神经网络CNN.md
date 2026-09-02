# 卷积神经网络 CNN

> 对应 d2l-zh 第6章「卷积神经网络」。CNN 通过局部连接与权值共享高效处理网格数据(图像)。

## 一、核心概念

- **卷积核(kernel)**：在输入上滑动的小窗口，提取局部特征。
- **通道(channel)**：输入/输出的特征图数量。
- **填充(padding)** 与 **步幅(stride)**：控制输出尺寸。
- **池化(pooling)**：下采样(最大/平均)，提供平移不变性。

输出尺寸公式（方形输入 `n`，核 `k`，padding `p`，stride `s`）：

```
out = ⌊(n + 2p - k) / s⌋ + 1
```

## 二、数学形式

二维互相关(深度学习习惯称"卷积")：

```
Y(i,j) = Σ_{a,b} X(i+a, j+b) · K(a,b)
```

注意数学卷积含翻转，深度学习中实际是互相关，但统称卷积。

## 三、代码实现

```python
import torch.nn as nn

net = nn.Sequential(
    nn.Conv2d(3, 64, kernel_size=3, padding=1, stride=1),
    nn.ReLU(),
    nn.MaxPool2d(2, 2),
    nn.Flatten(),
    nn.Linear(64 * 16 * 16, 10),
)
```

## 四、关键要点

| 组件 | 作用 |
|------|------|
| 卷积 | 局部特征提取 |
| 权值共享 | 参数少、平移不变 |
| 池化 | 降维、鲁棒 |
| 感受野 | 高层覆盖全局 |

## 五、常见误区

- 混淆 `kernel_size` 与输出通道数。
- 多卷积层后未计算感受野是否覆盖整图。
- 池化导致空间信息丢失，语义分割中慎用。

## 六、与开源书的对应

- d2l-zh 第6章「卷积神经网络」：https://zh.d2l.ai/chapter_convolutional-neural-networks/index.html
- LeCun et al., *Gradient-Based Learning Applied to Document Recognition*, 1998 (LeNet).

## 七、面试题

- 1×1 卷积有什么作用？
- 如何计算多层 CNN 的感受野？
