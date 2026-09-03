# ZeRO 优化器（零冗余优化器）

> 对应 Rajbhandari et al., *ZeRO: Memory Optimization*, 2020；NeurIPS（DeepSpeed）。

## 一、背景与挑战

标准数据并行在每卡冗余保存优化器状态（动量/方差）、梯度与参数，显存随模型增大成为瓶颈；ZeRO 消除冗余。

## 二、核心原理

ZeRO 分三阶段：Stage1 分片优化器状态、Stage2 追加分片梯度、Stage3 追加分片参数；每步按需 All-Gather 拼接，通信量近似不变但显存大幅下降。

## 三、数学形式

显存约从 $K_d\times\Psi$（复制）降为 $\frac{\Psi}{N}+\frac{\Psi}{N}+\frac{\Psi}{N}$（分片），其中 $\Psi$ 为单卡所需状态，与标准比省 $N$ 倍。

## 四、代码实现

```python
from deepspeed import initialize
model, opt, _, _ = initialize(model=model, config={"zero_optimization":{"stage":2})
```

## 五、与其他对比

- 与 显存最优调度深入（显存治理）目标一致，ZeRO 是优化器层手段。
- 与 分布式优化器深入 总览互补（ZeRO 是分片实现）。

## 六、常见误区

- Stage3 频繁 All-Gather 参数增通信，需配 CPU offload。
- 误设 offload 致 PCIe 带宽瓶颈。

## 七、与开源书对应

- rasbt/LLMs-from-scratch：https://github.com/rasbt/LLMs-from-scratch
- mlabonne/llm-course：https://github.com/mlabonne/llm-course

## 八、面试题

- ZeRO 三阶段省什么？答：分别分片优化器状态、梯度、参数，阶段越高显存越省但通信越频。

## 九、演进

ZeRO-1 → 2 → 3 → ZeRO-Offload（含 CPU）。

## 十、小结

ZeRO 通过分片消除冗余状态，是显存受限下训练大模型的核心技术。
