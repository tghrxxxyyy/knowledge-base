# 幂律与 Chinchilla 最优

> 对应 Hoffmann et al., *Training Compute-Optimal Large Language Models*, 2022.

## 一、背景与挑战

Kaplan 等早期认为模型越大越好；Chinchilla 指出在固定算力下参数与数据应约等比例增长，而非一味加参数。

## 二、核心原理

固定训练算力 $C$，最优分配满足 $N_{opt}\approx 20\,C^{0.5}$，$D_{opt}\approx 20\,C^{0.5}$（以 token 计），即参数量与数据量同量级缩放。

## 三、数学形式

最小化 $L(N,D)$ s.t. $6ND\approx C$ 得 $N_{opt}\propto C^{0.5},\,D_{opt}\propto C^{0.5}$；Chinchilla 70B 用 1.4T token 优于更大但数据少的模型。

## 四、代码实现

```python
C = 1e24                     # FLOPs
N_opt = 20 * C**0.5
D_opt = 20 * C**0.5          # tokens
```

## 五、与其他对比

- 与 训练算力估算深入（由 C 反推 N、D）直接衔接。
- 与 数据缩放定律总览 互补。

## 六、常见误区

- 误以为 Chinchilla 主张“小模型”；实为“同等算力下更优分配”。
- 忽略其基于固定算力前提。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- Chinchilla 与 Kaplan 结论差异？答：Chinchilla 强调固定算力下参数与数据平衡，而非只增参数。

## 九、演进

Kaplan（偏大）→ Chinchilla（平衡）→ 数据受限再权衡。

## 十、小结

Chinchilla 确立了“算力在参数与数据间平衡”的训练最优分配原则。
