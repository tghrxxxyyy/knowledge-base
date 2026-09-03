# Megatron 3D 并行

> 对应 Korthikanti et al., 2022（Megatron-LM 训练系统）。

## 一、背景与挑战

在千亿到万亿参数规模保持高 MFU（模型算力利用率）。

## 二、核心原理

Megatron 用 TP+PP+DP，配合序列并行与选择性重计算；PP 用 1F1B 交错调度；TP 与 SP 同组；DP 用梯度桶重叠。

## 三、数学形式

MFU $\approx \frac{\text{模型 FLOPs}}{\text{硬件峰值}\cdot \text{时间}}$；目标 >40%。

## 四、代码实现

```python
model = megatron_parallelize(model,
    tp=8, pp=4, dp=dp_size, sp=True)
schedule = Interleaved1F1B(model, micro_batches)
```

## 五、与其他对比

- 与 DeepSpeed ZeRO 路线互补（Megatron 重 TP/PP）。
- 与 专家并行深入 可加 MoE。

## 六、常见误区

- 微批数不足致 PP 气泡大。
- 重计算策略过激降 MFU。

## 七、与开源书对应

- d2l-zh：https://github.com/d2l-ai/d2l-zh
- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch

## 八、面试题

- Megatron 如何提 MFU？答：TP/PP 布局+1F1B+重计算+通信重叠综合优化。

## 九、演进

TP → TP+PP → 3D+SP+重计算。

## 十、小结

Megatron 3D 是工业界训大模型主流系统。
