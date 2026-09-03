# RNN基础与梯度问题

> 对应 d2l-zh 循环神经网络章与 Elman, 1990；见 annotated-transformer 对注意力的取代。

## 一、背景与挑战

序列数据（文本、语音、时序）长度可变，需参数共享且能记忆历史；但朴素 RNN 训练受梯度消失/爆炸困扰。

## 二、核心原理

隐藏态更新：$h_t = \tanh(W_{hh} h_{t-1} + W_{xh} x_t + b)$；输出 $o_t = W_{ho} h_t$。参数跨时间共享。

## 三、数学形式

沿时间反向传播（BPTT）梯度含连乘 $\prod_t \frac{\partial h_t}{\partial h_{k}} \approx (W_{hh}^\top J_t)^L$，谱半径 $>1$ 爆炸、$<1$ 消失。

## 四、代码实现

```python
h = torch.tanh(self.Whh @ h + self.Wxh @ x)
```

## 五、与其他对比

- 梯度裁剪缓解爆炸；对消失则需门控（LSTM/GRU）或无记忆的注意力。
- Transformer 用注意力直接建立任意距离依赖，规避长程梯度连乘。

## 六、常见误区

- 以为增大隐藏维度能解决长程依赖；本质是梯度路径问题。
- 梯度裁剪仅治标（爆炸），不解决消失。

## 七、与开源书对应

- d2l-zh RNN 章：https://github.com/d2l-ai/d2l-zh
- annotated-transformer：https://github.com/harvardnlp/annotated-transformer

## 八、面试题

- 为什么 RNN 难训长序列？答：BPTT 梯度连乘导致消失/爆炸。

## 九、演进

Elman RNN → LSTM → GRU → 注意力替代 → 状态空间模型（序列建模深入 对照）。

## 十、小结

RNN 把时间维参数共享，但长程依赖受梯度连乘限制，催生门控与注意力。
