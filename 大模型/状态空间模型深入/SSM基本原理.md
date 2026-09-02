# SSM 基本原理

> 对应 llm-course 与 Gu et al., *S4*, 2021；Mamba 见 Gu & Dao, 2023。

## 一、背景与挑战

Transformer 注意力随序列长平方增长，长序列成本高。SSM 以线性复杂度处理序列。

## 二、核心原理

用连续/离散状态空间方程建模序列：

```
h'(t) = A h(t) + B x(t);  y(t) = C h(t)
```

离散化后（零阶保持）得递归形式，可并行训练、串行推理。

## 三、数学形式

离散化（Δ 为步长）：

```
h_t = A_bar h_{t-1} + B_bar x_t;  A_bar=(I-ΔA)^{-1}; B_bar=ΔA_bar B
```

## 四、代码实现

```python
def ssm_step(h, x, A, B, C, dt):
    return (A * dt).exp() @ h + (B * dt) @ x, C @ h
```

## 五、关键要点

- 线性复杂度 O(N) 内存/时间。
- 可并行扫描训练。

## 六、与其他对比

- 注意力 O(N^2)；SSM O(N)。

## 七、常见误区

- SSM 全面超越 Transformer——某些任务仍弱。

## 八、与开源书对应

- S4: https://github.com/HazyResearch/state-spaces
- llm-course: https://github.com/mlabonne/llm-course

## 九、面试题

- SSM 为何线性复杂度？

## 十、演进

RNN → S4 → S5 → Mamba。

## 十一、小结

SSM 提供长序列高效替代。
