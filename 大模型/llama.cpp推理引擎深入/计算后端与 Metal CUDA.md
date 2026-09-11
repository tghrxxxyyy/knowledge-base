# 计算后端与 Metal CUDA

> 对应 ggerganov/llama.cpp 的 ggml 后端架构；Dao 2022 FlashAttention；Karpathy/llama2.c。

## 一、背景与挑战

同一份 C/C++ 推理代码要跑在 Apple Silicon（Metal）、NVIDIA（CUDA）、AMD/Intel（Vulkan）、以及纯 CPU（BLAS）上，且不引入沉重的运行时依赖。若为每个平台维护一套代码，则矩阵乘、注意力、量化反量化等核心内核会重复实现、反复分叉，维护成本极高。

llama.cpp 的思路是把「计算图」与「算子实现」解耦：上层用 ggml 描述张量运算，下层由各后端注册自己的内核。难点在于保持数值一致性与性能可移植性。

## 二、核心原理

整个体系分三层：

1. **ggml 张量库**：定义张量、计算图与算子（`ggml_mul_mat`、`ggml_soft_max` 等），与硬件无关；
2. **后端注册表（ggml-backend）**：把计算图切分并调度到可用后端，管理张量在设备内存与主机内存间的搬运；
3. **具体后端**：Metal、CUDA、Vulkan、BLAS/CPU 各自实现 `mul_mat`、注意力、量化点积等内核。

运行时按「后端能支持该算子且有足够内存」的原则分配节点，不支持的节点回退到 CPU。构建期通过宏（如 `GGML_USE_METAL`、`GGML_USE_CUDA`）决定编译哪些后端。

## 三、形式化与数学基础

线性层是绝对热点，其计算量与访存量决定性能模型。设 $M\times K$ 输入乘 $K\times N$ 权重：

$$ \text{FLOPs} = 2MNK, \qquad \text{Bytes} \approx (MK + KN + MN)\cdot \text{sizeof(dtype)} $$

算术强度：

$$ I = \frac{\text{FLOPs}}{\text{Bytes}} \approx \frac{2MNK}{MK + KN + MN} $$

解码阶段 $M=1$（逐 token），$I$ 极低，成为**访存受限**，因此量化（降低权重字节数）直接提升吞吐。注意力部分的计算量随序列长度呈二次增长：

$$ \text{FLOPs}_{\text{attn}} \approx 4 S^2 d $$

其中 $S$ 为序列长度、$d$ 为头维。FlashAttention 通过分块与在线 softmax 把中间的 $S\times S$ 矩阵从显存搬到片上 SRAM，降低 HBM 访问量。

## 四、代码实现

```cpp
// 构建期选择后端的典型分派（示意）
#include "ggml-backend.h"

void init_backends(void) {
#ifdef GGML_USE_METAL
    ggml_backend_metal_init();          // Apple GPU，统一内存
#elif defined(GGML_USE_CUDA)
    ggml_backend_cuda_init(0);          // NVIDIA GPU
#elif defined(GGML_USE_VULKAN)
    ggml_backend_vulkan_init(0);
#else
    ggml_backend_cpu_init();            // BLAS/CPU 回退
#endif
}

// 计算图调度：按后端能力切分，不支持则回退 CPU
// 实际 API 以仓库最新头文件为准
```

运行时可用 `-ngl N` 指定卸载到 GPU 的层数，`-t` 指定 CPU 线程数，两者共同决定算力分配。

## 五、与其他技术对比

| 后端 | 平台 | 内存模型 | 主要优势 | 局限 |
| --- | --- | --- | --- | --- |
| Metal | Apple Silicon | 统一内存，零拷贝 | 省电、延迟低、可直接用系统内存 | 仅 Apple 生态 |
| CUDA | NVIDIA | 独立显存 | 吞吐最高、内核成熟 | 依赖驱动、显存受限 |
| Vulkan | 跨厂商 GPU | 独立显存 | 覆盖面广 | 内核优化程度不一 |
| BLAS/CPU | 通用 | 主机内存 | 零依赖、可移植 | 算力有限 |

对比 PyTorch：PyTorch 依赖统一的 CUDA 栈，抽象一致但部署重；llama.cpp 显式多后端、无运行时依赖，更适合嵌入与端侧分发。

## 六、常见误区

- 认为 Metal 后端很慢：端侧场景下延迟与功耗表现良好，适合离线与隐私敏感场景。
- 认为 CPU 后端只是兜底：配合量化与多线程，CPU 在无 GPU 环境仍是主力。
- 忽略统一内存的优势：Apple Silicon 上无需显式拷贝，KV cache 与权重可共享内存。
- 把所有层都卸载到 GPU：显存不足会 OOM，需按 `-ngl` 逐步调优。
- 认为各后端数值完全一致：浮点归约顺序与内核实现不同，输出可能有细微差异。

## 七、与开源书·权威来源对应

ggerganov/llama.cpp 的 ggml 后端架构与构建选项是权威来源；Dao 2022 FlashAttention 提供了 IO 感知注意力内核的设计；Karpathy/llama2.c 展示了极简 C 实现的可读性与可移植性思路。具体后端清单与 API 以仓库最新文档为准。

## 八、面试题

- 问：llama.cpp 如何跨平台？答：ggml 抽象计算图，后端注册表按能力切分调度，各硬件提供专用内核。
- 问：解码阶段为何访存受限？答：$M=1$ 使算术强度极低，性能由读取权重的字节数决定。
- 问：FlashAttention 降低了什么？答：HBM 读写次数，而非理论 FLOPs。
- 问：如何决定卸载多少层到 GPU？答：按可用显存与 `-ngl` 试探，兼顾 OOM 与吞吐。

## 九、演进与趋势

Vulkan 后端扩展了跨厂商 GPU 的通用加速；后端抽象持续细化以支持更多算子与多设备并行；与 NPU、移动 GPU 的原生内核结合是端侧方向。具体支持以仓库最新文档为准。

## 十、小结

多后端抽象是 llama.cpp「无处不在部署」的关键。理解 ggml 的分层、访存受限的解码特性与 FlashAttention 的 IO 优化，就能在任意硬件上做出合理的卸载与量化决策。
