# SwiGLU 与激活函数

> 见「模型架构演进/LLaMA架构要点」。

## 一、背景与挑战

ReLU 类 FFN 表达有限，SwiGLU 用门控提升能力。

## 二、核心原理

```
SwiGLU(x) = (xW_1 ⊙ σ(xW_2)) W_3
```

`σ` 为 SiLU/GELU 类门控。

## 三、关键要点

- 门控提升非线性表达。
- 略增参数。

## 四、与开源书对应

- Shazeer, *GLU Variants*, 2020.

## 五、面试题

- SwiGLU 为何常优于 ReLU FFN？

## 六、小结

门控 FFN 是现代 LLM 标配。
