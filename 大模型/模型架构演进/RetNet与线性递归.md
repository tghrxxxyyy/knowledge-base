# RetNet 与线性递归

> 对应 Sun et al.(2023)。

## 一、背景与挑战

RetNet 提出多尺度 retention 机制，兼顾并行训练(分块)与串行推理(递归、恒定内存)，尝试统一训练/推理效率。

## 二、核心原理

retention 用指数衰减的递归 + 可并行 chunkwise 训练。

## 三、关键要点

- 推理无 KV Cache 膨胀。
- 训练并行化需技巧。

## 四、与开源书对应

- Sun et al., *Retentive Network (RetNet)*, 2023.

## 五、面试题

- RetNet 如何兼顾训练并行与推理高效？

## 六、小结

线性递归类(SSM/RetNet)挑战 Transformer 的序列效率垄断。
