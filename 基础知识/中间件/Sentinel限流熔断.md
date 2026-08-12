# Sentinel（限流 / 熔断 / 降级 / 流量治理）

> Sentinel 是阿里开源的**流量治理组件**，以「限流/熔断/降级/热点/系统保护/授权」六大防护能力，替代已停更的 Hystrix。相比 Hystrix（线程隔离重）、Resilience4J（需编码），Sentinel 以**控制台 + 规则动态生效 + 流量塑形**成为 Java 生态流量治理首选。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 流量突增 | 大促/秒杀瞬间 QPS 远超系统容量，需限流保护 |
| 下游故障 | 依赖服务挂了，调用方线程池被占满（雪崩），需熔断 |
| 资源耗尽 | CPU/内存到阈值，需系统自适应保护 |
| 热点参数 | 某商品 ID 被疯狂访问，需热点参数限流 |
| 流量不均 | 多实例负载不均，需流量塑形/匀速通过 |

> 核心认知：**Sentinel 是「流量哨兵」**——站在入口/出口，对流量做识别、管控、塑形，保护系统不被打垮。

---

## 二、Sentinel 核心原理

### 2.1 架构

```
调用方 → Sentinel 资源（接口/方法/代码块）
  ├── Slot Chain（插槽链，责任链模式）
  │   ├── NodeSelectorSlot（资源入口记录）
  │   ├── ClusterBuilderSlot（全局统计）
  │   ├── StatisticSlot（实时统计：QPS/线程数/异常）
  │   ├── FlowSlot（限流规则校验）
  │   ├── CircuitBreakingSlot（熔断规则校验）
  │   ├── SystemSlot（系统保护规则校验）
  │   └── AuthoritySlot（授权规则校验）
  ├── 规则匹配 → 通过/拒绝/等待
  └── 实时指标 → Sentinel Dashboard/控制台
```

### 2.2 核心概念

| 概念 | 说明 |
|------|------|
| 资源（Resource） | 被保护的对象（接口/方法/代码块），用 `SphU.entry("resourceName")` 标记 |
| 规则（Rule） | 限流/熔断/降级/系统保护/热点/授权规则 |
| 插槽（Slot） | 规则校验的执行单元（责任链） |
| 上下文（Context） | 当前调用的上下文（资源/入口/调用者） |
| Node（节点） | 实时统计节点（ClusterNode/DefaultNode/EntranceNode） |

### 2.3 限流算法

| 算法 | 原理 | 适用场景 |
|------|------|----------|
| 直接拒绝 | 超阈值直接抛异常 | 对延迟不敏感 |
| Warm Up（冷启动） | 阈值从 `count/冷启动因子` 线性增长到 count | 系统从冷态到热态（避免冷启动打垮） |
| 匀速排队（RateLimiter） | 请求以固定间隔通过（令牌桶） | 流量塑形（脉冲变平滑） |
| 协同限流 | 全局 Token Server 统一分配 | 集群精确限流 |

**选型关注点**：脉冲流量 → 匀速排队（变脉冲为平稳）；冷启动场景 → Warm Up；精确限流 → 协同限流。

### 2.4 熔断策略

| 策略 | 触发条件 | 恢复 |
|------|----------|------|
| 慢调用比例 | 慢调用（超 RT 阈值）占比达阈值 | 熔断后经过熔断时长进入 Half-Open |
| 异常比例 | 异常调用占比达阈值 | Half-Open 时放行一个请求，成功则恢复 |
| 异常数 | 异常数达阈值 | 同上 |

**选型关注点**：慢调用熔断（下游变慢但没挂）→ 慢调用比例；异常熔断（下游挂了）→ 异常比例。

### 2.5 流量控制（FlowControl）

- **QPS 阈值**：每秒请求数上限
- **线程数阈值**：同时处理该资源的线程数上限（信号量隔离）
- **调用方区分**：按调用方（appkey）分别限流（防止某调用方打爆全局）
- **关联限流**：资源 A 被限流时，资源 B 也被限流（如写库限流→读库也限流）

---

## 三、Sentinel 控制台（Dashboard）

| 功能 | 说明 |
|------|------|
| 实时监控 | 秒级 QPS/异常/通过/拒绝曲线 |
| 资源管理 | 查看应用所有资源 |
| 规则配置 | 限流/熔断/降级/系统保护/热点/授权规则动态下发 |
| 机器管理 | 查看应用实例健康状态 |
| 集群限流 | Token Server 配置 |

**选型关注点**：Sentinel 控制台是「规则动态生效」的关键——规则修改无需重启应用（通过 Nacos/Apollo/ZooKeeper/文件 持久化）。

---

## 四、Sentinel vs Hystrix vs Resilience4J

| 维度 | Sentinel | Hystrix | Resilience4J |
|------|----------|---------|--------------|
| 语言 | Java | Java | Java |
| 隔离策略 | 信号量（线程数限） | 线程池/信号量（重） | 信号量 |
| 限流 | 丰富（QPS/线程/匀速/WarmUp） | 无 | 有（RateLimiter） |
| 熔断 | 慢调用/异常比例/异常数 | 异常比例 | 异常比例/慢调用 |
| 控制台 | 强（实时监控+规则下发） | Dashboard（弱，已停） | Micrometer + Grafana |
| 动态规则 | 是（多数据源） | 否 | 是（需配合配置中心） |
| 热点参数 | 是 | 否 | 否 |
| 系统保护 | 是（CPU/负载/入口QPS） | 否 | 否 |
| 授权规则 | 是（黑白名单） | 否 | 否 |
| 流量塑形 | 是（匀速排队） | 否 | 否 |
| 社区 | 阿里，活跃 | 停更 | 活跃 |

**选型关注点**：Java 生态流量治理 → **Sentinel**（功能最全+控制台最强）；Spring Cloud 生态 → Resilience4J（与 Spring Boot 集成好）；Hystrix 已停更，新项目不推荐。

---

## 五、Sentinel 与 Spring Cloud Alibaba 集成

```java
// 1. 引入依赖
// spring-cloud-starter-alibaba-sentinel

// 2. 资源标记
@SentinelResource(value = "getOrder", blockHandler = "getOrderBlock", fallback = "getOrderFallback")
public Order getOrder(String id) { ... }

// 3. 规则配置（Nacos 持久化）
// spring.cloud.sentinel.datasource.ds1.nacos.server-addr=...
// spring.cloud.sentinel.datasource.ds1.nacos.dataId=${spring.application.name}-flow-rules
// spring.cloud.sentinel.datasource.ds1.nacos.rule-type=flow
```

**选型关注点**：Spring Cloud Alibaba 生态 → Sentinel 是默认流量治理组件（与 Nacos/Seata 无缝集成）。

---

## 六、Sentinel 规则持久化

| 数据源 | 说明 |
|--------|------|
| 文件 | 本地文件（开发用） |
| Nacos | 推荐（与 Spring Cloud Alibaba 集成） |
| Apollo | 与 Apollo 配置中心集成 |
| ZooKeeper | 与 ZK 集成 |
| Consul | 与 Consul 集成 |
| etcd | 与 etcd 集成 |

**选型关注点**：生产环境必须持久化（否则重启规则丢失），推荐 Nacos（与 Spring Cloud Alibaba 生态一致）。

---

## 七、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 限流（QPS/线程） | Sentinel | Resilience4J |
| 熔断（慢调用/异常） | Sentinel | Resilience4J |
| 流量塑形（匀速通过） | Sentinel | — |
| 热点参数限流 | Sentinel | — |
| 系统自适应保护 | Sentinel | — |
| 黑白名单授权 | Sentinel | — |
| 实时监控+规则下发 | Sentinel Dashboard | — |
| Spring Cloud 生态 | Sentinel | Resilience4J |
| 网关层限流 | Sentinel Gateway | Redis + Lua |

---

## 八、与其他板块的关系

- 限流原理（令牌桶/漏桶/滑动窗口）见「[场景设计/稳定性三板斧](../../场景设计/稳定性三板斧：限流-熔断-降级.md)」；
- 分布式限流见「[Redis 实现限流](../../场景设计/redis实现限流.md)」；
- 服务网格流量治理见「[云原生/Service Mesh](../../云原生/ServiceMesh.md)」；
- 云上中间件总览见「[云上中间件体系总览](./云上中间件体系总览.md)」。

> 一句话：**Sentinel = 限流（QPS/线程/匀速/WarmUp）+ 熔断（慢调用/异常）+ 热点参数 + 系统保护 + 授权 + 控制台动态规则；选型先看「生态（Spring Cloud Alibaba → Sentinel）」，再定「规则持久化（Nacos）」，最后配「控制台监控」。**
