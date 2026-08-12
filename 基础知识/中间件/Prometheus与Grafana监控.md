# Prometheus + Grafana（监控告警事实标准）

> Prometheus + Grafana 是云原生监控的事实标准：Prometheus 负责采集/存储/告警，Grafana 负责可视化。相比 Zabbix（传统）、ELK（日志为主），Prometheus 以**Pull 模型 + 时序数据库 + PromQL + 服务发现**成为 K8s 监控首选。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 动态目标 | K8s Pod 动态调度，Push 模型（Zabbix）需手动注册 |
| 多维数据 | 监控指标需要按实例/服务/接口等多维度聚合 |
| 告警联动 | 指标→告警→通知需要灵活配置 |
| 可视化 | 通用 Dashboard 展示所有服务指标 |

> 核心认知：**Prometheus 是「指标监控系统」，不是日志系统（那是 ELK/Loki）**——两者互补。

---

## 二、Prometheus 核心原理

### 2.1 架构

```
Prometheus Server
  ├── 服务发现（K8s/Consul/静态） → 自动发现监控目标
  ├── Pull 采集（HTTP GET /metrics）→ 抓取指标
  ├── TSDB（时序数据库）→ 本地存储
  ├── PromQL → 查询语言
  ├── Alertmanager → 告警分组/抑制/路由
  └── Remote Write → 远程长期存储（Thanos/Cortex）
```

### 2.2 数据模型

- **时间序列**：`metric_name{label1="v1", label2="v2"} value @timestamp`
- **指标类型**：

| 类型 | 说明 | 示例 |
|------|------|------|
| Counter | 只增不减（重启归零） | 请求总数、错误数 |
| Gauge | 可增可减 | 内存使用、连接数 |
| Histogram | 分布统计（桶计数） | 请求延迟分布 |
| Summary | 分位数（客户端计算） | TP99 延迟 |

**选型关注点**：延迟统计用 Histogram（服务端可聚合）而非 Summary（客户端计算不可聚合）。

### 2.3 Pull vs Push

| 模型 | 代表 | 优势 | 劣势 |
|------|------|------|------|
| Pull | Prometheus | 服务端控制采集频率、目标是否存活一目了然 | 不适合短任务（Pushgateway 补救） |
| Push | InfluxDB/StatsD | 适合短任务、批量作业 | 目标不可控、易压垮服务端 |

**选型关注点**：K8s 场景首选 Pull（服务发现原生支持）；批处理/短任务用 Pushgateway 或 Push 模型。

### 2.4 PromQL（查询语言）

- **即时查询**：`http_requests_total{job="api"}`
- **范围查询**：`rate(http_requests_total[5m])`（5 分钟内的每秒速率）
- **聚合**：`sum by (instance) (rate(...))`
- **预测**：`predict_linear(node_disk_free[6h], 3600*24)`（预测 24 小时后磁盘满）

**选型关注点**：PromQL 是 Prometheus 的核心竞争力，比 Zabbix 的触发器灵活得多。

### 2.5 告警（Alertmanager）

```
Prometheus 评估告警规则 → 触发告警 → Alertmanager
  ├── 分组（Group）：同类告警合并（如整个集群告警合并为一条）
  ├── 抑制（Inhibition）：高优先级抑制低优先级（集群宕机抑制单实例告警）
  ├── 静默（Silence）：维护期间静默
  └── 路由（Route）：按严重度/团队路由到不同通知渠道（邮件/钉钉/Slack/PagerDuty）
```

**选型关注点**：Alertmanager 的「分组+抑制」是生产告警必备（避免告警风暴）。

---

## 三、Grafana（可视化层）

- **定位**：指标可视化 Dashboard，数据源支持 Prometheus/InfluxDB/ES/MySQL 等 100+
- **特性**：丰富的图表类型、模板变量、告警（Grafana Alerting）、插件生态
- **选型关注点**：Prometheus 自带 UI 简陋，生产必配 Grafana。

---

## 四、存储与长期保存

| 方案 | 说明 |
|------|------|
| 本地存储（TSDB） | 默认，SSD 推荐，保留 15 天~数月 |
| Remote Write | 写入 Thanos/Cortex/Mimir 长期存储 |
| Thanos | 对象存储（S3/OSS）长期存储 + 全局视图 + 降采样 |
| Cortex/Mimir | 水平扩展多租户长期存储 |
| VictoriaMetrics | 兼容 Prometheus API，更高压缩比，更易运维 |

**选型关注点**：大规模集群 → Thanos/Mimir/VictoriaMetrics（水平扩展+长期存储）；小规模 → 本地 TSDB 足够。

---

## 五、Exporter 生态（指标采集）

| Exporter | 采集对象 |
|----------|----------|
| node_exporter | 主机 CPU/内存/磁盘/网络 |
| kube-state-metrics | K8s 资源对象状态（Pod/Deployment/Node） |
| mysql_exporter | MySQL 指标 |
| redis_exporter | Redis 指标 |
| kafka_exporter | Kafka 指标 |
| blackbox_exporter | 黑盒探测（HTTP/DNS/TCP 存活） |
| JMX_exporter | Java 应用（JVM/应用指标） |
| 自定义 | 应用内置 `/metrics`（Prometheus Client SDK） |

**选型关注点**：K8s 监控 = node_exporter + kube-state-metrics + cAdvisor（容器资源）+ 业务自定义指标。

---

## 六、Prometheus vs Zabbix vs Nagios vs 云监控

| 维度 | Prometheus | Zabbix | Nagios | 云监控（CloudWatch/云监控） |
|------|------------|--------|--------|---------------------------|
| 模型 | Pull + 服务发现 | Agent + Server | Agent + Server | 云内集成 |
| 数据模型 | 多维时序 | 扁平指标 | 状态检查 | 多维 |
| 查询 | PromQL（强大） | 触发器（弱） | 无 | 类 SQL |
| 可视化 | Grafana（强） | 内置（中） | 弱 | 内置 |
| 服务发现 | 原生（K8s/Consul） | 自动发现（中） | 手动 | 云内自动 |
| 告警 | Alertmanager（强） | 内置（中） | 内置（弱） | 内置 |
| 长期存储 | 需 Thanos/Cortex | 内置 | 无 | 内置 |
| 开源 | 是 | 是 | 是 | 否 |

**选型关注点**：K8s/云原生 → Prometheus（事实标准）；传统 IT/虚拟机 → Zabbix；云上 → 原生云监控（免运维）+ Prometheus（多云统一）。

---

## 七、K8s 监控体系（Prometheus Stack）

```
kube-prometheus-stack（Helm 一键安装）
  ├── Prometheus（指标采集/告警）
  ├── Grafana（可视化）
  ├── Alertmanager（告警路由）
  ├── node_exporter（节点指标）
  ├── kube-state-metrics（K8s 对象指标）
  ├── Prometheus Operator（CRD 管理监控配置）
  └── 预置 Dashboard + 告警规则
```

**选型关注点**：K8s 集群 → kube-prometheus-stack 是事实标准（GitHub 50k+ stars）。

---

## 八、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| K8s 监控 | Prometheus + Grafana | 云监控 |
| 传统主机监控 | Zabbix | Prometheus + node_exporter |
| 多云统一监控 | Thanos + Grafana | Datadog/New Relic |
| 日志监控 | ELK/Loki | — |
| 长期存储 | Thanos/Mimir | VictoriaMetrics |
| 应用埋点 | Prometheus Client SDK | Micrometer（Spring Boot） |

---

## 九、与其他板块的关系

- 可观测性三支柱见「[云上可观测性体系](./云上可观测性体系.md)」；
- 监控告警规则库见「[场景设计/生产问题排查实战](../../场景设计/生产问题排查实战：常见故障与处置步骤.md)」；
- SRE 可观测性看护见「[SRE/可观测性与稳定性看护](../../SRE与稳定性工程/02-可观测性与稳定性看护.md)」；
- Grafana Loki 日志见「[ELK 日志体系](./ELK日志体系.md)」。

> 一句话：**Prometheus + Grafana = Pull + 多维时序 + PromQL + 服务发现 + Alertmanager（分组/抑制/路由）；选型先看「环境（K8s/传统/云）」，再定「规模（本地 TSDB/Thanos 长期存储）」，最后配「Exporter 生态」。**
