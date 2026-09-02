# 循环神经网络 RNN

> 对应 d2l-zh 第9章「循环神经网络」。RNN 通过隐状态建模序列时序依赖。

## 一、核心概念

RNN 在时刻 `t` 维护隐状态 `h_t`，由当前输入 `x_t` 与前一隐状态 `h_{t-1}` 计算：

```
h_t = tanh(W_xh x_t + W_hh h_{t-1} + b_h)
o_t = W_ho h_t + b_o
```

参数量不随序列长度增长，可处理变长输入。

## 二、数学形式

隐状态递归展开即"沿时间反向传播"(BPTT)。梯度 `∂h_t/∂h_k = Π_{i=k+1}^t W_hh^T · diag(...)`，连乘导致**梯度消失/爆炸**。

## 三、代码实现

```python
import torch.nn as nn
rnn = nn.RNN(input_size=128, hidden_size=256, num_layers=2, batch_first=True)
# out, h_n = rnn(x)  # x: (B, T, 128)
```

## 四、关键要点

| 问题 | 原因 | 解法 |
|------|------|------|
| 梯度消失 | 连乘 <1 | LSTM/GRU |
| 长程依赖弱 | 信息衰减 | 注意力 |
| 并行差 | 时序依赖 | Transformer |

## 五、常见误区

- 误以为 RNN 天然记住长程信息，实际受梯度问题限制。
- 忽视 `hidden` 在 batch 间的初始化。

## 六、与开源书的对应

- d2l-zh 第9章「循环神经网络」：https://zh.d2l.ai/chapter_recurrent-neural-networks/index.html

## 七、面试题

- BPTT 与 BP 的区别？为何 RNN 难训长序列？
