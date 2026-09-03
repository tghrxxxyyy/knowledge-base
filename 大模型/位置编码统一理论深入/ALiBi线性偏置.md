# ALiBi线性偏置

> 对应 Press et al., *Train Short, Test Long (ALiBi)*, 2021（用线性距离偏置实现强长度外推）。

## 一、背景与挑战

训练时只用短序列，推理要处理远超训练长度的输入；需一种不依赖绝对位置向量的外推友好偏置。

## 二、核心原理

不在嵌入加位置，而在注意力分数按 query-key 距离加线性惩罚：$a_{ij}=q_i^\top k_j/\sqrt d - m|i-j|$，距离越远惩罚越大。

## 三、数学形式

$b_{ij}=-m\cdot|i-j|$，$m$ 为每头固定的斜率（按头索引几何递减），无可学习位置嵌入。

## 四、代码实现

```python
mask = -m[:, None, None] * torch.arange(L)[None, None, :].abs()
scores = q @ k.T / d ** .5 + mask
```

## 五、与其他对比

- 相比正弦/RoPE，ALiBi 无位置嵌入，外推几乎“免费”。
- 与 RoPE 相比牺牲一定内插能力，但外推更稳。

## 六、常见误区

- 斜率 $m$ 各头相同致行为单一；应每头不同（几何序列）。
- 误把 ALiBi 当位置编码加到嵌入；它只进 score 偏置。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- ALiBi 如何实现“训短测长”？答：线性距离偏置不绑定绝对位置，推理更长只扩大惩罚范围。

## 九、演进

绝对编码 → 相对偏置 → ALiBi（无位置嵌入外推）→ 与 RoPE 外推法并存。

## 十、小结

ALiBi 用无参数线性距离偏置实现强外推，是长度泛化的代表性方案。
