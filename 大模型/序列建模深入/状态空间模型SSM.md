# 状态空间模型 SSM

> 见「状态空间模型深入」与「序列建模深入/序列建模总览」；Gu et al., *S4*, 2021；Gu & Dao, *Mamba*, 2023。

## 一、背景与挑战

Transformer O(N²) 限制超长序列；能否线性复杂度且长程强？

## 二、核心原理

SSM 用连续/离散状态方程建模序列：
```
h'(t) = A h(t) + B x(t);  y(t) = C h(t)
```
离散化（零阶保持）后得递归形式，可并行训练（卷积视角）且推理线性。S4 用对角化 A 高效计算；Mamba 引入输入依赖的选择机制（selective SSM）替代固定 A，达到 Transformer 级性能且线性。

## 三、数学形式

离散：`h_t = Ā h_{t-1} + B̄ x_t`，Ā=(I+ΔA)^{-1} 等近似。

## 四、代码实现

```python
# Mamba 已有官方/社区实现
from mamba_ssm import Mamba
```

## 五、关键要点

- 线性复杂度、长序列友好。
- 选择性机制是关键创新。

## 六、与其他对比

- Transformer O(N²)；SSM O(N)。

## 七、常见误区

- SSM 取代 Transformer——各有场景。

## 八、与开源书对应

- Gu et al., S4, 2021.
- Gu & Dao, Mamba, 2023.
- d2l-zh: https://github.com/d2l-ai/d2l-zh

## 九、面试题

- SSM 相比 Transformer 的核心优势？

## 十、演进

RNN → S4 → Mamba(选择性)。

## 十一、小结

SSM 用「状态方程」读长序列。
