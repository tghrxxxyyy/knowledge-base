# Envoy（服务代理 / 边车代理 / 云原生网关）

> Envoy 是 Lyft 开源的**高性能服务代理**，以「为微服务设计的进程外代理」成为服务网格（Istio）的数据面、云原生网关的核心。相比 Nginx（配置驱动）、HAProxy（L4），Envoy 以**xDS 动态配置 + 可观测性 + HTTP/2 + 服务发现**成为云原生代理首选。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 服务间通信 | 微服务间调用需要负载均衡/重试/超时/熔断 |
| 可观测性 | 服务间调用的指标/日志/链路需要统一采集 |
| 动态配置 | 微服务动态上下线，代理配置需要动态生效 |
| 多协议 | HTTP/gRPC/TCP 需要统一代理 |
| 透明代理 | 业务代码无侵入，通信逻辑下沉到代理 |

> 核心认知：**Envoy = 微服务的「智能边车」**——每个服务旁挂一个 Envoy，所有进出流量经过它，通信治理逻辑下沉。

---

## 二、Envoy 核心原理

### 2.1 架构

```
Envoy 进程
  ├── Listener（监听器：监听端口，接收连接）
  ├── Filter Chain（过滤器链）
  │   ├── Network Filter（网络层：TCP 代理/TLS/Redis/Mongo）
  │   └── HTTP Filter（应用层：Router/Rate Limit/Fault Injection）
  ├── Cluster（上游服务集群）
  │   ├── Endpoint（集群中的具体实例）
  │   ├── 健康检查（主动/被动）
  │   └── 负载均衡（Round Robin/Least Request/Ring Hash/Maglev）
  ├── xDS API（动态配置发现服务）
  │   ├── LDS（Listener Discovery Service）
  │   ├── RDS（Route Discovery Service）
  │   ├── CDS（Cluster Discovery Service）
  │   └── EDS（Endpoint Discovery Service）
  └── 可观测性（Stats/Access Log/Tracing）
```

### 2.2 线程模型

- **主线程**：xDS 配置更新/管理 API/统计（单线程，无锁）
- **Worker 线程**：处理连接和请求（每个 CPU 核心一个线程）
- **文件事件线程**：监听 socket 事件

**选型关注点**：Envoy 的线程模型是高性能的关键——Worker 线程无共享，避免锁竞争。

### 2.3 xDS 动态配置（核心差异化）

```
控制面（Istio/Pilot/Contour）
  ├── 发现服务（K8s API/Consul）
  ├── 生成配置（LDS/RDS/CDS/EDS）
  └── gRPC 流式推送 → Envoy

Envoy → 订阅 xDS → 配置变更实时生效（无需重启）
```

**选型关注点**：xDS 是 Envoy 相比 Nginx 的核心优势——配置动态生效，无需 reload。

### 2.4 过滤器链（Filter Chain）

```
请求 → Listener → Filter Chain
  ├── Connection Manager（连接管理）
  ├── HTTP Filter Chain
  │   ├── CORS（跨域）
  │   ├── Fault Injection（故障注入）
  │   ├── Rate Limit（限流）
  │   ├── Router（路由：匹配→转发）
  │   └── gRPC-JSON transcoder（协议转换）
  └── 转发到 Cluster → 选 Endpoint → 发送
```

**选型关注点**：过滤器链是 Envoy 灵活性的核心——可自定义过滤器（C++/Wasm/Lua）。

---

## 三、Envoy 核心特性

| 特性 | 说明 |
|------|------|
| 动态配置 | xDS API，配置实时生效 |
| 可观测性 | 内置 Stats（指标）/Access Log/Tracing（Zipkin/Jaeger/OTel） |
| 负载均衡 | Round Robin/Least Request/Ring Hash/Maglev/随机 |
| 健康检查 | 主动（HTTP/TCP/Ping）+ 被动（Outlier Detection） |
| 重试/超时 | 自动重试/超时/预算重试 |
| 熔断 | 连接池限制/异常检测驱逐 |
| mTLS | 自动双向认证（与 SDS 集成） |
| HTTP/2 | 原生 HTTP/2 + gRPC 代理 |
| Wasm 扩展 | 运行时加载 Wasm 扩展（无需重新编译） |
| Lua 过滤器 | 内嵌 Lua 脚本自定义逻辑 |

---

## 四、Envoy 使用场景

### 4.1 边车代理（Service Mesh）

```
Pod
  ├── 业务容器
  └── Envoy Sidecar（拦截所有进出流量）
      ├── 入站：接收外部流量 → 鉴权/限流 → 业务容器
      └── 出站：业务容器 → 负载均衡/重试/熔断 → 目标服务
```

**选型关注点**：Istio 数据面默认用 Envoy，是服务网格的事实标准。

### 4.2 边缘网关（Ingress Gateway）

```
公网 → Envoy Ingress Gateway
  ├── TLS 终止
  ├── 路由（Host/Path → Service）
  ├── 限流/鉴权
  └── 转发到内部服务
```

**选型关注点**：Contour（K8s Ingress 控制器）使用 Envoy 作为数据面。

### 4.3 API 网关

- Envoy + 自定义过滤器 → API 网关
- 代表项目：Ambassador（现为 Emissary-Ingress）、Gloo Edge

---

## 五、Envoy vs Nginx vs HAProxy

| 维度 | Envoy | Nginx | HAProxy |
|------|-------|-------|---------|
| 动态配置 | xDS（实时） | reload（秒级） | reload（秒级） |
| 服务发现 | 内置（K8s/Consul/静态） | 需 plus/第三方 | 需第三方 |
| 可观测性 | 内置（Stats/Log/Trace） | 需 plus/第三方 | 需第三方 |
| HTTP/2 | 原生 | 支持 | 支持 |
| gRPC | 原生 | 支持 | 支持 |
| 熔断 | 内置 | 需 plus | 需第三方 |
| 重试/超时 | 内置 | 内置 | 内置 |
| 扩展 | C++/Wasm/Lua | C/Lua | C/Lua |
| 性能 | 高 | 最高 | 最高 |
| 配置复杂度 | 高 | 中 | 中 |
| 云原生 | 最佳 | 中 | 弱 |

**选型关注点**：
- 服务网格/云原生 → **Envoy**（xDS 动态配置 + 可观测性）
- 传统反向代理/静态内容 → **Nginx**（性能最高 + 生态成熟）
- L4 负载均衡 → **HAProxy**（L4 性能最强）

---

## 六、Envoy 生产实践

### 6.1 关键配置

| 配置 | 说明 |
|------|------|
| 连接池 | 每上游连接数限制（防雪崩） |
| 异常检测 | 连续 N 次失败 → 驱逐实例 |
| 重试预算 | 限制重试比例（防重试风暴） |
| 速率限制 | 外部 Rate Limit 服务（gRPC） |
| 访问日志 | 异步写入（防阻塞） |

### 6.2 性能调优

| 调优维度 | 建议 |
|----------|------|
| Worker 线程 | 与 CPU 核心数一致 |
| 连接池 | 合理设置每上游连接数 |
| 访问日志 | 异步 + 采样 |
| 统计 | 按需开启（过多影响性能） |

---

## 七、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 服务网格数据面 | Envoy（Istio） | Linkerd-proxy |
| 边缘网关 | Envoy Ingress | Nginx Ingress |
| API 网关 | Envoy + Ambassador | Kong/APISIX |
| L4 负载均衡 | HAProxy | Nginx |
| L7 反向代理 | Nginx | Envoy |
| 动态配置 | Envoy（xDS） | — |
| 可观测性代理 | Envoy | — |

---

## 八、与其他板块的关系

- 服务网格（Istio + Envoy）见「[云原生/Service Mesh](../../云原生/ServiceMesh.md)」；
- Nginx 原理见「[Nginx](./Nginx.md)」；
- API 网关见「[Kong/APISIX](./Kong与APISIX网关.md)」；
- 链路追踪见「[Jaeger 链路追踪](./Jaeger链路追踪.md)」；
- 云上网络见「[云网络与流量接入体系](./云网络与流量接入体系.md)」。

> 一句话：**Envoy = xDS 动态配置 + 过滤器链 + 内置可观测性 + HTTP/2/gRPC 原生；选型先看「场景（服务网格→Envoy，传统代理→Nginx）」，再定「扩展需求（Wasm/Lua 自定义过滤器）」**。
