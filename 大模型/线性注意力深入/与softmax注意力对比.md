# 线性注意力与 softmax 注意力对比

> 对应 Vaswani et al., *Attention Is All You Need*, 2017；Wang et al., *Linformer*, 2020。

## 一、背景与挑战

需在质量、速度、显存三者间理解线性注意力相对标准注意力的取舍，避免盲目替换。

## 二、核心原理

标准注意力先算完整 $n\times n$ 分数矩阵再 softmax，显存随 $n^2$ 增长；线性注意力把矩阵乘次序交换为 $(\phi(Q)\phi(K)^T)V=\phi(Q)(\phi(K)^TV)$，显存降为 $O(n d + d^2)$。

## 三、数学形式

标准：$O = softmax(\frac{QK^T}{\sqrt d})V$；线性：$O=\frac{\phi(Q)(\phi(K)^TV)}{\phi(Q)(\phi(K)^T\mathbf1)}$。前者保留精确逐对交互，后者为核低秩近似。

## 四、代码实现

```python
def softmax_attn(q, k, v):
    s = (q @ k.transpose(-1, -2)) / q.shape[-1] ** 0.5
    return torch.softmax(s, -1) @ v
# 线性版见 linear_attn；kernels 大时显存差距随 n^2 放大
```

## 五、与其他对比

- 与 稀疏注意力深入 互补：一个靠低秩、一个靠结构化稀疏。
- 与 FlashAttention深入 对照：Flash 保持精确 softmax 但 IO 优化，线性注意力改算法。

## 六、常见误区

- 认为线性注意力在所有任务无损；在需精确检索/复制时退化明显。
- 忽略线性注意力仍受隐藏维 $d$ 平方项影响（大 $d$ 时不那么线性）。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 何时选线性而非 softmax 注意力？答：序列极长且任务对逐对精度不敏感（如长文摘要）时更划算。

## 九、演进

全softmax → 低秩(Linformer) → 核近似(Linear/Performer) → 线性RNN。

## 十、小结

两者是精度-效率的谱两端，按序列长度与任务敏感度选型。
