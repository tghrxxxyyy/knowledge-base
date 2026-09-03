# 与 Prometheus 栈集成

> 对应 Prometheus/Grafana/OTel 生态。

## 一、背景与挑战

需现成栈采集、存储、告警与看板；避免重复造轮。

## 二、核心原理

服务暴露 /metrics（Prometheus 拉取），OTel 采集 trace，Grafana 看板与 Alertmanager 告警；远端写降单机压力。

## 三、数学形式

抓取间隔 $i$ 决定指标分辨率；留存 $T$ 控存储；告警规则基于 $p99>\tau$。

## 四、代码实现

```python
from prometheus_client import start_http_server
start_http_server(8000)   # 暴露 metrics
```

## 五、与其他对比

- 与 弹性推理自动伸缩深入（HPA 读指标）闭环；
- 与 推理服务可观测性总览 是同一栈。

## 六、常见误区

- 抓取间隔过密压服务；
- 告警阈值静态不随负载。

## 七、与开源书对应

- llm-course：https://github.com/mlabonne/llm-course
- datawhalechina/llm-universe：https://github.com/datawhalechina/llm-universe

## 八、面试题

- Prometheus 如何采集？答：拉模型从 /metrics 周期抓取并存储时序。

## 九、演进

单体监控 → Prometheus → OTel 统一。

## 十、小结

Prometheus 栈提供采集到告警闭环，是主流可观测方案。
