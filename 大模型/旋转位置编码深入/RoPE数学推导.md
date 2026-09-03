# RoPE数学推导

> 对应 Su et al., 2021 附录推导。

## 一、背景与挑战

需构造映射 $f(q,m)$ 使 $\langle f(q,m),f(k,n)\rangle = g(q,k,m-n)$，即内积仅依赖相对位置。

## 二、核心原理

二维旋转满足该性质；高维拆成若干二维子空间各自旋转，角度按频率 $\theta_i=10000^{-2i/d}$ 递减。

## 三、数学形式

$f(q,m)_i = q_i \cos m\theta_i - q_{i+1}\sin m\theta_i$（配对 $(2i,2i+1)$）；
长序列高频（小 $i$ 对应大 $\theta$）捕捉细粒度，低频捕捉粗粒度。

## 四、代码实现

```python
inv_freq = 1.0 / (base ** (arange(0, d, 2) / d))
freqs = pos @ inv_freq            # (seq, d/2)
emb = cat(freqs, freqs, -1)       # (seq, d)
```

## 五、与其他对比

- 与 位置编码对比 中绝对正弦位置相比，RoPE 内建相对性。
- 频率基 $base$ 选择影响外推（见 NTK 缩放）。

## 六、常见误区

- 维度非偶数配对需小心；实现须成对旋转。
- 忽视 base 值对长上下文外推的影响。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 为什么按维度配不同频率？答：不同频率捕捉不同尺度的相对位置。

## 九、演进

原始 RoPE → 基频缩放 → 位置插值（NTK-aware）。

## 十、小结

RoPE 把相对位置编码为旋转，频率设计是其长程能力关键。
