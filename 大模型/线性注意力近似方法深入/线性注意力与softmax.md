# 线性注意力与softmax对比

> 综合 Katharopoulos 2020、Performer 2020；本篇量化两种注意力的权衡。

## 一、背景与挑战

需明确线性近似在哪些性质上弱于 softmax，避免盲目替换导致质量崩。

## 二、核心原理

softmax 提供稀疏尖锐分布与归一化；线性注意力是低秩平滑近似，缺显式 softmax 的“聚焦”能力，但可递推（即 RNN）。

## 三、数学形式

误差主要来自秩：$|\mathrm{softmax}(QK^\top)- \phi(Q)\phi(K)^\top|_F$ 随特征维/秩变化；线性注意力等价于秩受限注意力。

## 四、代码实现

```python
soft = softmax(q @ k.T / d ** .5) @ v
lin  = phi(q) @ (phi(k).T @ v)
```

## 五、与其他对比

- 线性注意力可写成 RNN（隐状态 $S=\sum \phi(k_j)v_j^\top$），利于自回归。
- 与 状态空间对偶与Mamba2深入 同具递推性，但 SSM 额外带状态维结构。

## 六、常见误区

- 在强需稀疏聚焦任务（如精确复制）上直接用线性注意力失败。
- 误以为线性注意力无需位置编码；仍要（见 位置编码统一理论深入）。

## 七、与开源书对应

- harvardnlp/annotated-transformer：https://github.com/harvardnlp/annotated-transformer
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- 线性注意力弱于 softmax 在哪？答：低秩平滑近似缺 softmax 的稀疏聚焦，精细交互较弱。

## 九、演进

softmax 主导 → 线性近似 → 混合（部分头线性、部分 softmax）。

## 十、小结

线性注意力以低秩平滑换线性复杂度，质量在聚焦型任务上需谨慎。
