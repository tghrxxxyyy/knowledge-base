# TensorRT-LLM 概述

> 对应 NVIDIA TensorRT-LLM 官方仓库与文档（https://github.com/NVIDIA/TensorRT-LLM）。

## 一、背景与挑战

NVIDIA GPU 是大模型推理的主力硬件，但原生 HuggingFace 推理未针对特定架构做深度优化，吞吐与显存利用有限。TensorRT-LLM（TRT-LLM）是 NVIDIA 推出的**高性能大模型推理引擎**，通过对 Transformer 计算图的编译期优化（核融合、量化、专用注意力插件）与运行时调度（In-Flight Batching、分页 KV），在 NVIDIA 硬件上把推理性能推到接近硬件上限，是追求极限吞吐场景的首选之一。

## 二、核心原理

TRT-LLM 复用 TensorRT 的图编译能力，并额外提供 LLM 专用组件：

- **核融合（kernel fusion）**：把 LayerNorm/RMSNorm、GEMM、激活等融合为单 kernel，减 HBM 读写与启动开销；
- **量化**：原生支持 FP8（Hopper）、INT4/INT8 权重量化，降带宽/算力；
- **In-Flight Batching（连续批处理）**：按 token 步动态调度，提吞吐；
- **分页 KV Cache**：按需分配 KV 块、支持前缀共享，省显存；
- **注意力插件**：集成 FlashAttention、MQA/GQA 等多查询优化；
- **并行**：张量并行、流水并行切分大模型到多卡。

它走**离线构建引擎（AOT）**路线：先编译出 `.engine`，再部署。

## 三、形式化与数学基础

引擎把模型固定为优化计算图。设参数量 $P$、张量并行 $tp$、精度字节 $s$，则每卡权重：

$$M_w^{\text{card}} = \frac{P \cdot s}{tp}.$$

构建需满足 $M_w^{\text{card}} + M_{\text{kv}} \le u \cdot M_{\text{gpu}}$（$u$ 为显存利用率）。量化使 $s$ 减半（FP8）或降至 1/4（INT4），直接放宽该约束、提升可并发请求数。融合后计算强度 $\text{AI}=\text{FLOPs}/\text{Bytes}$ 提升，更接近 compute-bound。

## 四、代码实现

转换检查点并构建引擎（参数以官方最新文档为准）：

```bash
python convert_checkpoint.py --model_dir ./llama-7b \
  --output_dir ./ckpt_trt --dtype float16 --tp_size 1
trtllm-build --checkpoint_dir ./ckpt_trt \
  --output_dir ./engine --gemm_plugin float16 --tp_size 1
```

部署（OpenAI 兼容）：

```bash
trtllm-serve --engine_dir ./engine --host 0.0.0.0 --port 8000
```

## 五、与其他引擎对比

| 引擎 | 路线 | NVIDIA 性能 | 易用 | 硬件 |
|------|------|------------|------|------|
| TRT-LLM | AOT 编译 | 最高 | 中 | NVIDIA 为主 |
| vLLM | JIT | 高 | 高 | 跨厂商 |
| SGLang | JIT | 高 | 高 | 跨厂商 |
| llama.cpp | 运行时 | 中 | 高 | 跨平台/端侧 |

## 六、常见误区

- **以为引擎跨 GPU 架构可复用**：引擎含针对具体 SM 架构优化的 kernel，换架构须重建。
- **认为 TRT-LLM 永远最快**：在易用性、跨硬件、迭代速度上 vLLM/SGLang 更灵活，选型看场景。
- **忽略构建成本**：编译一次、跑多次，频繁改模型时应权衡迭代开销。
- **误以为 TRT-LLM 只适合超大模型**：中小模型在固定硬件、高并发场景同样获益于融合与量化。
- **不关注版本耦合**：TensorRT 运行时、TRT-LLM、CUDA 驱动需配套，升级建议回归测试。

## 七、与开源书·权威来源对应

- NVIDIA TensorRT-LLM：https://github.com/NVIDIA/TensorRT-LLM
- NVIDIA *Hopper* 白皮书（FP8 Tensor Core）。
- 见本系列「编译与部署流程」「核融合与图优化」「In_Flight_Batching」「多查询注意力优化」。

## 八、面试题

- TRT-LLM 相比 vLLM 的优势与适用场景？反向呢？
- 为什么引擎不能跨 GPU 架构复用？
- TRT-LLM 的核心优化项有哪些？

## 九、演进与趋势

TRT-LLM 推 **LLM API（Python）** 降低上手门槛；支持 FP4/NVFP4（Blackwell）、稀疏化；与 Triton 深度集成做生产网关；构建缓存缩短迭代。同时生态向「可移植 + 易运维」演进，与 vLLM/SGLang 在性能上趋近。

## 十、小结

TensorRT-LLM 是 NVIDIA 面向大模型推理的编译型高性能引擎，以核融合、量化、In-Flight Batching、分页 KV、多查询注意力插件与并行切分，在 NVIDIA 硬件上逼近性能上限；其 AOT 构建带来极致性能，代价是引擎与架构强绑定、换硬件须重建，适合固定硬件追求极限吞吐的生产场景。
