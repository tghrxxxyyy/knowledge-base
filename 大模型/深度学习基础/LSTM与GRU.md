# LSTM 与 GRU

> 对应 d2l-zh 第9章「长短期记忆网络」。门控机制缓解 RNN 梯度消失。

## 一、核心概念

**LSTM**(Hochreiter & Schmidhuber, 1997) 引入细胞状态 `c_t` 与三个门：

- **遗忘门** `f_t = σ(W_f·[h_{t-1}, x_t] + b_f)`：决定丢弃多少旧状态。
- **输入门** `i_t = σ(...)`、**候选** `g̃_t = tanh(...)`。
- **输出门** `o_t = σ(...)`。

更新：

```
c_t = f_t ⊙ c_{t-1} + i_t ⊙ g̃_t
h_t = o_t ⊙ tanh(c_t)
```

**GRU** 用更新门/重置门合并门控，参数更少、训练更快。

## 二、数学形式

GRU：

```
z_t = σ(W_z [h_{t-1}, x_t])      # 更新门
r_t = σ(W_r [h_{t-1}, x_t])      # 重置门
h̃_t = tanh(W [r_t ⊙ h_{t-1}, x_t])
h_t = (1 - z_t) ⊙ h_{t-1} + z_t ⊙ h̃_t
```

## 三、代码实现

```python
import torch.nn as nn
lstm = nn.LSTM(input_size=128, hidden_size=256, batch_first=True)
gru  = nn.GRU(input_size=128, hidden_size=256, batch_first=True)
```

## 四、关键要点

| 模型 | 门数 | 状态 |
|------|------|------|
| RNN | 0 | 单一隐状态 |
| LSTM | 3 | 细胞+隐状态 |
| GRU | 2 | 单一隐状态 |

## 五、常见误区

- 认为 LSTM 完全解决长程依赖，极长序列仍吃力，最终被注意力取代。
- GRU 并非总优于 LSTM，需实验。

## 六、与开源书的对应

- d2l-zh「长短期记忆网络(LSTM)」：https://zh.d2l.ai/chapter_recurrent-neural-networks/lstm.html

## 七、面试题

- LSTM 的遗忘门如何缓解梯度消失？
- GRU 与 LSTM 的核心差异？
