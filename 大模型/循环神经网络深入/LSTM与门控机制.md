# LSTM与门控机制

> 对应 Hochreiter & Schmidhuber, *Long Short-Term Memory*, 1997。

## 一、背景与挑战

标准 RNN 难以保持长期记忆；LSTM 用门控与记忆单元显式控制信息流。

## 二、核心原理

记忆单元 $c_t$ 与三/四门：遗忘门 $f_t=\sigma(W_f[h_{t-1},x_t]+b_f)$、输入门 $i_t$、输出门 $o_t$、候选 $\tilde c_t=\tanh(\dots)$；
$c_t = f_t \odot c_{t-1} + i_t \odot \tilde c_t$，$h_t = o_t \odot \tanh(c_t)$。

## 三、数学形式

门控使梯度路径可穿越（$c_t$ 加法更新），长程梯度近似常数，缓解消失。

## 四、代码实现

```python
f = torch.sigmoid(self.Wf(hx)); i = torch.sigmoid(self.Wi(hx))
g = torch.tanh(self.Wg(hx)); o = torch.sigmoid(self.Wo(hx))
c = f * c + i * g; h = o * torch.tanh(c)
```

## 五、与其他对比

- GRU 合并遗忘/输入门、无独立输出门，参数更少提速。
- 注意力无需顺序递推，可并行且直接长程。

## 六、常见误区

- LSTM 并非万能消除长程遗忘；仍受容量与门饱和影响。
- 门多不等于记忆好，训练动态与初始化同样关键。

## 七、与开源书对应

- d2l-zh LSTM 章：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 遗忘门的作用？答：控制保留多少旧记忆，避免无关历史累积。

## 九、演进

LSTM → peephole LSTM → GRU → 层归一化 LSTM → 注意力主导。

## 十、小结

LSTM 以门控+记忆单元缓解梯度消失，是序列建模长期主力，后被注意力部分取代。
