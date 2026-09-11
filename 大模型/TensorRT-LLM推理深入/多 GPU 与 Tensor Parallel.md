# 多 GPU 与 Tensor Parallel

> 对应 Shoeybi 2019《Megatron-LM》张量并行研究，以及 NVIDIA/TensorRT-LLM、Ainslie 2023《GQA》等并行与注意力工作。

## 一、背景与挑战

单卡显存（如 80GB HBM）与算力不足以容纳并快速服务百亿/千亿模型：仅权重就超显存，激活与 KV cache 还需空间。需多卡并行。TRT-LLM 在构建期按并行策略把层切分到多 GPU，运行期用 NCCL 集合通信同步。

挑战：(1) 切分后通信开销；(2) 节点内 NVLink 与跨节点 IB 带宽差巨大；(3) 并行度与延迟权衡；(4) 与量化、批处理的组合正确性。

## 二、核心原理

张量并行（TP）把每层权重按隐藏维切分，各卡算局部结果再 all-reduce。对 GEMM $Y = XW$，列切分 $W=[W_1,\dots,W_t]$，每卡算 $Y_i = XW_i$，再 all-reduce 求和。注意力头也可按头切分（各卡算部分头）。层并行（PP）则按层切到不同卡，形成流水线。

TRT-LLM 用 `Mapping` 描述 world_size/tp_size/pp_size，builder 生成分片引擎；运行期 all-reduce 被隐藏在层内计算之后（通信/计算重叠）。GQA 因 KV 头少，TP 下 KV 通信更小。

TP 的通信发生在每个 transformer 层内：注意力与 MLP 各自的列/行切分 GEMM 后都需要 all-reduce 汇合。为隐藏通信，TRT-LLM 把 all-reduce 拆成「归约计算」与「通信」两段，让下一层的部分计算与本次通信重叠（compute-communication overlap），从而 NVLink 带宽足以掩盖大部分延迟。实际切分时还有若干约束：TP 度必须整除隐藏维度 d 与注意力头数 h，否则无法均匀切分；embedding 与 lm_head 通常也按词表维切分。当模型扩展到跨节点，纯 TP 的 all-reduce 要走 IB（约 50GB/s）而非 NVLink（约 400GB/s+），通信成为瓶颈，此时应降 TP、升 PP，并用 expert 并行处理 MoE。并行策略的选取本质是拓扑优化问题：节点内用 TP 低延迟、跨节点用 PP 减少通信量、MoE 用 EP 分摊专家。TRT-LLM 提供 Mapping 显式声明，也可用自动并行搜索按实测延迟给出最优组合。需要提醒，TP 与 PP 可嵌套（如 TP=4 组内、PP=2 跨组），形成 2D 并行，但维度越多调度越复杂，应以实测吞吐为准而非盲目堆叠并行度。

TP 的通信发生在每个 transformer 层内：注意力与 MLP 各自的列/行切分 GEMM 后都需要 all-reduce 汇合。
为隐藏通信，TRT-LLM 把 all-reduce 拆成「归约计算」与「通信」两段，让下一层的部分计算与本次通信重叠。
节点内 NVLink 带宽约 400GB/s+，足以掩盖大部分 all-reduce；跨节点走 IB 约 50GB/s，通信成为瓶颈。
实际切分时 TP 度必须整除隐藏维度 d 与注意力头数 h，否则无法均匀切分。
embedding 与 lm_head 通常也按词表维切分，避免单卡存不下整张大模型输出层。
当模型扩展到跨节点，纯 TP 的 all-reduce 要走 IB，此时应降 TP、升 PP，并用 expert 并行处理 MoE。
PP 把层切到不同卡形成流水线，需 micro-batch 填充以减少流水线气泡（bubble）。
并行策略选取本质是拓扑优化：节点内 TP 低延迟、跨节点 PP 减通信量、MoE 用 EP 分摊专家。
TRT-LLM 提供 Mapping 显式声明 world_size/tp_size/pp_size，也可用自动并行搜索按实测延迟给最优组合。
维度越多调度越复杂，应以实测吞吐为准而非盲目堆叠并行度。
通信重叠之外，还可使用「通信压缩」（如 FP8 all-reduce）进一步降带宽，但需评估精度影响。
故障容忍上，多卡训练/推理需处理单卡掉线，生产常配合健康检查与快速重建分片。

## 三、形式化与数学基础

列切分（Megatron 式）：

$$Y = [XW_1,\dots,XW_t], \quad W_i \in \mathbb{R}^{d\times (d/t)}$$

每卡持有 $W_i$，前向：

$$Y_i = XW_i,\quad Y = \sum_{i=1}^{t} \mathrm{all\_reduce}(Y_i)$$

行切分用于后续层输入已分片的场景，需在 GEMM 前 all-reduce。通信量每步约正比于分片维度，NVLink 带宽（数百 GB/s）可掩盖，跨节点则成瓶颈。

## 四、代码实现

```python
from tensorrt_llm import Mapping
from tensorrt_llm.builder import build

mapping = Mapping(world_size=4, tp_size=4, pp_size=1)
# builder 据 mapping 把权重分片并生成 4 卡引擎
engine = build(model, mapping=mapping, max_batch_size=64)
# 运行期由 trtllm 启动 4 进程，各加载对应分片，NCCL 同步
```

注意：tp_size 必须整除隐藏维与头数；跨节点部署应降 tp、升 pp 以减 IB 通信，常用节点内 NVLink TP + 跨节点 PP。

## 五、与其他技术对比

| 并行 | 切分对象 | 通信 | 延迟 | 适用 |
|------|----------|------|------|------|
| TP | 层内权重 | 频繁 | 低(内) | 节点内 |
| PP | 层 | 少 | 微气泡 | 跨节点 |
| DP | 数据 | 梯度 | 中 | 多副本 |
| 专家并行 | MoE | 中 | — | MoE |

## 六、常见误区

- 认为 TP 越大越好：跨节点 TP 通信成本高，需 NVLink 支撑。
- 忽视头数整除：TP 须整除注意力头数，否则无法切分。
- 混淆 PP 气泡：纯 PP 有流水线气泡，需 micro-batch 填。
- 把 DP 当并行加速：DP 主要提吞吐非降单请求延迟。

## 七、与开源书·权威来源对应

- Shoeybi et al. 2019《Megatron-LM》——张量/流水并行奠基。
- NVIDIA/TensorRT-LLM Mapping 与并行文档。
- Ainslie et al. 2023《GQA》——减少 KV 以降 TP 通信。

## 八、面试题

- TP 与 PP 如何选？节点内/跨节点策略有何不同？
- Megatron 列切分为何需要 all-reduce？
- TP 度受哪些因素约束？

## 九、演进与趋势

自动并行策略搜索按拓扑给出最优 TP/PP/EP 组合；稀疏专家并行（MoE）与通信重叠进一步优化大模型服务。具体以官方最新文档为准。

TP 与 PP 的组合需结合硬件拓扑实测，理论最优未必等于实测最优。
在单节点多卡（NVLink 全互联）下，TP 通常是最直接且高效的并行选择。
跨节点则务必引入 PP 或 EP，否则通信开销会吞噬并行带来的算力收益。

## 十、小结

多 GPU 并行是 TRT-LLM 服务大模型的必需。TP 为主、PP 为辅：节点内用 TP 低延迟，跨节点用 PP 减通信，二者配合 NCCL 重叠通信方能高效扩展。
