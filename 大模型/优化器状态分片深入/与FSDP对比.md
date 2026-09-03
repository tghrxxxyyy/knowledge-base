# ZeRO 与 FSDP 对比

> 对应 Zhao et al., *PyTorch FSDP*, 2023；与 优化器状态分片总览深入 衔接。

## 一、背景与挑战

ZeRO（DeepSpeed）与 FSDP（PyTorch 原生）实现同源思想，需理解差异做选型。

## 二、核心原理

两者都做参数/梯度/优化器状态分片+all-gather；FSDP 以包装器形式集成进 PyTorch 生态。

## 三、数学形式

通信量二者近似：前向 all-gather 参数、后向 reduce-scatter 梯度，均为 $O(\Phi)$ 每步。

## 四、代码实现

```python
model = FSDP(model, sharding_strategy=ShardingStrategy.FULL_SHARD)
```

## 五、与其他对比

- ZeRO 功能更全（offload、CPU 优化器、调度），FSDP 原生易用。
- 与 数据并行深入 共享通信原语。

## 六、常见误区

- 认为 FSDP 完全等价 ZeRO，部分高级特性（如特定 offload）不同。
- 忽略 wrapping 粒度影响通信效率。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- d2l-zh：https://github.com/d2l-ai/d2l-zh

## 八、面试题

- ZeRO 与 FSDP 关系？答：同一分片思想，ZeRO 在 DeepSpeed，FSDP 是 PyTorch 原生实现。

## 九、演进

ZeRO → FSDP 原生 → 统一分片标准。

## 十、小结

ZeRO 与 FSDP 同源，选型看生态与高级特性需求。
