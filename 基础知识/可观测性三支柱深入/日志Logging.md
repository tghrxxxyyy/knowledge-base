# 日志Logging

> 对应可观测性三支柱之一：结构化日志（Structured Logging）。

## 一、背景与挑战
日志是事件级记录，便于排障，但海量文本日志难检索、体积大。需结构化（JSON）、分级、采样与脱敏。

## 二、核心原理
- 级别：TRACE/DEBUG/INFO/WARN/ERROR/FATAL，按环境调整阈值。
- 结构化：字段化（timestamp, level, trace_id, msg）便于查询。
- 关联：通过 trace_id 串联日志与追踪。
- 成本治理：采样、异步写、分级落盘、敏感字段脱敏（见日志脱敏）。

## 三、形式化 / 数学基础
- 日志量速率 $\lambda_l$ 与存储 $S = \lambda_l \times \text{avg\_size} \times T_{retention}$。
- 采样率 $s \in (0,1]$：保留日志比例，估计量需 $\div s$ 修正偏置。
- 级别过滤：仅当 $level \ge threshold$ 输出，降低 $\lambda_l$。
- 关联键 $k=trace\_id$ 使 $\text{Logs} \bowtie \text{Traces}$ 可连接。

## 四、代码实现
```go
// 结构化日志（zap 风格）
logger.Info("request handled",
    zap.String("trace_id", tid),
    zap.Int("status", 200),
    zap.Duration("latency", dt))
// 采样：每秒仅保留 10%
if atomic.AddUint64(&cnt,1)%100 < 10 { logger.Debug(...) }
```

## 五、与其他技术对比
- 指标：聚合便宜；日志：细节全但贵。
- printf 调试：临时不可检索；结构化日志：可查询长期。
- 追踪：跨服务链路；日志：单事件上下文。

## 六、常见误区
- 生产开 DEBUG 打满磁盘。
- 日志含明文密码/令牌（合规风险）。
- 用字符串拼接而非字段，无法检索。

## 七、与开源书 / 权威来源对应
- OpenTelemetry Logs 规范。
- Google SRE Book（Logging 章）。

## 八、面试题
- 为什么日志要结构化？
- 如何平衡日志成本与可排查性？
- 日志与追踪如何关联？

## 九、演进与趋势
OpenTelemetry 统一 Logs/Metrics/Traces；日志与追踪自动关联；边缘采样。

## 十、小结
结构化、分级、采样、脱敏的日志是可观测性的细节层，需与 trace_id 关联才能闭环。
