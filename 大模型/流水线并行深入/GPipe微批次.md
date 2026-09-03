# GPipe 与微批次

> 对应 Huang et al., 《GPipe》, 2018。

## 一、背景与挑战

同步流水需保证数值等价于大批次，同时隐藏气泡。

## 二、核心原理

GPipe 把 mini-batch 分成 $m$ 个微批次，前向全部完成后才反向；每个微批次独立穿过各阶段，梯度在阶段内累积，等价于大批次梯度。

## 三、数学形式

累积梯度 $\nabla=\sum_{j=1}^m \nabla_j$，等价于对 $m$ 个微批次求平均的大批次 SGD。

## 四、代码实现

```python
grads = [0]*m
for j, mb in enumerate(micro_batches):
    grads[j] = stage.backward(stage.forward(mb))
total = sum(grads) / m
```

## 五、与其他对比

- 与 PipeDream 1F1B 相比气泡更大但实现简单、数值等价清晰。
- 与 数据并行深入 的梯度累积类似。

## 六、常见误区

- 微批次过多升内存（同时持多份激活）。
- 误以为 GPipe 反向也全流水（实际先全前向后全反向）。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- GPipe 为何数值等价于大批次？答：微批次梯度求和等价于大批次平均梯度。

## 九、演进

单微批 → 多微批累积 → 与重计算结合。

## 十、小结

GPipe 以微批次累积保等价，实现简单但气泡大。
