# Mamba2架构

> 对应 Dao & Gu, Mamba2, 2024（基于 SSD 重构的 Mamba 第二版，状态维更大、与注意力对偶更紧）。

## 一、背景与挑战

Mamba1 状态维 $N$ 小、表达受限；Mamba2 借 SSD 把状态维放大到与头维相当，并统一多头视角。

## 二、核心原理

把 SSM 写成“多值/多头”形式：类似注意力多头，每个头持一份状态，整体可视为结构化线性注意力，便于复用注意力内核。

## 三、数学形式

$y=\sum_j (C_i^\top A_{i:j} B_j) u_j$，多头时对 $h$ 维分头并行，等价于 heads 个半可分注意力。

## 四、代码实现

```python
y = ssd_forward(x, A, B, C, dt, chunk_size)  # 复用类注意力内核
```

## 五、与其他对比

- 相比 Mamba1 状态维更大、吞吐更高、质量更优。
- 与 选择性状态空间模型深入 中 Mamba1 是同一族的前后两代。

## 六、常见误区

- 把 Mamba2 当全新模型；它是 Mamba 的 SSD 重述与放大。
- 忽略 chunk_size 对显存与速度的敏感影响。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- Mamba2 相对 Mamba1 改进？答：SSD 重述、放大状态维、多头对偶，吞吐与质量双升。

## 九、演进

Mamba1 → Mamba2(SSD) → 与注意力内核融合。

## 十、小结

Mamba2 借 SSD 与多头对偶，把选择性 SSM 推向更高效可扩展。
