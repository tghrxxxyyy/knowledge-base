# 量化支持 INT8 与 FP8

> 对应 NVIDIA/TensorRT-LLM 量化文档，以及 Lin 2023《AWQ》、Frantar 2022《GPTQ》等权重量化研究。

## 一、背景与挑战

大模型推理瓶颈常在显存容量与显存带宽：权重与激活占大量 HBM，且每 token 需多次读写权重。量化用更低比特表示权重/激活，可减半甚至更多显存、提升吞吐。代价是数值精度损失，可能带来困惑度上升或任务崩坏。

挑战：(1) 激活存在离群值（outlier），直接低比特量化损失大；(2) 不同层对量化敏感度差异大；(3) 硬件支持决定可行比特（Hopper 原生 FP8，Ampere 主推 INT8）。

## 二、核心原理

TRT-LLM 支持两类量化：weight-only（仅权重量化，如 INT4/INT8，W4A16/W8A16）与 weight+activation（如 FP8 的 W8A8、INT8 的 W8A8）。weight-only 省显存、计算仍在高精度反量化；FP8 利用 Hopper 张量核心做真正的低精度矩阵乘，几乎无损且显著提速。

AWQ/GPTQ 是训练后权重量化（PTQ）算法：AWQ 保护「显著权重」（按激活规模挑重要通道），GPTQ 用二阶信息逐列补偿量化误差。TRT-LLM 可导入这些格式并在引擎内融合反量化。

PTQ 量化的关键步骤是校准（calibration）：用一小批代表性数据前向，统计每层权重与激活的分布（如 min/max、percentile、KL 散度），据此确定 scale 与 zero-point。对激活离群值，SmoothQuant 把量化难度从激活平移到权重（用平滑系数缩放激活通道、反缩放权重），显著降低 W8A8 的精度损失。AWQ 则反向保护显著权重通道不被过度量化，只对非显著通道做激进量化。校准集的代表性决定量化质量：分布偏离生产数据会让 scale 失准，激活离群值被压爆。工程上，weight-only 量化（W4A16）只需在加载权重时反量化，计算仍在 FP16，适合显存紧张但不能接受激活量化的场景。而 FP8/INT8 的 W8A8 把矩阵乘本身降到低精度，需要硬件张量核心支持，收益来自带宽减半而非算力。选择时应在校准集上测困惑度与下游精度，而非只看比特数；通常先试 FP8（若有 Hopper），再退 INT8，最后才 W4A16。逐层混合精度是当前主流：对敏感层保留 FP16、对鲁棒层用 INT4，需自动搜索或敏感度扫描确定每层配置。KV cache 也可量化（INT8/FP8），进一步省显存，但需注意解码时反量化的额外开销。量化感知训练（QAT）比 PTQ 精度更高但成本高，仅在 PTQ 不满足精度时考虑。部署时建议保留一份 FP16 基线引擎，量化引擎上线前做 A/B 对比，确认延迟收益大于精度损失再切流。

校准集规模不必大，几百到几千条覆盖典型输入分布即可，关键是分布代表性。
SmoothQuant 的平滑系数按层搜索，通常 activation 离群越严重，越偏向权重侧。
FP8 的 E4M3 格式动态范围约 [-448,448]，需确保激活与权重落在此范围内，否则溢出。
KV cache 量化常用 per-token 或 per-head 的 scale，减少长序列下的累积误差。
weight-only INT4 的解码需高效的 dequant kernel，TRT-LLM 已融合进 GEMM，开销很小。
混合精度搜索可借敏感度分析（如 Hessian 对角）自动定每层比特。
上线性量化（W8A8）前，建议先跑一遍 FP16 基线，确认瓶颈确在带宽而非算力。
量化后务必在真实业务样本上评估，而非仅看困惑度，因为某些任务对特定层极敏感。
对 MoE 模型，专家权重与路由可分别量化，路由通常保持高精度以免影响专家选择。
部署侧可把量化配置写进 engine 元数据，运行期按配置自动选反量化路径。
长上下文场景下，KV 量化的收益更明显，因为 KV 随序列长度线性增长。
量化与投机解码（speculative decoding）可叠加，进一步降延迟。
若量化后精度不达标，优先恢复注意力相关层与最后几层为 FP16，通常恢复最快。
最终量化方案应以「延迟收益除以精度损失」比作为上线决策依据。

## 三、形式化与数学基础

对称量化把浮点 $w$ 映射到整数：

$$\hat{w} = \mathrm{round}\left(\frac{w}{s}\right), \quad s = \frac{\max(|w|)}{q_{\max}}$$

反量化还原 $\tilde{w} = \hat{w} \cdot s$。FP8 采用 E4M3（4 指数 3 尾数）表示激活/权重，动态范围约 $[-448, 448]$，无需显式 scale 即可覆盖大部分激活分布。计算吞吐（以 MAC 计）：

$$\mathrm{speedup} \approx \frac{\mathrm{bits}_{\text{FP16}}}{\mathrm{bits}_{\text{quant}}} = \frac{16}{8} = 2\times$$

前提是张量核心原生支持该精度。

## 四、代码实现

```python
from tensorrt_llm.quantization import quantize

# 方式一：直接声明量化模式（FP8 需要 Hopper）
model = quantize(model, quant_mode="FP8")   # W8A8

# 方式二：weight-only INT4（需校准或已有权重）
model = quantize(model, quant_mode="W4A16")

# 方式三：导入 AWQ/GPTQ 量化权重
model = quantize(model, quant_mode="W4A16",
                 awq_path="awq_checkpoint.pth")

engine = build(model, max_batch_size=64)
```

注意：FP8 需 H100/H200 等 Hopper 架构；Ampere（A100）无原生 FP8 张量核心，应退用 INT8 或 weight-only。

## 五、与其他技术对比

| 量化 | 比特 | 硬件 | 精度 | 省显存 |
|------|------|------|------|--------|
| FP8 W8A8 | 8/8 | Hopper | 近无损 | 中 |
| INT8 W8A8 | 8/8 | Ampere+ | 小损 | 中 |
| W4A16 | 4/16 | 通用 | 视层 | 大 |
| W8A16 | 8/16 | 通用 | 小损 | 中 |

## 六、常见误区

- 认为 INT4 总可用：激活敏感层需保留高精度，否则崩坏。
- 忽视 outlier：不处理离群值会让整张量化失效。
- 一刀切量化：应逐层搜索混合精度配置。
- 把 PTQ 当训练：AWQ/GPTQ 不需反向传播全模型，但需校准集。

## 七、与开源书·权威来源对应

- Lin et al. 2023《AWQ: Activation-aware Weight Quantization》。
- Frantar et al. 2022《GPTQ: Accurate Post-Training Quantization》。
- NVIDIA/TensorRT-LLM quantization 文档（quant_mode、校准）。

## 八、面试题

- FP8 为何适合推理？与 INT8 相比优势在哪？
- AWQ 与 GPTQ 的核心区别？
- 为何激活离群值会让量化困难？

## 九、演进与趋势

逐层混合精度自动搜索、SmoothQuant 等激活平滑、KV cache 量化（INT8/FP8）进一步省显存，spec decoding 与量化结合。具体以官方最新文档为准。

## 十、小结

量化是 TRT-LLM 降显存、提吞吐的主手段。FP8 在 Hopper 上几乎无损且翻倍带宽，是最具性价比的选择；weight-only INT4 适合显存紧张场景，但需逐层校准避免崩坏。
