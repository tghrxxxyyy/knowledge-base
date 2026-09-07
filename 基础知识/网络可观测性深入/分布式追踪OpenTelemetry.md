# 分布式追踪OpenTelemetry

> 对应 OpenTelemetry 规范（opentelemetry.io）与 W3C Trace Context（traceparent）；参考 Vonng/ddia。

## 一、背景与挑战
一次请求跨越多个微服务，需串联各段耗时定位瓶颈。分布式追踪通过 context 传播实现调用链拼装。

## 二、核心原理
- Trace：一次请求的全局链，含唯一 trace_id。
- Span：单个服务内的操作，含 parent span_id。
- 传播：通过 W3C traceparent 头在 RPC/HTTP 间传递上下文。

## 三、形式化与数学基础
调用树：
  span_i = (trace_id, span_id_i, parent_id, start, end, attrs)
总耗时：
  duration = max(end) - min(start) over spans
关键路径（critical path）决定端到端延迟。

## 四、代码实现
// Go OpenTelemetry
tp := otel.Tracer("svc")
ctx, span := tp.Start(ctx, "handle")
defer span.End()
// 跨 RPC 传播
h := otel.GetTextMapPropagator()
h.Inject(ctx, propagation.HeaderCarrier(req.Header))

## 五、与其他技术对比
相比仅打日志，trace 提供结构化因果链；OpenTelemetry 统一了多语言 SDK 与后端。

## 六、常见误区
1. 忘记在出站请求注入 context——下游断链。
2. 采样率过低导致偶发问题难复现。

## 七、与开源书/权威来源对应
- OpenTelemetry 官方文档
- W3C Trace Context
- Vonng/ddia

## 八、面试题
trace 与 span 关系？context 如何传播？关键路径是什么？

## 九、演进与趋势
eBPF 自动注入 trace 减少手动埋点；持续剖析（profiling）融入可观测。

## 十、小结
分布式追踪把跨服务调用串成可分析链，是微服务排障核心。
