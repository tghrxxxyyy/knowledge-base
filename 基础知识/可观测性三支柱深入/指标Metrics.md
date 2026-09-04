# 指标Metrics

> 对应可观测性三支柱之一：Metrics（数值时间序列）。

## 一、背景与挑战
指标以聚合数值反映系统健康，适合告警与趋势。但聚合会丢失个体细节（长尾用户被均值掩盖）。

## 二、核心原理
- 类型：Counter（只增）、Gauge（可升降）、Histogram（分桶统计分布）、Summary（分位数）。
- RED 方法：Rate（请求率）、Errors（错误率）、Duration（延迟）。
- 维度（label）用于切片，但高基数（high cardinality）会爆炸存储。
- 采样/降采样平衡精度与成本。

## 三、形式化 / 数学基础
- 速率：$rate = \frac{C(t_2)-C(t_1)}{t_2-t_1}$（Counter 差分）。
- 分位数：$Q_p$ 满足 $P(X \le Q_p)=p$；Histogram 近似 $Q_p \approx$ 累加到 $p$ 的桶边界。
- 高基数风险：序列数 $\approx \prod |\text{label}_i|$，存储与查询成本随其增长。
- 误差界限（Summary）：基于 φ-quantile 滑动窗口估计。

## 四、代码实现
```promql
# PromQL：每秒请求率（5m 窗口）
rate(http_requests_total[5m])
# P99 延迟（Histogram 桶）
histogram_quantile(0.99, sum(rate(http_latency_bucket[5m])) by (le))
```

## 五、与其他技术对比
- 日志：事件级细节但成本高；指标：聚合便宜但丢细节。
- 追踪：单次请求链路；指标：全局聚合。
- StatsD vs Prometheus：推 vs 拉模型。

## 六、常见误区
- 用平均延迟掩盖长尾（应用分位数）。
- 给指标加高基数 label（如 user_id）拖垮存储。
- Counter 重置（重启）未处理导致负值率。

## 七、与开源书 / 权威来源对应
- Prometheus 官方文档与《Prometheus: Up & Running》。
- Google SRE Book（Monitoring Distributed Systems）。

## 八、面试题
- Counter 与 Gauge 区别？
- 为什么 P99 比平均更有用？
- 高基数（cardinality）为何危险？

## 九、演进与趋势
OpenTelemetry 统一语义约定；长时序存储（Thanos/Mimir）；eBPF 原生指标。

## 十、小结
指标用 Counter/Gauge/Histogram 提供聚合视图，须用分位数并控制基数才能真正反映体验。
