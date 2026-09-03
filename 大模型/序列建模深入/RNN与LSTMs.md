# RNN 与 LSTM/GRU

> 对应 d2l-zh 循环神经网络章；Hochreiter & Schmidhuber, *LSTM*, 1997；Cho et al., *GRU*, 2014。

## 一、背景与挑战

朴素 RNN 存在梯度消失/爆炸，难以学长程依赖。

## 二、核心原理

LSTM 用门控（遗忘/输入/输出门）与记忆单元维护长期状态：
```
f_t = σ(W_f[h_{t-1},x_t]+b_f)
C_t = f_t⊙C_{t-1} + i_t⊙tanh(W_c[...])
```
遗忘门决定保留多少旧记忆，缓解梯度消失。GRU 是简化版（两门）。

## 三、数学形式

见上；⊙ 为逐元素乘。

## 四、代码实现

```python
rnn = nn.LSTM(input_size, hidden, num_layers, batch_first=True)
out, (h,c) = rnn(x)
```

## 五、关键要点

- 仍串行，难并行、训练慢。
- 长序列仍会遗忘（记忆容量有限）。

## 六、与其他对比

- Transformer 并行优但吃显存。

## 七、常见误区

- LSTM 解决一切长程——仍有上限。

## 八、与开源书对应

- d2l-zh: https://github.com/d2l-ai/d2l-zh
- Hochreiter & Schmidhuber, 1997.

## 九、面试题

- LSTM 遗忘门作用？

## 十、演进

RNN → LSTM → GRU → 双向 LSTM。

## 十一、小结

门控让记忆「可控」。
