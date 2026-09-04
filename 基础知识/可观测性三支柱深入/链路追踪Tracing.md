# 链路追踪Tracing

> 对应可观测性三支柱之一：Distributed Tracing。

## 一、背景与挑战
微服务下一次请求跨越多个服务，单看指标/日志无法定位跨服务瓶颈。追踪记录请求在各span的耗时与父子关系。

## 二、核心原理
- Trace：一次请求的整体，含唯一 trace_id。
- Span：单个操作单元，含 span_id、parent_id、起止时间、属性。
- 上下文传播：通过 HTTP header（traceparent）跨进程传递。
- 采样：头采样（入口决策）或尾采样（基于结果决策）。

## 三、形式化 / 数学基础
- 树结构：span 集合 $S$，父函数 $p: S\to S\cup\{\bot\}$，构成有根树。
- 关键路径（critical path）：从根到叶最大累计耗时路径。
- 跨度耗时 $d(span)=t_{end}-t_{start}$；自顶向下分解延迟。
- W3C traceparent 格式：`version-traceid-spanid-flags`（32 hex 位 trace_id）。

## 四、代码实现
```python
from opentelemetry import trace
tracer = trace.get_tracer("svc")
with tracer.start_as_current_span("db.query") as span:
    span.set_attribute("db.system", "mysql")
    # 上下文自动注入到下游 HTTP 头（traceparent）
    do_query()
```

## 五、与其他技术对比
- 日志：单事件；追踪：跨服务因果链。
- 指标：聚合；追踪：单次请求细节。
- APM 自动探针 vs 手动埋点：覆盖与性能开销权衡。

## 六、常见误区
- 不传播上下文导致链路断裂。
- 100% 采样在高流量下成本过高。
- 只埋入口不埋依赖，关键路径缺失。

## 七、与开源书 / 权威来源对应
- OpenTelemetry 官方文档（Tracing、W3C traceparent）。
- Google Dapper 论文（分布式追踪奠基）。

## 八、面试题
- trace_id 与 span_id 作用？
- 上下文如何在服务间传播？
- 头采样与尾采样区别？

## 九、演进与趋势
eBPF 无侵入自动追踪；持续分析（profiling）与追踪融合；标准趋同于 OTel。

## 十、小结
追踪用 trace/span 树还原跨服务因果与关键路径，依赖上下文传播与合理采样。
