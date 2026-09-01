# 链路追踪与 OpenTelemetry 实战

> 板块：SRE 　|　 返回：[README](README.md)
> 适用：分布式系统调用链排查、性能瓶颈定位、跨服务问题定界。

在微服务下，一次请求横跨数十个服务，出了问题难以定位"慢在哪、错在哪"。链路追踪（Tracing）用 **Trace + Span** 把一次请求的全路径串起来，是分布式排障的眼睛。

## 一、核心概念

| 概念 | 含义 |
|------|------|
| Trace | 一次请求（事务）的完整调用链 |
| Span | 链中的一个操作（一次 RPC/DB/函数），有起止时间 |
| Parent/Child | Span 间父子关系，组成树 |
| Context | 跨进程传递的 trace 上下文（trace_id/span_id） |
| Baggage | 跨服务透传的 KV 数据 |

## 二、上下文传播

链路追踪的关键是**跨进程传递 trace 上下文**：

```
服务A ──(traceparent: trace_id, parent_span_id)──> 服务B ──> 服务C
```

- 通过 HTTP Header（W3C `traceparent`）或消息属性传递。
- 中间件/SDK 自动注入与提取，业务无感知。

## 三、OpenTelemetry（OTel）

OTel 是云原生可观测性的**开放标准**，统一了 Trace/Metric/Log 的采集：

- **API/SDK**：应用埋点（自动 instrumentation + 手动）。
- **Collector**：接收、处理、导出数据到后端（Jaeger/Tempo/商业 APM）。
- **协议**：OTLP（统一传输），后端无关。

```yaml
# otel collector 示例：接收 OTLP，导出到 Jaeger + Prometheus
receivers:
  otlp: { protocols: { grpc: {}, http: {} } }
exporters:
  jaeger: { endpoint: jaeger:14250 }
  prometheus: { endpoint: 0.0.0.0:8889 }
service:
  pipelines:
    traces: { receivers: [otlp], exporters: [jaeger] }
    metrics: { receivers: [otlp], exporters: [prometheus] }
```

## 四、典型架构

```
应用(OTel SDK) → OTel Collector → 存储/后端(Jaeger/Tempo/商业APM)
                                   → 可视化/告警(Grafana)
```

- **自动埋点**：Java/Python/Node 等主流语言有自动 instrumentation，无需改代码。
- **采样**：全量 trace 成本高，生产用头部/尾部采样（如 1%~10%，慢/错请求全采）。

## 五、排障用法

1. **看 Trace 瀑布图**：找最慢的 Span（瓶颈服务）。
2. **定位错误 Span**：红色节点即失败点，看其日志/异常。
3. **跨服务定界**：API 慢是自身逻辑还是下游 DB/第三方？
4. **关联日志/指标**：通过 trace_id 关联该请求的日志与 RED 指标。

## 六、与日志/指标关联

- **Logs ↔ Trace**：每条日志带 trace_id，从 trace 跳转到对应日志。
- **Metrics ↔ Trace**：指标异常（如 P99 突增）下钻到具体慢 trace。
- 三者构成可观测性三支柱闭环（见[可观测性三支柱实战](可观测性三支柱实战.md)）。

## 七、性能与成本

- **开销**：Span 有少量 CPU/内存开销，自动埋点控制合理。
- **采样策略**：默认采样避免存储爆炸；关键路径（错误/慢）全采。
- **存储**：trace 数据量大，设保留期（如 7~30 天）。

## 八、常见坑

1. **上下文未传播** → 链路断成多段；确保跨进程传递（Header/消息属性）。
2. **全量采样** → 成本爆炸；合理采样。
3. **Span 过细/过粗** → 要么噪声要么看不清；按有意义操作打 Span。
4. **无 trace_id 关联日志** → 排障断层；日志注入 trace_id。
5. **Collector 单点** → 追踪数据丢失；Collector 集群 + 缓冲。
6. **多语言 SDK 不一致** → 链路不全；统一 OTel 标准。

## 九、延伸阅读

- [SRE/可观测性三支柱实战](可观测性三支柱实战.md)
- [SRE/监控告警体系与SLO实战](监控告警体系与SLO实战.md)
- [SRE/日志体系与集中式日志实战](日志体系与集中式日志实战.md)
- [云原生/可观测性](../云原生/可观测性.md)
