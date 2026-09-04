# RoPE与线性注意力的兼容

> 对应 choromanski 2021 Performer; wenhu/RoPE 变体。

## 一、背景与挑战
线性注意力破坏了 softmax 结构，传统 RoPE 通过 $\exp$ 的泰勒展开才与位置耦合。直接把 RoPE 套到线性注意力上不一定有效。

## 二、核心原理
两条思路：(1) 在 $\phi(Q), \phi(K)$ 之前应用 RoPE，使内积仍含 $\cos((m-n)\theta)$；(2) 在特征空间引入位置调制，如 Performer 风格的相对位置编码。

## 三、形式化与数学基础
对线性注意力 $\phi(Q)\phi(K)^\top V$，把 $q$ 换成 $R_m q$、$k$ 换成 $R_n k$，则 $\phi(R_m q)^\top \phi(R_n k)$ 在 $\phi$ 为正定核时仍含 $(m-n)$ 的余弦项（近似）。

## 四、代码实现
```python
# 线性注意力 + RoPE
Q = apply_rope(Q, cos, sin)
K = apply_rope(K, cos, sin)
Q_phi = phi(Q); K_phi = phi(K)
S = K_phi.transpose(0,1) @ V
out = Q_phi @ S
```

## 五、与其他技术对比
- vs 标准 RoPE：线性版本对位置调制的鲁棒性稍差。
- vs ALiBi：ALiBi 在线性注意力下可直接加，无需 RoPE 旋转。

## 六、常见误区
- 旋转后再做归一化（除以 $\phi(K)$ 之和）会破坏相对位置。
- 对 query 与 key 都旋转，但 inner product 是 $m-n$ 仍有效。

## 七、与开源书/权威来源对应
- d2l-ai/d2l-zh 第11章。
- ofwfanfan/cosFormer 论文。

## 八、面试题
- 线性注意力为何需要重新设计位置编码？答：softmax 行为被核函数破坏，位置信号需重新引入。

## 九、演进与趋势
RoPE → 线性 RoPE 变体 → 与状态空间的位置编码。

## 十、小结
RoPE 与线性注意力结合需仔细设计，否则位置信号在核近似中丢失。
