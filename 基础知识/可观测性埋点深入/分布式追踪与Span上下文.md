# 分布式追踪与Span上下文

> 对应 OpenTelemetry (observability standard)。

## 一、背景与挑战
一次请求跨越多个服务，单服务日志无法还原完整路径，难以定位跨服务延迟与失败点。

## 二、核心原理
用 Trace 串联一次请求，内部由多个 Span 表示各服务/操作。上下文（trace_id, span_id, parent_id）通过请求头在调用间传播。

## 三、形式化与数学基础
Trace = 树形结构，根 Span 的 trace_id 全局唯一；子 Span 继承 trace_id 且 parent_id = 父 span_id。延迟 = 各 Span 起止区间的合成。

## 四、代码实现
```python
from opentelemetry import trace
tracer = trace.get_tracer("svc")
with tracer.start_as_current_span("db.query") as sp:
    sp.set_attribute("sql", "select ...")   # 当前 span 自动关联父上下文
    run_query()
```

## 五、与其他技术对比
相比指标（聚合视角），追踪提供单次请求的明细路径；相比日志，它自带因果与层级关系。

## 六、常见误区
- 上下文传播缺失，导致跨进程断链，Trace 碎片化。
- 在 Span 里塞大量负载内容，膨胀存储。

## 七、与开源书/权威来源对应
OpenTelemetry 定义了 W3C Trace Context 传播标准（traceparent 头）。

## 八、面试题
trace_id 与 span_id 的关系？上下文传播失败会怎样？

## 九、演进与趋势
eBPF 无侵入采集让追踪覆盖更全面，减少手动埋点。

## 十、小结
分布式追踪用上下文传播把分散 Span 还原成因果链，是定位跨服务问题的利器。
