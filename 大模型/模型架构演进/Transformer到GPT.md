# 从 Transformer 到 GPT

> 见「Transformer深入」「从零实现GPT」。

## 一、背景与挑战

原始 encoder-decoder 复杂。GPT 取 decoder-only 因果结构，更适合生成与规模化。

## 二、核心原理

堆叠 Pre-Norm 解码层 + 因果掩码 + 位置编码，自回归预训练。

## 三、关键要点

- decoder-only 易 scaling。
- KV Cache 友好。

## 四、与开源书对应

- Radford et al., GPT-1/2/3.

## 五、面试题

- GPT 为何选 decoder-only？

## 六、小结

架构简化是 LLM 规模化的关键决策。
