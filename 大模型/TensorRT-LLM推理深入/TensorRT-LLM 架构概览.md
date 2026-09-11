# TensorRT-LLM 架构概览

> 对应 NVIDIA/TensorRT-LLM 官方项目，以及 Dao 2022《FlashAttention》、Ainslie 2023《GQA》等底层算子与注意力研究。

## 一、背景与挑战

PyTorch eager 推理每个算子单独启动 CUDA kernel，带来内核启动开销、频繁显存读写与未融合的 LayerNorm/SiLU 等小算子，难以在 A100/H100 上榨干算力。大模型服务要求高吞吐与低尾延迟（P99），需要把计算图在离线阶段编译成高度优化的引擎。TensorRT-LLM（TRT-LLM）正是 NVIDIA 提供的、面向 LLM 推理的编译优化栈。

挑战：(1) 动态形状（变长序列、变长 batch）需专门处理；(2) KV cache 显存管理；(3) 量化与并行的正确组合；(4) 构建期耗时与迭代成本。

## 二、核心原理

TRT-LLM 工作流分两阶段：构建期（build）与运行期（runtime）。构建期用 Python API 描述模型（或自动从 HF 权重转换），经图优化、算子融合、量化、并行切分，生成序列无关的 TensorRT engine（PLAN）。运行期加载 engine，由调度器做 in-flight batching，配合分页 KV cache，在 Triton 或直接 C++/Python 服务中执行。

关键模块：functional 层提供 RMSNorm、Ragged-softmax、GEMM 等可融合原语；插件（plugin）封装 FlashAttention、Cutlass GEMM 等定制核；builder 负责层融合与常量折叠。注意力默认走 FlashAttention（IO 感知、不物化完整注意力矩阵），GQA/MQA 通过减少 KV 头数降低显存带宽。

构建期的关键动作包括权重转换、图构建、插件注入、并行分片与精度校准五步。权重转换从 HF safetensors 读权重并按目标精度重排；图构建用 Builder 把 functional 原语编译成 engine，期间应用层融合、常量折叠与布局优化。插件注入对 FlashAttention、Cutlass GEMM 等用 plugin 实现定制 CUDA 核；并行分片按 Mapping 把层切到多卡并插入 all-reduce。精度校准在量化模式下用校准集确定 scale。引擎生成为离线一次性成本，之后 engine 文件可版本化缓存随镜像分发，运行期只加载不重算。运行期由 LLM 或 TrtGptModel 类托管：内部 Scheduler 做 in-flight 组批，KVCacheManager 做分页 KV，tokenizer 与采样在 C++ 侧完成，避免 Python 解释器成为瓶颈。这也是 TRT-LLM 延迟低于纯 Python 调度框架的由来。理解两阶段模型对排障很关键：运行期精度差异往往源于构建期的融合或精度档设置，而非运行期逻辑。调优应优先在构建期用小批量对拍 PyTorch 参考实现，再放开吞吐配置。TRT-LLM 还支持引擎缓存：相同构建配置命中缓存可跳过耗时的 kernel 调优（tactic selection），缩短迭代周期。

构建期还可开启「强类型（strongly typed）」模式，固定每节点的精度，减少隐性 cast 带来的精度与性能损失。
plugin 的注册通过 trtllm.plugins 完成，自定义核需实现 enqueue 与 shape 推断接口。
多卡构建时，builder 会按 Mapping 自动插入 all-reduce 节点，无需手写通信代码。
引擎文件含硬件指纹，跨 GPU 型号（如 A100 与 H100）通常需重新构建，不能直接拷贝。
运行期的高层 generate API 内部已封装调度、KV 管理与采样，适合快速落地。
若需极限控制，可用 trtllm.bindings 的 TrtGptModel 自行驱动 step 循环，嵌入自有服务框架。
性能剖析建议用 Nsight Systems 抓 kernel 时间线，定位融合是否生效、通信是否重叠。
构建日志中的 tactic 选择反映了每层最优 kernel，异常时可对比默认实现排查。
TRT-LLM 还支持多模态扩展，把视觉编码器也编译进同一引擎图，端到端加速。
与 TensorRT 通用版相比，TRT-LLM 预置了 transformer 专用优化，省去手工摆图。
上线前应做「延迟-吞吐」曲线，确定最佳 batch 与并发配置，而非拍脑袋设值。

## 三、形式化与数学基础

标准注意力（与 FlashAttention 数值一致）：

$$\mathrm{Attn}(Q,K,V) = \mathrm{softmax}\left(\frac{QK^\top}{\sqrt{d_k}}\right)V$$

FlashAttention 把 softmax 分块在线计算，避免物化 $N\times N$ 注意力矩阵，显存从 $O(N^2)$ 降到 $O(N)$，并提升算术强度。GQA 将 $h$ 个 KV 头共享为 $g$ 组：

$$\mathrm{GQA}(Q) = \mathrm{Concat}_{i=1}^{h}\left(\mathrm{Attn}(Q_i, K_{i\bmod g}, V_{i\bmod g})\right)$$

TRT-LLM 把上述计算编译为融合 kernel，并在层间流水。

## 四、代码实现

用高层 `LLM` API 快速构建并生成：

```python
import tensorrt_llm

# 高层封装：自动构建引擎并服务
llm = tensorrt_llm.LLM(
    model="meta-llama/Llama-3-8B-Instruct",
    tensor_parallel_size=2,
    quant_mode="FP8",
)
output = llm.generate(
    prompts=["请介绍一下 TensorRT-LLM。"],
    max_new_tokens=128,
    sampling_params={"temperature": 0.7},
)
print(output)
```

注意：首次调用会在后台构建 engine（耗时数分钟），生产环境应预构建并缓存 PLAN 文件，运行期直接加载以省去构建开销。

## 五、与其他技术对比

| 方案 | 优化时机 | 调度 | 典型延迟 | 生态 |
|------|----------|------|----------|------|
| PyTorch eager | 无 | 手动 | 高 | 最灵活 |
| vLLM | 运行期 | 连续批 | 中 | 丰富 |
| TRT-LLM | 构建期 | in-flight | 低 | NVIDIA 栈 |
| TensorRT (通用) | 构建期 | 需自接 | 低 | 通用 CV/NLP |

## 六、常见误区

- 认为「开箱即最快」：未配量化/并行/批处理时未必胜 vLLM。
- 忽视构建成本：每次改配置都要重建 engine，迭代慢。
- 误用动态形状：未声明正确 profile 会导致回退到慢路径。
- 把 TP 当免费：跨节点 TP 通信成本高，需 NVLink。

## 七、与开源书·权威来源对应

- NVIDIA/TensorRT-LLM 官方仓库与文档（builder、plugin、backend）。
- Dao et al. 2022《FlashAttention》——IO 感知注意力。
- Ainslie et al. 2023《GQA》——分组查询注意力，省 KV 带宽。

## 八、面试题

- TRT-LLM 的构建期与运行期各做什么？为何要分两阶段？
- FlashAttention 相比朴素注意力省了什么？
- TRT-LLM 与 vLLM 如何取舍？

## 九、演进与趋势

与 Triton backend 深度集成、支持分离式 prefill/decode、自动并行策略搜索与逐层混合精度。TRT-LLM 也在吸收 chunked context、spec decoding 等吞吐优化。具体以官方最新文档为准。

## 十、小结

TRT-LLM 以「离线编译优化 + 运行期 in-flight 批处理」换取极致推理性能，是 NVIDIA 栈服务大模型的首选。其代价是构建与迭代较重，需正确组合量化、并行与批处理方能发挥优势。
