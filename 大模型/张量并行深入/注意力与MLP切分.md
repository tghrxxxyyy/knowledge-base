# 注意力与 MLP 切分

> 对应 Megatron-LM 的 Transformer 层切分；Korthikanti et al., 2022。

## 一、背景与挑战

Transformer 每层含 QKV 投影、注意力、MLP，需整体切分并保持数值等价。

## 二、核心原理

QKV 与 MLP 第一层用列并行按头/隐藏维切；注意力分数在每张卡局部算（各头独立）；MLP 第二层用行并行求和。LayerNorm 前的张量并行需先 all_gather（或由序列并行承担）。

## 三、数学形式

多头注意力按头切：$head_h=Attention(XW_q^h,XW_k^h,XW_v^h)$；各卡算子集头；$Y=Concat(head)W_o$ 中 $W_o$ 行并行。

## 四、代码实现

```python
q, k, v = [linear_col(x, w, tp_group) for w in (Wq, Wk, Wv)]
ctx = scaled_dot_product(q, k, v)     # 各卡只算自己的头
out = linear_row(ctx, Wo, tp_group)   # all_reduce 求和
```

## 五、与其他对比

- 与 序列并行深入 互补：LayerNorm/dropout 沿序列维切由序列并行处理。
- 与 专家并行深入（MLP 换成 MoE）可叠加。

## 六、常见误区

- 在 LayerNorm 后错误切分破坏归一化语义。
- 注意力头数不被张量并行度整除致 padding 浪费。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 注意力如何按头切分？答：每个头独立投影与计算，卡间只算子集头，最后行并行合输出。

## 九、演进

整层复制 → 头级切分 → 与序列并行融合。

## 十、小结

注意力与 MLP 按列/行并行切分，配合序列并行可覆盖整层。
