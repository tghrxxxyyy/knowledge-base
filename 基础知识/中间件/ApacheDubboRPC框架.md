# Apache Dubbo（RPC 框架 / 微服务通信）

> Dubbo 是阿里开源的**高性能 RPC 框架**，以「透明远程调用 + 服务治理（注册/发现/路由/限流/降级）+ 多协议/多注册中心」成为 Java 微服务通信的首选。相比 gRPC（跨语言强但服务治理弱）、Spring Cloud HTTP（性能低），Dubbo 以**Triple 协议（gRPC 兼容）+ 服务治理能力**独树一帜。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 远程调用透明化 | 像调用本地方法一样调用远程服务，不用写 HTTP 模板代码 |
| 服务注册发现 | 服务实例动态上下线，调用方自动感知 |
| 负载均衡 | 多实例间智能分配请求（轮询/随机/一致性哈希/最少活跃） |
| 服务治理 | 路由规则、权重、灰度、降级、限流、熔断 |
| 高性能通信 | 比 HTTP/JSON 更高的吞吐、更低的延迟 |

> 核心认知：**Dubbo = 高性能 RPC + 服务治理框架**——不只是「能调通」，更是「调得好、管得住」。

---

## 二、Dubbo 核心原理

### 2.1 架构

```
Consumer（消费者）
  ├── Proxy（动态代理：生成接口的代理对象）
  ├── Cluster（集群容错：Failover/Failfast/Failsafe）
  ├── Directory（目录：从注册中心获取服务列表）
  ├── Router（路由：条件路由、标签路由）
  ├── LoadBalance（负载均衡：Random/RoundRobin/LeastActive/ConsistentHash）
  ├── Filter（过滤器链：超时/限流/降级/监控）
  └── Invoker（远程调用执行器）
      ├── Protocol（协议：Dubbo/Triple/HTTP）
  ├── Exchange（信息交换：请求/响应模型）
  ├── Transport（网络传输：Netty/Mina/Grizzly）
  └── Serialization（序列化：Hessian2/JSON/Protobuf）

Provider（提供者）
  ├── Export（暴露服务）
  └── Invoke（执行本地实现）
```

### 2.2 调用流程

1. Consumer 调用接口方法 → Proxy 拦截
2. Proxy → Cluster 选择集群策略
3. Directory 从注册中心（Nacos/ZK）获取服务列表
4. Router 按规则过滤列表
5. LoadBalance 选一个实例
6. Filter 链执行（超时/限流/降级）
7. Protocol 编码 → Transport 发送（Netty）
8. Provider 接收 → 解码 → 执行方法 → 返回结果

### 2.3 协议体系

| 协议 | 说明 | 适用场景 |
|------|------|----------|
| Dubbo 协议 | 单一长连接 + NIO 异步 + Hessian2 序列化（默认） | 内网高性能 RPC |
| Triple 协议 | 基于 HTTP/2 + Protobuf（gRPC 兼容） | 跨语言/网关穿透 |
| REST | HTTP + JSON | 对外开放 API |
| gRPC | 原生 gRPC | 跨语言微服务 |

**选型关注点**：内网高性能 → Dubbo 协议（默认）；跨语言/网关 → Triple（gRPC 兼容，Dubbo 3 默认）。

### 2.4 序列化

| 序列化 | 说明 | 性能 |
|--------|------|------|
| Hessian2 | Dubbo 默认，跨语言 | 高 |
| Protobuf | Triple 协议默认，跨语言 | 最高 |
| JSON | REST 协议默认 | 低 |
| Kryo/FST | Java 专用 | 高 |

**选型关注点**：跨语言 → Protobuf/Hessian2；纯 Java 且追求极致性能 → Kryo/FST。

### 2.5 负载均衡策略

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| Random | 随机 + 权重（默认） | 通用 |
| RoundRobin | 轮询 + 权重 | 请求耗时均匀 |
| LeastActive | 选最少活跃调用 | 请求耗时差异大 |
| ConsistentHash | 一致性哈希 | 有状态路由（同一参数→同实例） |
| ShortestResponse | 最短响应 | 自动感知实例性能 |

**选型关注点**：请求耗时差异大 → LeastActive；有状态（如购物车）→ ConsistentHash。

### 2.6 集群容错

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| Failover | 失败自动切换（默认，重试 N 次） | 读操作（幂等） |
| Failfast | 快速失败（不重试） | 非幂等写操作 |
| Failsafe | 失败忽略（记日志） | 不重要操作 |
| Forking | 并行调多个，一个成功即返回 | 实时性要求高 |
| Broadcast | 广播所有实例 | 通知/缓存刷新 |

**选型关注点**：幂等读 → Failover；非幂等写 → Failfast（避免重复扣款）。

---

## 三、Dubbo 3（云原生时代）

| 特性 | 说明 |
|------|------|
| 应用级服务发现 | 从「接口级」升级到「应用级」，注册中心压力降 10 倍+ |
| Triple 协议 | 默认 HTTP/2 + Protobuf，gRPC 兼容，网关穿透友好 |
| 流量治理 | 与 Sentinel 集成，条件路由/标签路由/动态配置 |
| 极致性能 | 比 Dubbo 2 提升 50% 吞吐 |
|  Mesh 支持 | 支持 Sidecar 模式（Dubbo Mesh） |

**选型关注点**：新项目 → Dubbo 3（Triple + 应用级发现）；存量 Dubbo 2 → 渐进升级。

---

## 四、Dubbo vs gRPC vs Spring Cloud

| 维度 | Dubbo | gRPC | Spring Cloud |
|------|-------|------|--------------|
| 语言 | Java 为主（Triple 跨语言） | 跨语言（多语言 SDK） | Java |
| 协议 | Dubbo/Triple（HTTP/2） | HTTP/2 + Protobuf | HTTP/REST |
| 序列化 | Hessian2/Protobuf | Protobuf | JSON |
| 性能 | 高 | 高 | 中 |
| 服务治理 | 强（路由/限流/降级） | 弱（需自己集成） | 强（Hystrix/Gateway） |
| 注册中心 | Nacos/ZK/ Consul/ etcd | 需自己集成 | Eureka/Nacos |
| 网关穿透 | Triple（HTTP/2 友好） | HTTP/2 友好 | HTTP 友好 |
| 跨语言 | Triple 支持 | 强 | 弱（Java） |
| 社区 | 阿里，活跃 | Google，活跃 | Spring，活跃 |

**选型关注点**：Java 微服务 + 强服务治理 → **Dubbo**；跨语言/多语言栈 → **gRPC**；Spring 生态 + REST → **Spring Cloud**。

---

## 五、Dubbo 注册中心选型

| 注册中心 | 说明 | 推荐场景 |
|----------|------|----------|
| Nacos | 阿里开源，注册+配置一体 | 国内业务首选（与 Spring Cloud Alibaba 集成） |
| ZooKeeper | 老牌 CP 协调 | 已有 ZK 基础设施 |
| Consul | 注册+配置+健康检查 | 多数据中心 |
| etcd | 云原生 CP 协调 | K8s 环境 |
| Kubernetes | K8s 原生服务发现 | K8s 环境（Dubbo 3 支持） |

**选型关注点**：Spring Cloud Alibaba 生态 → Nacos（注册+配置一体，Dubbo + Nacos 是黄金组合）。

---

## 六、Dubbo 生产实践

### 6.1 关键配置

| 配置 | 说明 |
|------|------|
| 超时（timeout） | 调用超时时间（默认 1000ms，建议根据 P99 设置） |
| 重试（retries） | 失败重试次数（幂等读 2-3 次，写 0 次） |
| 负载均衡 | 按场景选择（LeastActive/ConsistentHash） |
| 集群容错 | Failover（读）/ Failfast（写） |
| 限流 | Sentinel 集成 |
| 异步调用 | `async=true` 异步调用（提升吞吐） |

### 6.2 监控

- **Dubbo Admin**：控制台（服务管理/监控/配置/路由规则）
- **Prometheus**：Dubbo Metrics（QPS/RT/成功率/异常数）
- **SkyWalking**：Dubbo 调用链路追踪（自动埋点）

---

## 七、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| Java 微服务 RPC | Dubbo 3 | gRPC |
| 跨语言 RPC | gRPC | Dubbo 3（Triple） |
| 高性能内网调用 | Dubbo 协议 | gRPC |
| 网关穿透 | Triple（HTTP/2） | REST |
| 服务治理（路由/限流） | Dubbo + Sentinel | Spring Cloud |
| 注册中心 | Nacos | ZooKeeper |

---

## 八、与其他板块的关系

- 源码精读见「[源码系列/Dubbo 源码](../../源码系列/Dubbo源码.md)」；
- 注册中心见「[注册中心与配置中心](./注册中心与配置中心.md)」；
- 限流熔断见「[Sentinel 限流熔断](./Sentinel限流熔断.md)」；
- 链路追踪见「[链路追踪 SkyWalking](./链路追踪SkyWalking.md)」；
- RPC 协议原理见「[网络协议深挖](../../基础知识/网络协议深挖.md)」。

> 一句话：**Dubbo = 高性能 RPC（Dubbo/Triple 协议 + Hessian2/Protobuf 序列化）+ 服务治理（注册发现/负载均衡/集群容错/流量治理）+ 云原生（应用级发现 + Mesh 支持）；选型先看「语言栈（纯 Java → Dubbo，跨语言 → gRPC）」，再定「协议（内网 → Dubbo 协议，网关穿透 → Triple）」，最后配「注册中心（Nacos）」。**
