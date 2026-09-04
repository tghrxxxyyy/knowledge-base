# MoE推理优化与专家并行

> 对应 google/switch-transformer; Megatron-LM EP。

## 一、背景与挑战
MoE 推理时所有专家权重需加载到显存，参数总量巨大。需专家并行（EP）将专家分布到多卡。

## 二、核心原理
专家并行：每张 GPU 持有部分专家，所有 GPU 持有全部非专家参数。token 经 all-to-all 通信路由到对应专家所在 GPU。

## 三、形式化与数学基础
设 $N$ 专家分布在 $P$ 张 GPU 上（每 GPU $N/P$ 专家）。每 token 路由后需 all-to-all 通信量为 $O(Bd)$，其中 $B$ 是 token 数。

## 四、代码实现
```python
# 专家并行的 all-to-all
scores = gate(x)  # (B, N)  本地
topk = scores.topk(k, dim=-1)
# 准备分发
send_buffers = [x[topk.indices[:, i]==e] for e in range(N)]
# all-to-all
recv_buffers = distributed.all_to_all(send_buffers)
# 本地专家处理
```

## 五、与其他技术对比
- vs 张量并行：EP 切专家，TP 切每个专家内部。
- vs 流水线并行：EP 切路由，PP 切层。

## 六、常见误区
- all-to-all 通信开销大，需与计算重叠。
- 专家分布不均时某些 GPU 过载。

## 七、与开源书/权威来源对应
- google/switch-transformer。
- NVIDIA/Megatron-LM 专家并行。
- d2l-ai/d2l-zh 第12章分布式训练。

## 八、面试题
- 专家并行的通信瓶颈？答：all-to-all，依赖 NVLink 拓扑。

## 九、演进与趋势
张量并行 → 专家并行 → 专家+张量混合并行。

## 十、小结
专家并行是 MoE 大规模部署的关键，需高效 all-to-all 实现。
