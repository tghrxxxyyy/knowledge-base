# SSM 训练与推理

> 见「状态空间模型深入/SSM基本原理」与「分布式训练」。

## 一、背景与挑战

SSM 需特殊并行与硬件优化才能高效。

## 二、核心原理

训练用并行扫描/卷积；推理用递归步进，硬件感知内核融合提升吞吐（Mamba 的 associative scan）。

## 三、关键要点

- 扫描并行化是训练关键。
- 推理常是瓶颈需在端侧优化。

## 四、代码实现

```python
from mamba_ssm import Mamba
y = Mamba(d_model=768)(x)
```

## 五、与其他对比

- Transformer 推理靠 KV 缓存；SSM 靠状态。

## 六、常见误区

- SSM 推理一定快——实现差也慢。

## 七、与开源书对应

- mamba_ssm: https://github.com/state-spaces/mamba
- llm-course: https://github.com/mlabonne/llm-course

## 八、面试题

- SSM 训练如何并行化？

## 九、演进

递归 → 卷积并行 → 扫描并行。

## 十、小结

高效实现释放 SSM 潜力。
