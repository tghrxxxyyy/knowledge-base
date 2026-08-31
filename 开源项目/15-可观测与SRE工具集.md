# 可观测与 SRE 工具集（开源精选）

> 板块：开源项目 　|　 返回：[README](README.md)
> 覆盖：指标、日志、链路、告警、SLO。通行开源项目。

## 一、一句话定位

可观测性 = 用 Metrics/Logs/Traces 回答「系统现在怎样、为何异常、在哪」。SRE 用 SLO/错误预算把稳定性量化。

## 二、指标（Metrics）

- **Prometheus**：拉模型采集 + TSDB，PromQL 强大。服务暴露 `/metrics` 即可被抓。
- **Grafana**：可视化与告警面板，多数据源。
- **VictoriaMetrics / Thanos / Mimir**：Prometheus 的水平扩展/长存方案。
- 四大黄金信号：延迟、流量、错误、饱和度。

```yaml
# Prometheus 抓取配置（节选）
scrape_configs:
  - job_name: api
    static_configs:
      - targets: ['api:8080']
```

## 三、日志（Logs）

- **Loki**：轻量日志，索引少、与 Grafana 一体。
- **ELK（Elasticsearch+Logstash+Kibana）**：全功能日志分析，重但强。
- **Fluent Bit / Vector**：日志采集与转发。
- 原则：结构化（JSON）、带 trace_id 关联链路。

## 四、链路（Traces）

- **OpenTelemetry**：可观测数据采集标准（指标/链路/日志统一），厂商无关。
- **Jaeger / Tempo**：链路存储与查询。
- 价值：定位「哪个服务、哪个方法慢」，下钻根因。

## 五、关联三支柱

```
告警(Metrics) → 下钻链路(Traces) → 看日志(Logs)，三者用 trace_id 串联
```

## 六、告警与 OnCall

- **Alertmanager**：Prometheus 告警路由、去重、静默、分组。
- **SLO 驱动**：错误预算烧完则冻结发布。详见 [SRE/SLO与错误预算实践](../SRE/SLO与错误预算实践.md)。
- 告警要可行动，避免狼来了。

## 七、Profiling 与诊断

- **Pyroscope / Parca / continuous profiling**：持续采样，定位 CPU/内存热点。
- **pprof（Go）**：原生性能剖析。

## 八、事件与复盘

- **Incident 管理**：PagerDuty/开源替代，OnCall 轮值。
- **无指责复盘（blameless postmortem）**：时间线→根因→行动项。

## 九、常见坑

- 只装不告警 → 看不见故障。
- 日志无 trace_id → 无法关联。
- 指标过多 → 抓不住重点。
- 采样过低 → 漏慢请求。
- SLO 设 100% → 永远超支。

## 十、延伸阅读

- [SRE/可观测性三支柱实战](../SRE/可观测性三支柱实战.md)
- [SRE/故障演练与稳定性保障](../SRE/故障演练与稳定性保障.md)
- [云原生/README](../云原生/README.md)
