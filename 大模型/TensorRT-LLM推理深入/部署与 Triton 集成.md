# 部署与 Triton 集成

> 对应 NVIDIA/TensorRT-LLM; Kwon 2023 vLLM; huggingface/transformers。

## 一、背景与挑战
生产需并发、动态批处理、多模型管理与指标监控，原始引擎需接入服务框架。

## 二、核心原理
用 Triton Inference Server 的 TensorRT-LLM backend 加载引擎，配置 dynamic batching、实例数、KV 缓存大小，暴露 gRPC/HTTP。

## 三、形式化与数学基础
动态批把时间窗 Δt 内请求合并：
$ B = \{r \mid t_r \in [t_0, t_0+\Delta t]\} $
受 max_batch_size 与 KV 预算约束。

## 四、代码实现
```text
# model_repository/llama/config.pbtxt
backend: "tensorrtllm"
dynamic_batching { max_batch_size: 64 }
```

## 五、与其他技术对比
自写服务灵活但缺运维；Triton 提供批处理、扩缩、指标一体化。

## 六、常见误区
误区：Triton 自动最优。仍需按负载调批大小与实例数。

## 七、与开源书/权威来源对应
NVIDIA Triton + TensorRT-LLM backend。见 NVIDIA/TensorRT-LLM。

## 八、面试题
问：Triton 如何做动态批？
答：时间窗聚合请求，受批上限与资源约束后统一推理。

## 九、演进与趋势
Triton 支持分离式 prefill/decode 与多模型流水线。

## 十、小结
Triton 把 TRT-LLM 引擎封装为可运维的生产服务，是落地最后一公里。
