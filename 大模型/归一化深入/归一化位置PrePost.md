# 归一化位置 Pre-Norm vs Post-Norm

> 见「Transformer深入/PreNorm和PostNorm对比」。

## 一、背景与挑战

归一化放残差前(Pre)还是后(Post)影响深层稳定性。

## 二、核心原理

```
Post: x = LN(x + F(x))
Pre : x = x + F(LN(x))
```

## 三、关键要点

- Pre-Norm 更稳，大模型主流。
- Post-Norm 表达略强但需 warmup。

## 四、与开源书对应

- Xiong et al., 2020.

## 五、面试题

- 为何大模型偏好 Pre-Norm？

## 六、小结

Pre-Norm 是当前深层 Transformer 的默认选择。
