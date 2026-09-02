# FlashAttention 原理

> 对应 Dao et al., *FlashAttention*, 2022；进阶见 v2/v3。

## 一、背景与挑战

标准注意力需物化 N×N 注意力矩阵，显存与带宽成大瓶颈。

## 二、核心原理

用分块（tiling）在 SRAM 内计算 softmax 与输出，避免写回大矩阵；结合 online softmax 与重计算，降显存、提速度。

## 三、数学形式

online softmax 维护 running max/sum：

```
m_i = max(m_{i-1}, rowmax(QK^T_i)); l_i = e^{m_{i-1}-m_i} l_{i-1} + e^{-m_i} rowsum_i
```

## 四、代码实现

```python
from flash_attn import flash_attention_qkv
out = flash_attention_qkv(q, k, v)
```

## 五、关键要点

- 显存从 O(N^2) 降到 O(N)。
- 更快因少 HBM 访存。

## 六、与其他对比

- 标准注意物化矩阵；FA 分块不物化。

## 七、常见误区

- FA 改变数学结果——只是数值等价更稳。

## 八、与开源书对应

- FlashAttention: https://github.com/Dao-AILab/flash-attention
- llm-course: https://github.com/mlabonne/llm-course

## 九、面试题

- FlashAttention 为何更快更省显存？

## 十、演进

v1 → v2(并行) → v3(Hopper)。

## 十一、小结

FA 是现代 LLM 训练推理基石。
