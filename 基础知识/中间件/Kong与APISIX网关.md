# Kong / APISIX（API 网关 / 流量入口治理）

> API 网关是微服务的统一入口：路由、鉴权、限流、灰度、协议转换、监控。Kong（基于 Nginx/Lua）和 APISIX（基于 Lua + Apache）是开源 API 网关的双雄。相比 Spring Cloud Gateway（Java 生态）、Nginx（需自写逻辑），它们以**插件化 + 动态配置 + 高性能**成为云原生网关首选。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 统一入口 | 微服务 N 个入口 → 统一到一个网关 |
| 鉴权 | 每个服务各自鉴权 → 网关统一 JWT/OAuth2/API Key |
| 限流 | 每个服务各自限流 → 网关统一 QPS/并发限流 |
| 灰度发布 | 按 Header/权重/用户比例路由到新版本 |
| 协议转换 | HTTP ↔ gRPC、HTTP ↔ Dubbo |
| 可观测 | 统一监控/日志/链路 |

> 核心认知：**API 网关 = 微服务的「门面」**——所有南北向流量必须经过网关，是安全/治理的天然拦截点。

---

## 二、Kong 核心原理

### 2.1 架构

```
Client → Kong（基于 OpenResty/Nginx + Lua）
  ├── Access Phase（访问阶段）
  │   ├── 鉴权插件（JWT/OAuth2/API-Key/Basic Auth）
  │   ├── 限流插件（Rate Limiting/Adaptive Concurrency）
  │   ├── IP 黑白名单
  │   └── 请求大小限制
  ├── Balancer Phase（负载均衡）
  │   └── DNS/健康检查/环形负载均衡
  ├── Header Filtering（Header 过滤）
  └── Log Phase（日志）
      └── HTTP Log/File Log/Syslog/DataDog

Upstream（上游服务）
```

### 2.2 核心概念

| 概念 | 说明 |
|------|------|
| Route | 路由规则（路径/方法/Host → Service） |
| Service | 上游服务抽象（URL/Upstream） |
| Upstream | 一组后端实例（目标池） |
| Target | Upstream 中的具体实例（IP:Port） |
| Plugin | 插件（鉴权/限流/灰度/协议转换） |
| Consumer | 消费者（鉴权维度） |

### 2.3 插件生态

| 插件类型 | 代表插件 |
|----------|----------|
| 鉴权 | JWT、OAuth 2.0、API Key、Basic Auth、HMAC、LDAP |
| 限流 | Rate Limiting、Adaptive Concurrency、Proxy Cache |
| 灰度 | Canary、Request Transformer、Response Transformer |
| 安全 | Bot Detection、CORS、IP Restriction、ACL |
| 流量 | Request Size Limiting、Request Termination、Response Rate Limiting |
| 日志 | HTTP Log、File Log、Syslog、TCP Log、UDP Log、Datadog |
| 协议 | gRPC-Web、gRPC gateway、DeGraphQL |
| 定制 | Serverless Functions（Pre/Post Function）、Plugin Developer |

**选型关注点**：Kong 插件生态最丰富（300+ 插件），是最大优势。

---

## 三、APISIX 核心原理

### 3.1 架构

```
Client → APISIX（基于 Apache/OpenResty + Lua + etcd）
  ├── Router（路由匹配：路径/Host/Header/Query）
  ├── Plugin（插件执行：内置 + 自定义）
  ├── Upstream（上游：健康检查/重试/超时/负载均衡）
  └── etcd（配置存储：全动态，毫秒级生效）
```

### 3.2 核心特性

| 特性 | 说明 |
|------|------|
| 全动态 | 路由/插件/SSL/Upstream 全动态配置（etcd） |
| 毫秒级生效 | 配置变更毫秒级推送（对比 Kong 秒级） |
| 多协议 | HTTP/gRPC/WebSocket/TCP/UDP/Dubbo/SkyWalking/阿里云 SLS |
| 插件热加载 | 插件无需重启，动态加载 |
| Serverless | 请求/响应阶段的 Serverless 函数 |
| 多语言插件 | Lua + Java/Go/Python/Node/Wasm 插件 |
| 无状态 | 网关实例无状态，水平扩展 |

**选型关注点**：APISIX 在「全动态 + 毫秒级生效 + 多语言插件」上优于 Kong。

---

## 四、Kong vs APISIX vs Spring Cloud Gateway vs Nginx

| 维度 | Kong | APISIX | Spring Cloud Gateway | Nginx |
|------|------|--------|----------------------|-------|
| 语言 | Lua（OpenResty） | Lua（Apache OpenResty） | Java | C |
| 性能 | 高 | 最高 | 中（Java） | 最高 |
| 配置 | 半动态（缓存+信号） | 全动态（etcd 毫秒级） | 全动态 | 半动态（reload） |
| 插件生态 | 300+ 插件 | 80+ 插件（增长快） | 需编码 | 需编码 |
| 多语言插件 | Lua | Lua + Java/Go/Python/Wasm | Java | C |
| 服务发现 | 内置 | 内置 | 内置 | 需配置 |
| 限流 | 插件 | 插件 | 需编码 | 需编码 |
| 鉴权 | 插件 | 插件 | 需编码 | 需编码 |
| 灰度 | 插件 | 插件 | 需编码 | 需编码 |
| 协议转换 | gRPC 插件 | 原生 gRPC | 需编码 | 需编码 |
| 控制台 | Kong Manager（企业版） | APISIX Dashboard | 无 | 无 |
| 开源 | 部分企业功能收费 | 完全开源 | 开源 | 开源 |
| 社区 | 成熟，CNCF | 快速成长，CNCF | Spring | 成熟 |

**选型关注点**：
- 已有 Nginx/Lua 基础 + 丰富插件 → **Kong**
- 全动态 + 毫秒级生效 + 多语言插件 → **APISIX**
- Spring Boot 生态 + 简单场景 → **Spring Cloud Gateway**
- 纯 HTTP 反向代理 + 静态内容 → **Nginx**
- Java 生态 + 复杂业务逻辑插件 → **APISIX（Java 插件）**

---

## 五、API 网关部署模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| 中心化网关 | 一个网关集群，所有服务共用 | 中小型微服务 |
| 网关 + BFF | 网关 + 各业务 BFF（Backend For Frontend） | 多端（Web/App/小程序） |
| 边车网关 | 每个 Pod 一个网关 Sidecar | 服务网格（Istio Gateway） |
| 双层网关 | 全局网关（L4/L7）+ 业务网关（L7） | 大型微服务 |

**选型关注点**：中小型 → 中心化网关（简单）；大型 → 双层网关（全局流量+业务治理分离）。

---

## 六、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 插件丰富度 | Kong | APISIX |
| 全动态配置 | APISIX | Kong |
| 毫秒级生效 | APISIX | — |
| 多语言插件 | APISIX | Kong |
| Java 生态 | Spring Cloud Gateway | APISIX |
| gRPC 代理 | APISIX | Kong |
| 服务网格入口 | Istio Gateway | APISIX Ingress |
| Ingress 控制器 | APISIX Ingress | Kong Ingress |

---

## 七、与其他板块的关系

- API 网关原理见「[API 网关](./API网关.md)」；
- 服务网格（Sidecar 网关）见「[云原生/Service Mesh](../../云原生/ServiceMesh.md)」；
- 限流熔断见「[Sentinel 限流熔断](./Sentinel限流熔断.md)」；
- Nginx 原理见「[Nginx](./Nginx.md)」；
- 云上网络（负载均衡/CDN）见「[云网络与流量接入体系](./云网络与流量接入体系.md)」。

> 一句话：**API 网关 = 统一入口 + 插件化（鉴权/限流/灰度/协议转换）+ 全动态配置；选型先看「插件需求（丰富→Kong，动态→APISIX）」，再定「生态（Java→Spring Cloud Gateway，云原生→APISIX Ingress）」**。
