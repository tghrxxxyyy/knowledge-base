# GLU门控线性单元

> 对应 Dauphin et al., *Language Modeling with Gated Convolutional Networks*, NeurIPS 2017（首次提出 GLU 门控线性单元）。

## 一、背景与挑战

逐元素激活（ReLU 等）直接变换，缺乏可学习门控来控制信息流；深层网络中梯度易衰减，表达受限。

## 二、核心原理

GLU 将输入做两个线性投影，其一过 sigmoid 作为门，与另一投影逐元素相乘，门控决定各通道是否通过。

## 三、数学形式

$\text{GLU}(x)=(xW+b)\odot\sigma(xV+c)$，其中 $\odot$ 为逐元素乘，$W,V$ 为可学习投影，输出维与输入相同。

## 四、代码实现

```python
import torch.nn as nn
class GLU(nn.Module):
    def __init__(self, d):
        super().__init__()
        self.fc = nn.Linear(d, 2 * d)
    def forward(self, x):
        a, b = self.fc(x).chunk(2, dim=-1)
        return a * torch.sigmoid(b)
```

## 五、与其他对比

- 相比 ReLU 直接激活，GLU 多一个可学习门，表达更强但参数量翻倍（先扩到 2d）。
- 与 SwiGLU 的区别在于门函数：GLU 用 sigmoid，SwiGLU 用 Swish（见 SwiGLU与变体）。

## 六、常见误区

- 误以为 GLU 输出维度仍是 d 而不做 2d 投影，导致维度不匹配。
- 把门控函数 sigmoid 与激活 Swish 混淆，二者数学性质不同。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- GLU 相比普通激活优势？答：门控可学习地抑制或放大通道，增强特征选择并改善梯度流。

## 九、演进

ReLU 激活 → GLU 门控卷积 → LSTM 门控思想 → Transformer FFN 门控化（SwiGLU）。

## 十、小结

GLU 以逐元素门控乘替代直接激活，是后续 SwiGLU/GeGLU 等 FFN 改进的理论起点。
