# API 网关与服务网格开源生态

> 本文梳理流量入口层的两类基础设施：API 网关（南北向）与服务网格（东西向）。覆盖 APISIX、Kong、Shenyu、Envoy、Istio、Linkerd 等开源项目，讲清定位差异、数据面/控制面架构、插件机制与适用场景。

## 1. 两个方向的流量治理

- **南北向（North-South）**：外部客户端 → 服务端，通常指 API 网关，负责鉴权、限流、路由、协议转换、灰度。
- **东西向（East-West）**：服务 → 服务，通常指服务网格，负责 mTLS、熔断、重试、流量切分、可观测，对应用透明（sidecar 注入）。

二者重叠但不替代：网关是"公司大门"，网格是"内部走廊"。大型架构常二者并存：外部流量经网关进入，内部服务间调用走网格。

## 2. API 网关选型

### 2.1 APISIX

APISIX 是 Apache 顶级项目，基于 Nginx + OpenResty + etcd，数据面高性能，控制面通过 etcd 下发配置，热更新无需 reload。

核心特性：

- **全动态配置**：路由、上游、插件全在 etcd，变更毫秒级生效，不重启。
- **丰富插件生态**：限流（漏桶/令牌桶）、鉴权（JWT/Key Auth/OAuth）、可观测（Prometheus、SkyWalking）、Serverless（走 AWS Lambda / 自定义）。
- **多协议**：HTTP/gRPC/WebSocket/MQTT，支持作为 API 网关和 K8s Ingress（apisix-ingress-controller）。
- **高性能**：基于 Nginx 事件模型，单机可扛高并发。

适用：需要高性能、动态配置、插件化、云原生友好的网关。国内采用率高。

### 2.2 Kong

Kong 同样基于 OpenResty/Nginx，早期用 PostgreSQL/Cassandra 存储配置，后续支持 DB-less（声明式配置）与 Hybrid 模式（控制面 DB + 数据面无 DB）。

特性：

- **插件市场成熟**：鉴权、限流、ACL、bot 检测等，商业版提供更多（如开发者门户、AI 网关）。
- **企业化**：Kong Gateway（企业版）在可观测、多租户上更强。
- **Kubernetes Ingress**：Kong Ingress Controller。

适用：已有 OpenResty 技术栈、需要成熟插件与企业支持的团队。

### 2.3 Shenyu（原 Soul 网关）

Shenyu 是 Apache 项目，基于 Java（WebFlux/Netty）实现，强调"响应式"与丰富的 Java 生态插件，支持 Dubbo/gRPC/Spring Cloud 等多种协议接入，适合 Java 微服务栈。

### 2.4 三者在定位上的差异

| 项目 | 实现语言 | 配置存储 | 突出特点 |
|---|---|---|---|
| APISIX | Lua/OpenResty | etcd | 全动态、高性能、插件多 |
| Kong | Lua/OpenResty | PG/Cassandra/DB-less | 企业化、插件市场 |
| Shenyu | Java/WebFlux | 多种（Admin + 注册中心） | Java 栈、响应式、多协议 |

## 3. 服务网格：Envoy 是事实数据面

### 3.1 Envoy

Envoy 是高性能 C++ 代理，作为 sidecar 拦截服务流量。它把"连接管理、负载均衡（含一致性哈希/最少请求）、熔断、重试、可观测、mTLS"下沉到代理层。

关键能力：

- **xDS 协议**：通过 ADS（Aggregated Discovery Service）与控制面动态下发监听器（LDS）、路由（RDS）、集群（CDS）、端点（EDS）、密钥（SDS）等配置。
- **可观测内建**：原生暴露统计、访问日志、分布式追踪头传播。
- **协议支持广**：HTTP/1、HTTP/2、gRPC、TCP、MongoDB、Redis 等。

Envoy 本身只是数据面，需要控制面告诉它"该怎么做"。

### 3.2 Istio

Istio 是最主流的服务网格控制面，使用 Envoy 作为数据面，提供：

- **流量管理**：基于 VirtualService/DestinationRule 做路由、灰度（按权重/canary）、故障注入。
- **安全**：自动 mTLS、PeerAuthentication/AuthorizationPolicy。
- **可观测**：集成 Prometheus、Jaeger、Kiali。
- **架构演进**：早期 Mixer 组件已废弃，转向"Envoy 内 Wasm/Telemetry"与更轻的 istiod（合并 Pilot、Citadel、Galley）。

适用：Kubernetes 内需要精细化流量治理、零信任安全、统一可观测的大型微服务。

局限：复杂度与资源开销大（每 Pod 一 sidecar + 控制面），中小团队未必值得。

### 3.3 Linkerd

Linkerd 以"极简、轻量"为哲学，数据面用 Rust 编写的 micro-proxy（linkerd2-proxy），比 Envoy 更轻、启动更快。控制面简单，开箱即用 mTLS 与黄金指标。

适用：想要"网格能力但不想背 Istio 复杂度"的 K8s 团队。功能面比 Istio 窄，但够用且更稳。

### 3.4 网格与网关对比

| 维度 | 网关（APISIX/Kong） | 网格（Istio/Linkerd） |
|---|---|---|
| 流量方向 | 南北向（外部） | 东西向（内部） |
| 部署形态 | 独立集群/实例 | sidecar 注入 |
| 主要能力 | 鉴权限流路由灰度 | mTLS 熔断重试切流 |
| 对应用侵入 | 低（入口处） | 极低（透明代理） |
| 复杂度 | 中 | 中高（Istio） |

## 4. 典型架构组合

```
   用户
     │
     ▼
 [APISIX/Kong 网关]  ── 鉴权/限流/路由 ──▶
                                     │
                              ┌──────┴──────┐
                              │  K8s 集群    │
                              │  [svc A]──┐  │
                              │  [Envoy]  │  │ Istio sidecar
                              │  [svc B]◀┘  │
                              └─────────────┘
```

外部流量经网关统一鉴权限流；进入集群后，服务间调用由 sidecar 透明做 mTLS 与重试熔断。

## 5. 插件与扩展机制

- **网关插件**：APISIX 用 Lua 插件 + 热加载；Kong 用 Lua 插件 + PDK；Shenyu 用 Java 插件 + SPI。扩展点通常是"请求前/后、响应前/后、上游前"等阶段。
- **网格扩展**：Istio 支持 Wasm 插件（EnvoyFilter / WasmPlugin）注入自定义过滤逻辑，避免改 Envoy 源码。

## 6. 常见踩坑

1. **网关成为单点瓶颈**：未做水平扩展与连接池调优，高并发下连接耗尽；需多副本 + 合理的 upstream 健康检查。
2. **配置下发延迟导致路由不一致**：网关依赖 etcd/DB，网络抖动时配置滞后，需监控配置同步状态。
3. **服务网格资源开销被低估**：sidecar 内存随连接数增长，需设 `concurrency` 限制与合理的资源 request/limit。
4. **mTLS 与旧服务不兼容**：某些老客户端不支持，需渐进开启（permissive 模式）再强制。
5. **灰度路由规则冲突**：VirtualService 匹配顺序与权重配置错误导致流量误打，需充分测试。

## 7. 选型建议

- Java 栈微服务 + 高性能动态网关 → **APISIX** 或 **Shenyu**。
- 已有 OpenResty/企业支持诉求 → **Kong**。
- K8s 内需要完整流量治理与零信任 → **Istio**。
- K8s 内想要轻量网格 → **Linkerd**。
- 二者可并存：网关管外部，网格管内部。

## 8. 小结

网关与网格解决不同层的流量问题：网关是"守门员"，网格是"内部交通指挥"。现代云原生架构中，二者协同提供从入口到服务间的全链路治理。选型时优先看团队技术栈、运维能力与真实流量规模，而非一味追求功能最全。
