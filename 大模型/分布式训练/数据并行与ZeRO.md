# 数据并行与 ZeRO

> 对应 DeepSpeed ZeRO 与 PyTorch FSDP。

## 一、核心概念

普通 DP 每卡存完整模型副本+优化器状态，显存浪费。ZeRO(Rajbhandari et al., 2020)把**优化器状态(OS)/梯度(G)/参数(P)**分片到各卡：

- ZeRO-1：仅分片优化器状态。
- ZeRO-2：+ 梯度分片。
- ZeRO-3：+ 参数分片(前向按需 gather)。

显存随卡数近线性下降。

## 二、数学直觉

参数量 `Φ`，优化器状态(Adam)约 `12Φ` 字节(参数 fp16+动量+方差 fp32)。ZeRO-3 把其均摊到 N 卡，单卡省约 N 倍。

## 三、代码实现（FSDP 示意）

```python
from torch.distributed.fsdp import FSDP
model = FSDP(model, sharding_strategy="FULL_SHARD")
```

## 四、关键要点

| 阶段 | 分片 |
|------|------|
| ZeRO-1 | 优化器状态 |
| ZeRO-2 | +梯度 |
| ZeRO-3 | +参数 |

## 五、与开源书的对应

- Rajbhandari et al., *ZeRO: Memory Optimizations Toward Training Trillion Parameter Models*, 2020.
- DeepSpeed: https://github.com/microsoft/DeepSpeed

## 七、面试题

- ZeRO-3 相比 ZeRO-1 多分片了什么？
