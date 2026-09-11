# llama-server 与并发

> 对应 ggerganov/llama.cpp 的 server 组件；Kwon 2023 vLLM（PagedAttention）；Karpathy/llama2.c。

## 一、背景与挑战

本地跑模型通常只是单条命令行交互，但实际需求常是多个客户端同时请求：桌面应用、编辑器插件、手机端助手并发访问同一个本地模型。若每个请求各自加载模型或串行排队，显存与延迟都会失控。

llama-server 需要解决三件事：提供稳定的 HTTP 接口（最好兼容 OpenAI 协议）、把并发请求合并成批以提升吞吐、以及为每个会话隔离 KV cache 与上下文状态。

## 二、核心原理

llama-server 在 llama.cpp 之上提供：

1. **OpenAI 兼容 HTTP 接口**：`/v1/chat/completions`、`/v1/completions`、`/v1/embeddings` 等，使现有工具链可无缝切换；
2. **连续批处理（continuous batching）**：把不同请求的当前 token 拼成一个 batch 一起前向，一步解码多个序列，显著提升设备利用率；
3. **流式输出**：以 Server-Sent Events 逐 token 返回，降低首字延迟；
4. **slot 级会话隔离**：每个并发槽位持有独立的 KV cache 与采样状态。

调度器在每步解码后重新组批：已完成的序列退出、新到达的请求插入，从而在长尾请求下仍保持高利用率。

## 三、形式化与数学基础

设并发序列集合 $\{r_1,\dots,r_m\}$，总墙钟时间 $T_{wall}$，生成 token 总数 $N$：

$$ \text{throughput} = \frac{N}{T_{wall}}, \qquad \text{latency}_i = T_{first,i} + \frac{n_i}{\text{tps}} $$

批处理把 $m$ 条序列的矩阵乘合并为一次 $M=m$ 的 GEMM，收益来自：

$$ \text{efficiency} \propto \frac{m}{1 + (m-1)\cdot \rho} $$

其中 $\rho$ 是重复读取权重的开销占比。$M$ 越大，单次读取权重被复用得越充分，吞吐越高。

内存约束：并发数受 KV cache 总量限制。设每 token 每层 KV 字节数为 $c$，则

$$ \sum_{i=1}^{m} L_i \cdot c \le \text{KV budget} $$

超过则需限流或缩短上下文。这与 vLLM 用分页管理 KV 的思路目标一致，但 llama.cpp 的实现更轻。

## 四、代码实现

```text
# 启动服务，指定模型与端口
./llama-server -m model-q4_k_m.gguf \
  --host 0.0.0.0 --port 8080 \
  --ctx-size 4096 --n-gpu-layers 99 \
  --parallel 4                # 并发槽位（并行会话数）
```

```bash
# 客户端：OpenAI 风格调用，支持流式
curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "local",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'
```

要点：`--parallel` 与 `--ctx-size` 需与显存匹配，槽位越多每槽可用上下文越小。生产环境建议在前置网关做并发上限与超时控制。

## 五、与其他技术对比

| 维度 | llama-server | vLLM | 纯 llama-cli |
| --- | --- | --- | --- |
| 接口 | OpenAI 兼容 HTTP | OpenAI 兼容 HTTP | 无（命令行） |
| 批处理 | 连续批处理，轻量 | 连续批处理 + 分页 KV | 无 |
| 部署复杂度 | 低，单二进制 | 中，Python 栈 | 最低 |
| 吞吐上限 | 中，受实现约束 | 高 | 单请求 |
| 适用场景 | 本地/小规模服务 | 生产级高并发 | 交互式单次 |

## 六、常见误区

- 认为本地服务无需限流：多客户端仍会撑爆 KV 内存导致 OOM。
- 把 `--parallel` 设得过大：每槽上下文被压缩，长对话截断。
- 认为 OpenAI 兼容就等于行为一致：采样参数、特殊 token、工具调用细节可能有差异。
- 忽略流式与非流式对延迟感知的影响：首字延迟才是交互体验的关键指标。
- 认为只要 GPU 就够：KV cache 是显存大头，需与模型权重一起预算。

## 七、与开源书·权威来源对应

ggerganov/llama.cpp 的 server 文档给出接口与并发参数；Kwon 2023 vLLM 提出的 PagedAttention 是 KV 管理的重要参照；Karpathy/llama2.c 展示了极简推理服务的基础结构。具体接口与参数以仓库最新文档为准。

## 八、面试题

- 问：llama-server 兼容性的价值？答：OpenAI 接口兼容让现有工具无缝接入本地模型，迁移成本极低。
- 问：连续批处理相比静态批处理的好处？答：请求完成即退出、新请求即插入，避免长尾请求拖慢整批。
- 问：并发数与上下文长度的关系？答：共享 KV 预算，并发越高每槽可用上下文越短。
- 问：吞吐与延迟如何权衡？答：增大 batch 提升吞吐但可能抬高单请求首字延迟。

## 九、演进与趋势

批处理与 KV 管理持续增强，逐步引入更精细的槽位调度与多模态输入；与量化、投机解码结合提升端侧吞吐。具体能力以仓库最新文档为准。

## 十、小结

llama-server 用一个轻量 HTTP 层把端侧引擎变成易用的本地 API 服务。设计要点是 OpenAI 兼容接口、连续批处理与 slot 级 KV 隔离；实践中必须为并发数与上下文长度做显存预算。
