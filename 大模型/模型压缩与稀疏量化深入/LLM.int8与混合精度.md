# LLM.int8与混合精度

> 对应 Dettmers et al., *LLM.int8()*, 2022（NeurIPS）；Dettmers et al., *QLoRA*, 2023。

## 一、背景与挑战

Transformer 存在大幅值离群特征（outlier），直接 INT8 量化这些列误差巨大。

## 二、核心原理

LLM.int8 把矩阵乘分为离群（FP16 精确）与常规（vector-wise 量化到 INT8）两部分分别计算再合并；QLoRA 用 4bit NF4 + 分页优化器微调。

## 三、数学形式

vector-wise 量化：$q = \text{round}((W - \text{mean}(W))/\|W\|_\infty \cdot 127)$；离群列阈值由 $|x|>\alpha$ 判定。

## 四、代码实现

```python
outlier = (x.abs() > alpha)
y = int8_mm(x[~outlier]) + fp16_mm(x[outlier])
```

## 五、与其他对比

- 与 GPTQ/AWQ（权重量化）不同，LLM.int8 侧重激活离群处理。
- 与 低比特训练与推理深入（训练用）衔接。

## 六、常见误区

- 忽略离群使 INT8 退化严重。
- NF4 仅用于权重，激活仍需特殊处理。

## 七、与开源书对应

- mlabonne/llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- LLM.int8 为何分离离群？答：离群特征幅值远超常规，量化误差大，保留 FP16 可保精度。

## 九、演进

INT8 全量 → LLM.int8（离群分离）→ NF4/QLoRA（4bit 训练）。

## 十、小结

LLM.int8 用离群分离实现 8bit 近无损，是混合精度代表。
