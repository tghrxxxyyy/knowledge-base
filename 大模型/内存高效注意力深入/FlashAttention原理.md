# FlashAttention 原理

> 对应 Dao et al., *FlashAttention*, 2022（IO 感知、不物化 $N^2$）。

## 一、背景与挑战

标准注意力频繁读写 $N^2$ 分数矩阵致 HBM 往返昂贵；FlashAttention 把它留在 SRAM。

## 二、核心原理

将 Q/K/V 分块装入快速 SRAM，在块内计算 softmax（online softmax 维护 running max/sum），仅写回 $O(N)$ 输出，避免 $N^2$ 中间结果落 HBM。

## 三、数学形式

online softmax：$m_i=\max(m_{i-1},m')$，$\ell_i=\ell_{i-1}e^{m_{i-1}-m_i}+e^{m'-m_i}\ell'$；增量更新输出。

## 四、代码实现

```python
# 伪代码：分块内 online softmax
for qc in tiles(Q):
    m, l, acc = -inf, 0, 0
    for kc, vc in zip(tiles(K), tiles(V)):
        s = qc @ kc.T; m_new = max(m, s.max())
        l = l*exp(m-m_new) + exp(s-m_new).sum()
        acc = acc*exp(m-m_new) + exp(s-m_new) @ vc
```

## 五、与其他对比

- 与 标准注意力（速度/显存双赢）对照；
- 与 FlashAttention2深入（并行化改进）衔接。

## 六、常见误区

- 误以为它改变数学结果（仅重排计算，数值等价）；
- 头维度过大超出 SRAM 块而致回退。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- FlashAttention 如何省显存？答：分块在 SRAM 算、online softmax 不物化 $N^2$ 分数。

## 九、演进

v1（IO 感知） → v2（并行/占用） → v3（FP8）。

## 十、小结

FlashAttention 以 IO 感知重排实现同等结果下更省显存更快。
