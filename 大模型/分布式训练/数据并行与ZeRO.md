# 数据并行与 ZeRO

> 对应 Rajbhandari et al. 2020（ZeRO: Memory Optimizations Toward Training Trillion Parameter Models）、DeepSpeed 与 PyTorch FSDP。

## 一、背景与挑战

数据并行（Data Parallelism, DP）是最直观的扩展方式：每张卡持有完整模型副本，喂不同数据分片，反向后对各卡梯度做 all-reduce 求平均再各自更新。问题是：每张卡都冗余存**完整权重 + 梯度 + 优化器状态**，当模型达百亿/千亿参数时，光优化器状态（Adam 的动量+方差）就占掉绝大部分显存，DP 因此无法扩展到超大模型。ZeRO（Zero Redundancy Optimizer）由 Rajbhandari 等人提出，通过把优化器状态/梯度/参数**分片**到各卡，消除冗余，使显存随卡数近线性下降。

## 二、核心原理

ZeRO 三阶段逐步增强分片粒度：

- **ZeRO-1**：仅分片**优化器状态（OS）**，每张卡只持自己那 1/N 的动量/方差；梯度与参数仍全冗余。
- **ZeRO-2**：+ **梯度（G）分片**，反向后只保留本卡负责的平均梯度，进一步省显存。
- **ZeRO-3**：+ **参数（P）分片**，每张卡只持 1/N 参数；前向/反向需要时通过 all-gather 临时拼出完整参数，用完即弃。

显存随卡数 $N$ 近线性下降，从而能训练远超单卡容量的模型。PyTorch FSDP（Fully Sharded Data Parallel）是 ZeRO-3 思想的官方实现；DeepSpeed ZeRO 提供 1/2/3 全阶段。

ZeRO 的收益来自「消除逐卡冗余」而非「减少总计算」。普通 DP 每卡都完整持有优化器状态，而这恰恰是显存大头：Adam 除 fp16 参数/梯度外，还要为每参数存 fp32 主副本、一阶动量、二阶方差，合计约 $12\Phi$ 字节的优化器状态，远超参数本身。ZeRO-1 把这部分按卡分片后，单卡只担 $1/N$，立竿见影；ZeRO-2 进一步把梯度也分片（反向完后只保留本卡负责的平均梯度，其它卡的梯度可丢弃）；ZeRO-3 再把参数分片，前向/反向需要时 all-gather 拼出完整参数、用完即弃。

需要厘清：ZeRO 仍是数据并行家族，每卡仍处理不同数据分片、仍做梯度同步，只是「存什么」从「全冗余」变成「分片」。因此它会引入额外通信——ZeRO-3 的 all-gather 与分片梯度聚合，比普通 DP 的梯度 all-reduce 更频繁。为掩盖开销，DeepSpeed/FSDP 都支持「通信与计算重叠（overlap）」：在反向计算本层时，提前异步 all-gather 下一层的参数、异步 reduce-scatter 本层的梯度，使通信隐藏在算力之后。ZeRO-Offload 还能把分片后的优化器状态卸载到 CPU/NVMe，用主机内存换 GPU 显存，从而在更少卡上训更大模型，代价是主机-设备搬运的带宽。

## 三、形式化与数学基础

参数量 $\Phi$。Adam 优化器状态约 $12\Phi$ 字节：fp32 主参数 $4\Phi$ + 动量 $4\Phi$ + 方差 $4\Phi$（另有 fp16 梯度/参数约 $2\Phi$）。普通 DP 每卡显存约 $16\Phi$。

ZeRO 分片后单卡优化器状态均摊到 $N$ 卡，单卡节省约 $N$ 倍：

$$\text{DP 每卡}: \approx 16\Phi;\qquad \text{ZeRO-3 每卡}: \approx \frac{16\Phi}{N} + \text{通信临时副本}$$

ZeRO-3 前向所需参数通过 all-gather 恢复：

$$W = \text{all-gather}\big(\{W^{(r)}\}_{r=1}^{N}\big),\quad W^{(r)}\ \text{为本卡分片}$$

更新后再丢弃完整 $W$，只留分片，故峰值显存略高于稳态但远低于全冗余。

## 四、代码实现

DeepSpeed ZeRO 配置（节选）：

```json
{
  "zero_optimization": {
    "stage": 3,
    "offload_optimizer": {"device": "none"},
    "overlap_comm": true
  }
}
```

PyTorch FSDP（ZeRO-3 等价）：

```python
from torch.distributed.fsdp import FSDP
model = FSDP(model, sharding_strategy="FULL_SHARD")  # 参数/梯度/优化器全分片
```

## 五、与其他技术对比

| 阶段 | 分片内容 | 显存 | 通信 |
|------|---------|------|------|
| 普通 DP | 无 | 高 | 梯度 all-reduce |
| ZeRO-1 | 优化器状态 | 中 | + 状态分发 |
| ZeRO-2 | +梯度 | 低 | 同 |
| ZeRO-3 | +参数 | 很低 | + all-gather |

## 六、常见误区

- 以为 ZeRO 是「新并行维度」，实则仍属数据并行家族，只是消除冗余。
- ZeRO-3 误以为全无通信开销，实际 all-gather 频繁、带宽敏感。
- 卡数 $N$ 小于分片粒度需求时收益有限。
- 与 TP/PP 混用时未规划通信拓扑，跨节点 all-gather 成瓶颈。

## 七、与开源书·权威来源对应

- Rajbhandari et al., 2020, *ZeRO: Memory Optimizations Toward Training Trillion Parameter Models*。
- DeepSpeed 文档：https://github.com/microsoft/DeepSpeed
- PyTorch FSDP 文档（对应 ZeRO-3）。
- 以官方最新文档为准。

## 八、面试题

- ZeRO-3 相比 ZeRO-1 多分片了什么？显存为何近线性下降？
- FSDP 与 DeepSpeed ZeRO 的对应关系？
- ZeRO 为何仍需要 all-gather 通信？

## 九、演进与趋势

ZeRO 之后有 ZeRO-Offload（把优化器状态卸载到 CPU/ NVMe 省 GPU 显存）、ZeRO-Inference，以及 FSDP2、DTensor 等更现代的完全分片实现，进一步降低超大模型训练门槛。

## 十、小结

数据并行通过 ZeRO 消除「优化器状态/梯度/参数」的逐卡冗余，使显存随卡数近线性下降，是训练超大模型的主力。ZeRO-3 与 FSDP 把参数也分片，配合 all-gather 按需拼装，是当今大模型训练的标配。
