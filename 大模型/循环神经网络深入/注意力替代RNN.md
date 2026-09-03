# 注意力替代RNN

> 对应 Vaswani et al., *Attention Is All You Need*, 2017；annotated-transformer。

## 一、背景与挑战

RNN 顺序计算无法并行且长程依赖受限；自注意力以常数路径连接任意两位置。

## 二、核心原理

自注意力：$Q,K,V$ 来自同一序列，$Attention(Q,K,V)=softmax(QK^\top/\sqrt d_k)V$，直接建模全局依赖。

## 三、数学形式

任意两位置距离的路径长度 $O(1)$，并行度 $O(1)$（vs RNN $O(n)$），复杂度 $O(n^2 d)$。

## 四、代码实现

```python
scores = Q @ K.T / d_k**0.5
ctx = torch.softmax(scores, -1) @ V
```

## 五、与其他对比

- 注意力长程更强但 $O(n^2)$；RNN $O(n)$ 但顺序且受限。
- 状态空间模型（序列建模深入）尝试兼得线性复杂度与长程。

## 六、常见误区

- 注意力不是银弹：短序列/小数据下 RNN/CNN 因归纳偏置更稳。
- 忽略位置编码则注意力对顺序无知。

## 七、与开源书对应

- annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- d2l-zh 注意力章：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 自注意力相对 RNN 的优势？答：并行、常数长程路径、全局感受野。

## 九、演进

RNN → 注意力增强 RNN → 纯注意力 Transformer → 高效注意力变体。

## 十、小结

自注意力以可并行与全局依赖取代 RNN 成为序列建模主流，奠定大模型架构。
