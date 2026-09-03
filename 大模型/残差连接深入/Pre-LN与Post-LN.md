# Pre-LN 与 Post-LN

> 见「残差连接深入/残差连接总览」；Transformer 归一化位置。

## 一、背景与挑战

归一化放哪，严重影响深层稳定性。

## 二、核心原理

- **Post-LN**（原 Transformer）：先子层再加残差后 LayerNorm，深层易梯度爆炸（需 warmup）。
- **Pre-LN**：先 LayerNorm 再子层，再加残差，梯度更稳定，便于深训与去掉 warmup（现代大模型多用，如 GPT-3 后）。

## 三、数学形式

Pre-LN: `x = x + Sublayer(LN(x))`；Post-LN: `x = LN(x + Sublayer(x))`。

## 四、代码实现

```python
x = x + attn(LN(x))   # Pre-LN
```

## 五、关键要点

- Pre-LN 训练更稳、warmup 可减。
- 推理等价，仅训练差异。

## 六、与其他对比

- Post-LN 需强 warmup；Pre-LN 稳。

## 七、常见误区

- 二者等价——训练动态不同。

## 八、与开源书对应

- Xiong et al., *On Layer Normalization*, 2020.
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 九、面试题

- Pre-LN 相比 Post-LN 优势？

## 十、演进

Post-LN → Pre-LN → 变体（DeepNorm）。

## 十一、小结

归一化位置，是深训的「稳压器」。
