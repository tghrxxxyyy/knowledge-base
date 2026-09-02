# 旋转位置编码 RoPE 深入

> 见「Transformer深入/旋转位置编码RoPE」。

## 一、背景与挑战

RoPE 把绝对位置转成旋转，使注意力内积只依赖相对距离，且天然支持长上下文外推(NTK)。

## 二、核心原理

`⟨RoPE(q,m), RoPE(k,n)⟩ = f(q,k,m-n)`。

## 三、关键要点

- 仅作用于 Q/K。
- 外推靠 base/NTK 调整。

## 四、与开源书对应

- Su et al., *RoFormer*, 2021.

## 五、面试题

- 为何 RoPE 外推要调 base？

## 六、小结

RoPE 是当代 LLM 位置编码主流。
