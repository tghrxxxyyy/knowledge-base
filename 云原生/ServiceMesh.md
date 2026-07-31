# Service Mesh（服务网格）

## 〇、本体介绍

**服务网格是什么**：把微服务之间的**通信治理**（熔断、重试、超时、限流、灰度、mTLS、可观测）从业务代码里**抽出来，下沉到一个独立的「Sidecar 代理」网络层**。应用只管发 HTTP/gRPC，流量被透明拦截到 Sidecar（如 Envoy），由 Sidecar 组成一张「网格」统一治理。

**解决什么痛点**：服务多了以后，每个语言/框架都自己实现一套重试/熔断/鉴权，重复且易错。Mesh 让治理能力**与语言无关、与业务解耦**，一次建设、全员受益。

**核心概念**：数据面（Data Plane，以 Envoy 等 Sidecar 组成）、控制面（Control Plane，如 Istio 的 istiod，下发配置/证书）、Sidecar 注入、VirtualService / DestinationRule、mTLS。

**适用场景**：多语言微服务、强治理需求（金融/大厂）、需要细粒度流量管理与零信任安全。
**不适用场景**：服务极少（杀鸡用牛刀）、对延迟极度敏感（多一跳 Sidecar 有少量开销）、团队运维 Mesh 能力不足。

---

## 一、为什么需要 Mesh（对比 SDK 模式）

| 方案 | 治理位置 | 优点 | 缺点 |
|------|---------|------|------|
| SDK / 框架内（如 Sentinel/Dubbo Filter） | 业务进程内 | 延迟低、依赖少 | 每语言各写一套、升级要改代码 |
| 服务网格（Sidecar） | 独立代理进程 | 语言无关、升级不停业务、统一策略 | 多一跳延迟、运维复杂、资源占用 |

> 一句话：**Mesh 用「部署与运维复杂度」换「语言无关的统一治理」**。

---

## 二、数据面与控制面

- **数据面（Data Plane）**：每个 Pod 注入一个 Envoy Sidecar，拦截进出流量（通过 iptables/IPVS 透明重定向）。所有服务间调用都经过 Sidecar。
- **控制面（Control Plane）**：Istio 的 **istiod** 负责：服务发现、把路由/策略编译下发到 Envoy、签发/轮换 mTLS 证书。Envoy 是「 dumb 数据面 + 聪明控制面」。

---

## 三、Sidecar 注入与流量拦截

- **注入**：命名空间打 `istio-injection=enabled` 标签，Pod 创建时自动加 Envoy 容器（也可以手动注入）。
- **拦截**：Init 容器用 `iptables` 把 Pod 的入/出流量重定向到 Envoy 端口，应用无感知。

---

## 四、流量治理 primitives（Istio 为例）

- **VirtualService**：定义「流量怎么走」——按比例灰度（90% 旧 / 10% 新）、基于Header 路由、超时、重试、故障注入（测试韧性）。
- **DestinationRule**：定义「到目标后怎么处理」——负载均衡策略（轮询/最少连接/一致性哈希）、连接池、熔断（最大连接/ pending 请求数）、mTLS 模式。
- **Gateway**：集群南北向（外部→内部）入口，类似 Ingress 但更灵活。

---

## 五、熔断与重试（对比 Sentinel）

Mesh 的熔断在 Sidecar 层：DestinationRule 设 `outlierDetection`（连续 5xx 多少次就把该实例「驱逐」一段时间）。重试在 VirtualService 设 `retries`（次数 + 超时 + 重试条件）。业务代码零改动。

---

## 六、mTLS 与零信任

- Mesh 默认给服务间通信加 **双向 TLS**（每个 Sidecar 有身份证书，自动签发轮换），实现「服务身份」而非「IP 信任」。
- 配合 **AuthorizationPolicy** 做「只允许 A 调 B」的细粒度访问控制，迈向零信任。

---

## 七、可观测性开箱即用

Mesh 天然能产出：
- **Metrics**：请求量、错误率、延迟（RED 指标），直接喂 Prometheus。
- **Traces**：自动注入 trace header，跨服务串联链路（OpenTelemetry）。
- **Topology**：自动绘制服务调用拓扑图。

---

## 八、典型生产架构

`入口 Gateway → 服务 A Sidecar → 服务 B Sidecar → …`；控制面 istiod 统一下发配置与证书；指标汇入 Prometheus/Grafana，链路入 Jaeger/Tempo。

---

## 九、与 API 网关的关系

- **网关（南北向）**：管「外部用户 → 集群」，做鉴权、WAF、聚合。如 Kong / API网关（见基础知识/中间件）。
- **Mesh（东西向）**：管「集群内服务 → 服务」，做服务间治理。
- 二者互补：网关在边界，Mesh 在内部；有的架构用网关 + Mesh 双层。

---

## 十、与其他板块的关系

- **架构 / 系统架构**：微服务、韧性模式（熔断/重试/舱壁）在 Mesh 上标准化。
- **场景设计 / 稳定性三板斧**：限流/熔断/降级可由 Mesh 承载，业务无感。
- **可观测性**：Mesh 是 traces/metrics 的重要来源。
- **Kubernetes 核心**：Mesh 依赖 K8s 的 Sidecar 注入与网络模型。

---

## 十一、速查表（Istio 概念）

| 概念 | 作用 |
|------|------|
| istiod | 控制面：发现/下发/证书 |
| Envoy | 数据面 Sidecar 代理 |
| VirtualService | 流量路由/重试/灰度 |
| DestinationRule | 负载均衡/连接池/熔断/mTLS |
| Gateway | 南北向入口 |
| AuthorizationPolicy | 零信任访问控制 |

---

## 面试高频问题（20+ 条）

1. **什么是服务网格？** 把服务间通信治理下沉到独立 Sidecar 代理层，与语言/业务解耦。
2. **为什么不用 SDK 模式？** SDK 每语言各写、升级改代码；Mesh 语言无关、统一策略、升级不停业务。代价是多一跳延迟与运维复杂。
3. **数据面 vs 控制面？** 数据面=Envoy Sidecar 组成网格实际转发；控制面=istiod 下发配置与证书。
4. **Envoy 是什么角色？** 高性能 Sidecar 代理，拦截进出流量并做治理，本身不存业务逻辑。
5. **Sidecar 如何透明拦截流量？** Init 容器用 iptables 把 Pod 流量重定向到 Envoy 端口，应用无感知。
6. **VirtualService 与 DestinationRule 区别？** 前者定义「流量怎么走」（路由/重试/灰度），后者定义「到目标怎么处理」（负载均衡/连接池/熔断/mTLS）。
7. **Mesh 怎么做熔断？** DestinationRule 的 outlierDetection 按连续错误数驱逐异常实例。
8. **Mesh 怎么做灰度发布？** VirtualService 按权重（如 10% 新版本）或 Header 路由分流。
9. **mTLS 是什么、价值？** 双向 TLS，服务间自动加密+身份认证，实现零信任（按身份而非 IP 授权）。
10. **证书怎么管理？** 控制面（istiod）基于 SPIFFE 自动签发/轮换，无需人工运维。
11. **Mesh 能产出哪些可观测数据？** RED 指标（请求/错误/延迟）、分布式 trace、调用拓扑。
12. **服务网格和 API 网关区别？** 网关管南北向（外部→集群），Mesh 管东西向（服务→服务）；互补双层。
13. **Sidecar 模式的资源开销？** 每个 Pod 多一个 Envoy 进程（CPU/内存），大规模需容量规划。
14. **Sidecar 延迟开销？** 每跳多一次本地代理转发（通常亚毫秒~几毫秒），一般可接受。
15. **Istio 和 Linkerd 区别？** Istio 功能全（VirtualService 等）、生态大；Linkerd 更轻量、简单、性能好。
16. **Mesh 适合小团队吗？** 不一定，运维复杂；服务少、治理简单时 SDK 模式更划算。
17. **什么是 xDS 协议？** Envoy 与控制面通信的 API 族（LDS/RDS/CDS/EDS…），控制面借此下发配置。
18. **服务注册发现 Mesh 怎么处理？** 复用 K8s Service 或独立注册中心，控制面 watch 后下发到 Envoy。
19. **故障注入有什么用？** VirtualService 注入延迟/错误，主动验证系统韧性（混沌工程）。
20. **Mesh 与传统 ESB 区别？** ESB 是中心化总线（瓶颈）；Mesh 是去中心化 Sidecar（无中心瓶颈）。
21. **如何降低 Mesh 复杂度？** 渐进落地：先 mTLS+可观测，再上复杂流量治理；或用 ambient mesh（无 Sidecar）新形态。
