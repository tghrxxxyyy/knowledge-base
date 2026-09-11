# 部署与 Triton 集成

> 对应 NVIDIA/TensorRT-LLM backend for Triton，以及 Kwon 2023《vLLM》、huggingface/transformers 等服务化参考。

## 一、背景与挑战

生产部署需要并发、动态批处理、多模型统一治理、指标监控（延迟、吞吐、GPU 利用率）与优雅扩缩。裸引擎只暴露单次 `execute`，缺运维能力。需要服务框架把引擎封装为可观测、可扩展的在线服务。

挑战：(1) 动态请求到达时间不均；(2) 多模型/多版本路由；(3) KV cache 与批大小需按负载调；(4) 暴露 gRPC/HTTP 与探活接口。

## 二、核心原理

Triton Inference Server 的 `tensorrtllm` backend 加载 TRT-LLM 引擎，按 `config.pbtxt` 配置：dynamic_batching 聚合请求、instance_group 控制并发实例数、backend 参数配置 KV cache 大小与 max_batch_size。Triton 统一管理模型仓库（model_repository）、版本、就绪/存活探针与 Prometheus 指标。

请求流：客户端 gRPC/HTTP 到 Triton → 动态批聚合 → backend 调用引擎 in-flight 解码 → 流式返回 token。Triton 还支持 ensemble（编排多模型）、backend 间流水线。

生产落地还需三类配套：指标暴露、探活与模型版本。Triton 自带 Prometheus 端点，需采集队列等待、批大小、KV 占用、P99 延迟，作为 autoscaling 与告警依据。配置 readiness/liveness 探针，滚动发布时只有 readiness 通过才接流。model_repository 支持版本目录与不重启切换，配合 CI 做灰度上线。另一常见做法把预处理/后处理也做成 Triton 的 ensemble，使 tokenizer、前处理与 LLM 引擎在同一服务内流水线化，减少跨进程拷贝。简单场景仍可用独立网关，ensemble 会增加调试复杂度。部署时还需为 Triton 配置合理的超时与并发限制，避免后端引擎被突发流量打满。多模型场景用模型组（model ensemble）与版本路由可进一步统一治理。

动态批的 max_queue_delay 是延迟与吞吐的旋钮：调大提升批利用率但升延迟。
实例数（instance count）应按 GPU 显存与 KV 预算算，过多实例会争抢 KV 导致 OOM。
Triton 的模型控制协议支持运行时增删模型与调参，便于灰度切换引擎版本。
指标方面除延迟外，应重点看「队列等待时间」，它直接反映批聚合是否成为瓶颈。
多模型共享 GPU 时，用 rate_limiter 限制每模型资源，避免某一模型挤占全部算力。
Triton 与 K8s 的 HPA 配合时，扩缩指标应基于 GPU 利用率与排队长度，而非仅 CPU。
日志与链路追踪建议接入 OpenTelemetry，把每请求跨越 Triton 与后端引擎的耗时打通。
生产实践常把 Triton 放在网关之后，由网关做鉴权与限流，Triton 专注推理调度。
版本回退可通过切回旧 model_repository 目录实现，配合蓝绿部署做到无感切换。
对超大模型，Triton 也支持模型流水线把 prefill 与 decode 拆分到不同实例。

## 三、形式化与数学基础

动态批在时间窗 $\Delta t$ 内聚合到达请求：

$$B = \{r \mid t_r \in [t_0, t_0+\Delta t]\}$$

受两个约束：(1) $|B| \le B_{\max}$（max_batch_size）；(2) KV cache 显存预算 $\sum_{r\in B} \mathrm{kv}(r) \le C_{\mathrm{kv}}$。窗过长升延迟、过短降利用率，需按 P99 目标调：

$$\Delta t^* = \arg\min_{\Delta t} \mathrm{P99}(\text{latency}) \quad \text{s.t.} \quad \mathrm{GPU\_util} \ge \theta$$

## 四、代码实现

model_repository 下的配置（注意是 pbtxt 文本，非 Python）：

```text
# model_repository/llama/config.pbtxt
backend: "tensorrtllm"
max_batch_size: 64
dynamic_batching {
  max_queue_delay_microseconds: 100
}
instance_group [
  { kind: KIND_GPU count: 1 }
]
# 引擎与 KV 缓存等参数在 backend 专用段配置
```

启动：

```bash
tritonserver --model-repository=./model_repository \
  --http-port=8000 --grpc-port=8001
```

注意：backend 还需 `triton_model_repo/llama/1/` 下放置 PLAN 与 tokenizer，且 KV cache 上限需与 `max_batch_size` × 序列长度匹配，否则运行时报错。

## 五、与其他技术对比

| 方案 | 动态批 | 指标 | 多模型 | 运维 |
|------|--------|------|--------|------|
| 自写服务 | 需自研 | 弱 | 弱 | 弱 |
| TRT-LLM C++ | 内置 | 中 | 弱 | 中 |
| Triton | 内置 | 强 | 强 | 强 |
| vLLM 服务 | 内置 | 中 | 中 | 中 |

## 六、常见误区

- 认为 Triton 自动最优：仍需按负载调批大小、实例数与 KV 预算。
- 忽视 KV 上限：批变大时 KV 超限会 OOM 或回退。
- 混淆 instance 与 tp：多实例 ≠ 张量并行，二者作用不同。
- 漏配探活：生产需 readiness/liveness 探针做滚动发布。

## 七、与开源书·权威来源对应

- NVIDIA Triton Inference Server + TensorRT-LLM backend 文档。
- Kwon et al. 2023《vLLM》——连续批处理对照。
- huggingface/transformers——作为权重与 tokenizer 来源。

## 八、面试题

- Triton 如何用 dynamic_batching 做动态批？受哪些约束？
- Triton 实例数（instance_group）与 TRT-LLM 的 tp_size 有何区别？
- 生产部署 TRT-LLM 为何常选 Triton 而非裸服务？

## 九、演进与趋势

Triton 支持分离式 prefill/decode、多模型流水线（ensemble）、更细的指标与自动扩缩。与 K8s、KServe 集成构成标准 LLM 服务底座。具体以官方最新文档为准。

## 十、小结

Triton 把 TRT-LLM 引擎封装为可运维的生产服务，提供动态批、多模型治理、指标与探活，是落地最后一公里的关键组件；但性能仍依赖合理调参。
