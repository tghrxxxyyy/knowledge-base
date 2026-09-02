# P-Tuning 与 Prompt Tuning 对比

> 作为「提示微调与前缀微调」的延伸。

## 一、核心概念

- **P-Tuning**(Liu et al., 2021)：用可训练编码器(如 LSTM/MLP)生成连续提示嵌入，接在输入。
- **Prompt Tuning**(Lester et al., 2021)：直接优化软提示向量，无编码器，更简洁。
- **P-Tuning v2**：把提示加到每一层（类似 Prefix），小模型也有效。

## 二、对比

| 方法 | 提示生成 | 层数 | 小模型表现 |
|------|----------|------|-----------|
| P-Tuning | 编码器 | 输入 | 一般 |
| Prompt Tuning | 直接优化 | 输入 | 需大模型 |
| P-Tuning v2 | 直接优化 | 所有层 | 好 |

## 三、面试题

- 为何大模型下 Prompt Tuning 才接近全参数效果？
