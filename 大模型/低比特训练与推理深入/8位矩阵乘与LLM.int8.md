# 8位矩阵乘与LLM.int8

> 对应 Dettmers et al., *8-bit Matrix Multiplication for Transformers*, 2022（NeurIPS，LLM.int8()）。

## 一、背景与挑战

矩阵乘是 transformer 主要算力；把权重/激活压到 INT8 可近翻倍吞吐，但离群破坏精度。

## 二、核心原理

LLM.int8 用 vector-wise（按行/列）量化 + 离群分离：大幅值维度用 FP16 精确计算，其余 INT8。

## 三、数学形式

行量化尺度 $s_i = \|W_{i:}\|_\infty / 127$；整数 $q_{ij}=\text{round}(W_{ij}/s_i)$。离群由 $|x|>\alpha$ 分离。

## 四、代码实现

```python
q, s = vector_quantize(w)          # INT8 + 尺度
y = dequant(int8_mm(q, s, x))      # 反量化累加
```

## 五、与其他对比

- 与 AWQ/GPTQ（权重量化）定位不同：此处解决激活量化。
- 与 模型压缩与稀疏量化深入 互补。

## 六、常见误区

- 认为所有张量都能直接 INT8；离群必须分离。
- per-tensor 量化对激活误差大，需 vector-wise。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- vector-wise 量化是什么？答：按行/列各自算尺度，比 per-tensor 更精细，降低激活分布差异误差。

## 九、演进

per-tensor → vector-wise → 混合精度+离群。

## 十、小结

LLM.int8 让 8bit 矩阵乘近无损，是低比特推理基础。
