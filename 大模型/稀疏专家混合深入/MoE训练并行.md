# MoE 训练并行

> 对应 Rajbhandari et al., *DeepSpeed-MoE*, 2022 与 Shoeybi et al., *Megatron-LM*, 2019，专家并行综述见 Fedus et al., *Switch Transformers*, 2022。

## 一、背景与挑战

MoE 的总参数量巨大，单卡放不下全部专家；同时每个 token 只激活少数专家，这意味着「谁算哪个 token」在设备间是动态变化的。把专家分布到多卡后，token 必须先被发送到持有目标专家的设备、算完再收回，由此产生大量跨设备通信。

如何在「参数分片」与「通信开销」之间取得平衡，是 MoE 训练并行的核心，也决定了 MoE 能否从论文走向千卡集群。通信若不被妥善隐藏，MoE 的训练吞吐可能反而不如稠密模型。

## 二、核心原理

MoE 训练通常组合三种并行：

- **专家并行（Expert Parallelism, EP）**：不同专家放在不同设备，token 经 **all-to-all** 集合通信分发到专家所在设备，计算完再 all-to-all 收回。
- **数据并行（Data Parallelism, DP）**：同一专家在多卡各有副本，不同微批次并行。
- **张量 / 流水线并行**：用于非专家部分（注意力、嵌入）的切分。

整个流程是：门控在本地算出每个 token 的目标专家 → all-to-all 把 token 按目标专家聚到对应设备 → 各设备只对本地专家做前馈 → all-to-all 把结果发回原设备。

专家容量限制能减少每个设备需接收的 token 数，从而降低通信量。EP 与 DP 常嵌套：设备既按专家分片，又按数据副本，形成 2D 并行网格。

## 三、形式化与数学基础

设设备数为 $D$，每设备持有 $E/D$ 个专家。对 token $x$ 路由到专家 $e(x)$，其在设备 $d = e(x) \bmod D$ 上计算。all-to-all 的总通信量约为：

$$ Comm \approx 2 \cdot T \cdot h \cdot (D - 1) / D $$

其中 $T$ 为 token 数、$h$ 为隐维度。可见设备数越多，跨设备分发越频繁，通信占比越高。

容量 $C$ 限制每设备每步处理的 token 上限：

$$ tokens\_per\_device \le C \cdot (E/D) $$

从而降低单步通信峰值。通信与计算的重叠（overlap）可进一步隐藏这部分延迟。

## 四、代码实现

```python
import torch
import torch.distributed as dist

# 简化的专家并行分发（示意，真实实现用 all_to_all_single）
def expert_parallel_forward(x, gate_idx, expert_fn, num_experts, world_size):
    order = torch.argsort(gate_idx)          # 按目标专家排序
    x_sorted = x[order]
    # dist.all_to_all_single(input_buf, output_buf)  # 发往持有目标专家的设备
    local_out = expert_fn(x_sorted)          # 本地专家计算
    out = torch.empty_like(local_out)
    # dist.all_to_all_single(out, local_out) # 收回结果
    return out[torch.argsort(order)]         # 还原原顺序

# EP + DP 嵌套：设备网格 (dp, ep)，rank = dp_idx * ep_size + ep_idx
```

## 五、与其他技术对比

| 并行策略 | 显存 | 通信 | 适用 |
| --- | --- | --- | --- |
| 纯数据并行 | 每卡全专家 | 低（仅梯度） | 小 MoE |
| 专家并行 | 每卡部分专家 | 高（all-to-all） | 大 MoE |
| EP + DP + TP 混合 | 最优 | 中 | 超大规模 |

结论：模型越大越需要 EP，但 EP 的通信代价需用混合并行与 overlap 抵消。

## 六、常见误区

- 认为 MoE 通信轻：all-to-all 是 MoE 的主要瓶颈，常比稠密模型的通信更重。
- 认为专家并行可无限扩展：设备数增多使每步跨设备分发更频繁，通信开销非线性上升。
- 忽略容量对通信的影响：容量裁剪能显著降低单步通信峰值。
- 认为 DP 与 EP 可随意组合：二者需与拓扑、微批次大小协同，否则 all-to-all 与梯度同步互相阻塞。

## 七、与开源书·权威来源对应

- Rajbhandari et al., *DeepSpeed-MoE*, 2022：专家并行与 ZeRO 组合。
- Shoeybi et al., *Megatron-LM*, 2019：张量 / 流水线并行基础。
- Fedus et al., *Switch Transformers*, 2022：MoE 分布式训练综述。

## 八、面试题

- MoE 训练的通信瓶颈？答：all-to-all 集合通信在设备间分发 / 回收 token，是主要开销。
- 如何降低 MoE 通信？答：用专家容量裁剪、合并微批次、与 DP/TP 混合减少跨设备频率。
- EP 与 DP 区别？答：EP 按专家分片参数，DP 按数据复制参数。
- 为何要 EP+DP 嵌套？答：单靠 EP 显存仍不够，叠加 DP 复制非专家部分并分摊专家副本。

## 九、演进与趋势

纯数据并行 → 专家并行 → EP/DP/TP 三维混合并行；并结合通信计算重叠（overlap）、专家放置优化与拓扑感知路由进一步压低通信占比。

稀疏化 all-to-all（只传非零路由）是热点：用稀疏通信内核把空位 token 跳过，显著降低实际传输量。

在千卡集群上，MoE 并行的工程要点可归纳为：先按单卡显存上限决定专家并行度，再用数据并行填满其余设备，张量并行仅用于超大的非专家层。

把 all-to-all 与专家计算做 overlap，并以专家容量裁剪通信峰值，是压住瓶颈的两个关键手段。监控指标应覆盖每专家负载、丢弃率与 all-to-all 耗时，三者任一异常都预示路由或并行配置失配。

调试技巧上，可先在小规模关掉容量限制观察真实负载分布，再据此设容量因子；通信瓶颈可用 NCCL 的 all-to-all 计时单独 profiling，避免与计算时间混淆。

切忌在未确认均衡前盲目增大专家数，否则通信与失衡会同时恶化。合理的起点是 EP 度等于设备数的一半，再逐步上调观察吞吐拐点。

## 十、小结

MoE 训练并行的难点在于 all-to-all 通信，工程上以专家并行为主、配合数据 / 张量并行与容量裁剪，在显存与通信间求得平衡，并通过重叠隐藏延迟。
