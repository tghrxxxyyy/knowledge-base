# Scaling Law 与涌现能力

> 对应 llm-course 与 Kaplan et al. (2020)、Chinchilla (Hoffmann et al., 2022)。

## 一、核心概念

**Scaling Law**（Kaplan 等，2020）经验表明：模型最终损失 `L` 与参数量 `N`、数据量 `D`、算力 `C` 呈幂律关系：

```
L(N) = (N_c / N)^α + L_0
```

**Chinchilla 定律**（Hoffmann 等，2022）修正：在固定算力下，参数量与数据量应**等比例**增长，最优约为「每参数 20 tokens」。即 7B 模型应训练 ~140B tokens（而非早期 300B 参数配 300B tokens 的浪费）。

**涌现能力(Emergent Abilities)**（Wei 等，2022）：某些能力在模型规模跨过阈值前近乎随机，越过后骤升，如少样本推理、链式思维。

## 二、关键要点

| 结论 | 含义 |
|------|------|
| 幂律 | 损失随规模可预测下降 |
| Chinchilla | 数据≈20×参数 |
| 涌现 | 能力非平滑出现 |

## 三、常见误区

- 认为「更大一定更强」忽略数据配比，Chinchilla 表明欠训练大模型浪费算力。
- 涌现能力部分源于评测指标的突变（非线性度量），非纯模型突变。

## 四、与开源书的对应

- Kaplan et al., *Scaling Laws for Neural Language Models*, 2020.
- Hoffmann et al., *Training Compute-Optimal Large Language Models (Chinchilla)*, 2022.
- llm-course 引用上述结论：https://github.com/mlabonne/llm-course

## 七、面试题

- Chinchilla 定律对「7B 模型该用多少训练数据」给出什么建议？
- 涌现能力是如何被定义的？它一定是模型质变吗？
