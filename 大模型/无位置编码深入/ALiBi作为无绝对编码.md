# ALiBi 作为“无绝对编码”范式

> 对应 Press et al., *ALiBi*, 2022；与 无限上下文深入 的 ALiBi 节呼应。

## 一、背景与挑战

能否在不使用任何绝对/正弦/可学习位置嵌入的情况下，让模型既感知顺序又能外推？

## 二、核心原理

ALiBi 完全不加位置嵌入，仅在注意力分数注入随相对距离线性衰减的偏置，从而“无绝对位置”却“有相对顺序”。它是最接近“无位置编码”却又实用的折中。

## 三、数学形式

$score_{ij}=q_i k_j^T/\sqrt d - m\cdot|i-j|$；无位置嵌入项，偏置仅依赖 $i-j$。

## 四、代码实现

```python
bias = -m[:, None, None] * torch.abs(i[None, :] - j[:, None])  # 无位置嵌入
scores = (q @ k.transpose(-1, -2)) / d**0.5 + bias
```

## 五、与其他对比

- 与 绝对位置编码深入 对立：此处零位置嵌入。
- 与 相对位置编码深入 同源（都靠相对距离）。

## 六、常见误区

- 把 ALiBi 称作位置编码；严格说是距离偏置，无位置嵌入。
- 不同 head 的 $m$ 未拉开距离尺度致表达单一。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- ALiBi 为何算“无绝对位置”？答：它不加任何位置嵌入，只靠距离偏置传达顺序。

## 九、演进

绝对嵌入 → 相对偏置(T5) → ALiBi(零位置嵌入)。

## 十、小结

ALiBi 示范了“无绝对位置编码”也可获得顺序与外推，是位置设计的重要范式。
