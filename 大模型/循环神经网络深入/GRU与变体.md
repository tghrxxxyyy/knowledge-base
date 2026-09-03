# GRU与变体

> 对应 Cho et al., *Learning Phrase Representations*, 2014 (GRU)。

## 一、背景与挑战

LSTM 参数多、计算重；GRU 以更少门控近似其能力，便于训练与部署。

## 二、核心原理

更新门 $z_t=\sigma(W_z[h_{t-1},x_t])$、重置门 $r_t=\sigma(W_r[h_{t-1},x_t])$；
$\tilde h_t = \tanh(W[r_t \odot h_{t-1}, x_t])$；$h_t = (1-z_t)\odot h_{t-1} + z_t \odot \tilde h_t$。

## 三、数学形式

$z_t\to1$ 保留旧态（类似遗忘），$z_t\to0$ 采用候选（类似输入门），等价 LSTM 两门合一。

## 四、代码实现

```python
z = torch.sigmoid(self.Wz(hx)); r = torch.sigmoid(self.Wr(hx))
h_tilde = torch.tanh(self.Wh(r * h, x))
h = (1 - z) * h + z * h_tilde
```

## 五、与其他对比

- GRU 参数量约 LSTM 的 3/4，许多任务表现相当。
- 大型序列模型更多转向注意力/状态空间，门控 RNN 在轻量场景仍活跃。

## 六、常见误区

- 并非所有任务 GRU 都优于 LSTM；门控设计影响收敛与记忆。

## 七、与开源书对应

- d2l-zh GRU 章：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- GRU 与 LSTM 的核心差异？答：GRU 无独立记忆单元与输出门，门更少。

## 九、演进

GRU → 最小门控单元 → 与注意力混合 → 被 Transformer 在大规模取代。

## 十、小结

GRU 以精简门控在多数任务逼近 LSTM，是资源受限序列建模的实惠选择。
