# FFN与注意力分工

> 对应 Elhage et al., *A Mathematical Framework for Transformer Circuits*, 2021。

## 二、背景与挑战

Transformer 中注意力与 FFN 各自承担什么？理解分工有助于可解释性与高效架构设计。

## 一、核心原理

注意力负责"路由/搬运"——在序列内混合信息、写入/读取上下文；FFN 负责"计算/生成"——基于已混合的残差流做非线性变换与知识检索。

## 三、数学形式

残差流更新可写为 $x_{l+1}=x_l+A_l x_l+F_l(x_l)$；注意力 $A_l$ 是混合算子，FFN $F_l$ 是逐位映射。

## 四、代码实现

```python
res = x
for l in range(L):
    res = res + attn_l(res)   # 路由
    res = res + ffn_l(res)    # 计算/记忆
```

## 五、与其他对比

- 与 注意力模式类型学深入 互补（注意力侧功能）。
- 与 稀疏自编码器特征深入 衔接（FFN 中叠加的特征）。

## 六、常见误区

- 认为注意力做"理解"、FFN 做"记忆"是绝对划分；二者紧密耦合。
- 忽略二者都作用在残差流上、可互换部分功能。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- 注意力与 FFN 分工？答：注意力在序列内路由/混合信息，FFN 对残差流逐位做非线性计算与记忆检索。

## 九、演进

直觉分工 → 残差流框架形式化 → 架构消融验证。

## 十、小结

注意力管路由、FFN 管计算，二者在残差流上协同。
