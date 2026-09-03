# Transformer 序列建模

> 见「注意力数学基础/缩放点积注意力推导」；Vaswani et al., 2017。

## 一、背景与挑战

RNN 难并行且长程衰减，Transformer 用纯注意力解决。

## 二、核心原理

编码器-解码器堆叠多头自注意力 + 前馈 + 残差/层归一化。自注意力让任意两位置 O(1) 跳数互联，长程依赖无障碍。

## 三、数学形式

见注意力章；位置信息由位置编码补充（注意力本身置换不变）。

## 四、代码实现

```python
from torch.nn import TransformerEncoder
enc = TransformerEncoder(TransformerEncoderLayer(d, h), num_layers=L)
```

## 五、关键要点

- 需位置编码补序。
- 并行强，但 O(N²) 显存。

## 六、与其他对比

- 相比 RNN：并行、长程强；代价 O(N²)。

## 七、常见误区

- Transformer 天生知顺序——需位置编码。

## 八、与开源书对应

- harvardnlp/annotated-transformer: https://github.com/harvardnlp/annotated-transformer
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 九、面试题

- 为何 Transformer 需要位置编码？

## 十、演进

RNN → 注意力 → Transformer → 高效 Transformer。

## 十一、小结

注意力让序列「全连接」。
