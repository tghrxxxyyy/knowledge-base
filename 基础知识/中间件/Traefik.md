# Traefik（云原生反向代理 / Ingress 控制器）

> Traefik 是专为**云原生/K8s 设计**的动态反向代理与负载均衡器，以「**自动发现**（监听 K8s/Docker/Consul 等 Provider）+ 原生 HTTPS（Let's Encrypt 自动证书）+ 中间件（Middleware）编排」著称。相比 Nginx（静态配置）、Envoy（xDS 配置复杂）、Kong/APISIX（需要 etcd/Admin API），Traefik 以「**开箱即用 + 声明式 + 零配置上手**」成为 K8s Ingress 与边缘代理的热门之选。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 动态环境 | K8s Pod IP/服务随时变化，静态配置无法维护 |
| 证书管理 | 每服务一个 HTTPS 证书，手动申请续期痛苦 |
| 配置复杂度 | Nginx/Envoy 配置学习成本高、易错 |
| 多入口协议 | HTTP/gRPC/TCP/UDP 多种流量统一入口 |
| 可观测 | 流量指标/日志/链路需要内置而非外挂 |

> 核心认知：**Traefik = 「配置即代码」的零配置代理**——不写配置，从 Provider（K8s API/Docker/Consul）自动发现服务并生成路由。

---

## 二、核心原理

### 2.1 架构

```
K8s Ingress / Docker / Consul / File...（Provider 数据源）
  └── Traefik 监听 Provider 变更 → 动态生成路由配置（无需 reload）

Client → EntryPoints（HTTP/HTTPS/gRPC/TCP/UDP 入口）
  ├── Routers（路由：Host/Path/Header 匹配规则）
  │   ├── Middlewares（中间件链：鉴权/限流/重试/改写）
  │   └── Services（转发目标：K8s Service/外部 URL）
  └── 自动 HTTPS（Let's Encrypt 证书签发与续期）
```

### 2.2 三大核心概念

| 概念 | 说明 |
|------|------|
| EntryPoint | 流量入口（端口 + 协议），如 `web:80`、`websecure:443` |
| Router | 匹配规则（Host/Path/Query/Header）+ 关联 Middleware 和 Service |
| Service | 上游转发目标（K8s Service、副本负载均衡、外部服务） |
| Middleware | 请求处理中间件（限流/重试/基本认证/改写/压缩/熔断） |

### 2.3 自动发现（Provider 机制，核心差异化）

```
K8s 场景：Traefik 监听 Ingress/IngressRoute CRD 资源
Docker 场景：监听容器 label（traefik.http.routers.app.rule=Host(`app.example.com`)）
Consul/etcd：监听 KV 变更
```

- **配置即资源**：K8s 下用 IngressRoute（CRD）声明路由，git 化、评审化；
- **热更新**：Provider 变更毫秒级生效，**无 reload、无中断**（对比 Nginx reload 重开 worker）。

### 2.4 自动 HTTPS（Let's Encrypt 集成）

```
默认证书（ACME 通配）→ 按 Host 自动签发 → 自动续期（90 天）
  ├── httpChallenge / tlsChallenge / dnsChallenge（通配符）
  └── 证书自动下发到服务（K8s Secret）
```

**选型关注点**：自动证书是 Traefik 王牌能力——入口即 HTTPS，无需运维手动管证书。

### 2.5 IngressRoute（K8s CRD 示例）

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: webapp
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`app.example.com`) && PathPrefix(`/api`)
      kind: Rule
      middlewares:
        - name: auth
        - name: ratelimit
      services:
        - name: webapp-svc
          port: 80
          weight: 90        # 灰度
        - name: webapp-canary
          port: 80
          weight: 10
```

---

## 三、核心特性

| 特性 | 说明 |
|------|------|
| 自动发现 | 15+ Provider（K8s/Docker/Consul/etcd/Rancher/Nomad...） |
| 原生 HTTPS | Let's Encrypt 自动签发/续期/通配符 |
| 中间件编排 | 鉴权/限流/重试/改写/压缩/熔断 等 30+ 内置 |
| 多协议 | HTTP/HTTPS/gRPC/TCP/UDP |
| 灰度发布 | 权重路由 + Canary（K8s Service 加权） |
| 可观测 | 内置 Dashboard + Metrics（Prometheus）+ 访问日志 + Tracing |
| 优雅停机 | 连接排空（draining），发布零中断 |
| 多配置源 | 静态 yml + 动态 Provider 合并 |
| 服务发现健康检查 | 自动剔除异常实例 |
| 单二进制 | 部署极简（容器镜像一把梭） |

---

## 四、Traefik vs Nginx Ingress vs Envoy vs Kong/APISIX

| 维度 | Traefik | Nginx Ingress | Envoy | Kong/APISIX |
|------|---------|---------------|-------|-------------|
| 配置方式 | 声明式（CRD/Provider） | Ingress + 注解 | xDS（gRPC 推送） | Admin API/etcd |
| 自动发现 | 原生（Provider） | 需控制器 | xDS 控制面 | 插件 |
| 自动 HTTPS | Let's Encrypt 原生 | cert-manager 配合 | 需集成 | 需集成 |
| 上手成本 | 最低 | 中 | 高 | 中 |
| 扩展方式 | 中间件/插件 | Lua/插件 | C++/Wasm/Lua | Lua/多语言插件 |
| 性能 | 高 | 高 | 高 | 最高 |
| 功能丰富度 | 中 | 中 | 高（过滤器链） | 高（80+ 插件） |
| 适用场景 | 中小团队 K8s 入口 | K8s 标配 | 服务网格/大流量 | 企业级 API 治理 |

**选型关注点**：
- 中小团队/K8s 快速上手/自动证书 → **Traefik**；
- K8s 官方生态/Java 团队 → **Nginx Ingress**（或 Ingress-NGINX）；
- 服务网格/需要 xDS 动态 → **Envoy**；
- 企业级多团队 API 治理（鉴权/限流/订阅） → **Kong/APISIX**。

---

## 五、生产实践

### 5.1 关键配置

| 配置 | 建议 |
|------|------|
| Dashboard | 内网暴露（`api.insecure` 仅调试），生产用 `--api.dashboard=false` |
| 日志 | access log 结构化（JSON），异步写 |
| 指标 | Prometheus metrics 全开 + Grafana 大盘 |
| 优雅停机 | `--lifecycle.gracePeriod=30s`（发布排空） |
| 中间件默认值 | 全局中间件（`defaultEntryPoints`、压缩、超时） |

### 5.2 常见坑

- **Dashboard 公网暴露**：默认有安全提示，务必加认证中间件；
- **Ingress 版本兼容**：K8s 1.22+ 用 networking.k8s.io/v1（v1beta1 已移除）；
- **大流量场景性能**：极限压测下比 Nginx 有差距，超大流量建议 Nginx/APISIX 或前挂 LB；
- **TCP/UDP 入口**：K8s Service `type: LoadBalancer` 暴露需单独配置。

---

## 六、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| K8s Ingress（快速上手） | Traefik | Nginx Ingress |
| 自动 HTTPS | Traefik | cert-manager + Nginx |
| 服务网格数据面 | Envoy | — |
| 企业级 API 治理 | Kong/APISIX | Traefik |
| 超大流量边缘 | Nginx/APISIX | Traefik + LB |
| 多云/多集群入口 | Traefik | Istio Gateway |

---

## 补充：Traefik 深度解析

### 1. EntryPoint / Router / Middleware 详解

#### 1.1 EntryPoint 高级配置

| 参数 | 说明 | 示例 |
|------|------|------|
| `address` | 监听地址与端口 | `:80`, `:443`, `:8443` |
| `transport.respondingTimeouts` | 超时设置 | readTimeout / writeTimeout / idleTimeout |
| `transport.maxRequestsPerConn` | 单连接最大请求数 | `10000` |
| `proxyProtocol` | PROXY Protocol 支持 | v1/v2 |
| `forwardedHeaders` | 信任 X-Forwarded-* | `trustedIPs: ["10.0.0.0/8"]` |

```yaml
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
    transport:
      respondingTimeouts:
        readTimeout: 60s
        writeTimeout: 60s
        idleTimeout: 180s
  websecure:
    address: ":443"
    http:
      tls:
        certResolver: letsencrypt
```

#### 1.2 Router 匹配规则

| 匹配条件 | 语法示例 | 说明 |
|----------|----------|------|
| Host | `Host(\`example.com\`)` | 精确域名 |
| HostRegexp | `HostRegexp(\`^.+\\.example\\.com\$\`)` | 通配域名 |
| PathPrefix | `PathPrefix(\`/api\`)` | 路径前缀 |
| Headers | `Headers(\`X-Custom\`, \`value\`)` | 请求头匹配 |
| Method | `Method(\`GET\`, \`POST\`)` | HTTP 方法 |
| ClientIP | `ClientIP(\`10.0.0.0/8\`)` | 客户端 IP |

#### 1.3 Middleware 链式组合

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: full-pipeline
spec:
  chain:
    middlewares:
      - name: ip-whitelist
      - name: rate-limit
      - name: jwt-auth
      - name: compress
```

### 2. Traefik in Kubernetes（IngressRoute CRD）

| 维度 | IngressRoute (CRD) | K8s Ingress |
|------|---------------------|-------------|
| 功能 | 全功能（中间件、TLS、TCP/UDP） | 基础路由 |
| 中间件 | 原生支持 | 需注解扩展 |
| TCP/UDP | 支持 | 不支持 |
| 验证 | CRD schema 校验 | 注解无校验 |

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: webapp
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`app.example.com`)
      kind: Rule
      middlewares:
        - name: rate-limit
      services:
        - name: webapp-svc
          port: 80
  tls:
    certResolver: letsencrypt
```

### 3. Traefik Let's Encrypt 自动 SSL

| 挑战 | 说明 | 优缺点 |
|------|------|--------|
| HTTP Challenge | 80 端口 HTTP-01 验证 | 简单，不支持通配符 |
| TLS Challenge | TLS-ALPN-01 验证 | 443 端口，无需 80 |
| DNS Challenge | DNS-01 验证 | 支持通配符，需 DNS API 权限 |

```yaml
certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@example.com
      storage: /data/acme.json
      dnsChallenge:
        provider: cloudflare
```

### 4. Traefik Service Mesh（Traefik Mesh）

| 特性 | 说明 |
|------|------|
| 架构 | 轻量级服务网格，无 sidecar |
| 数据面 | Traefik 代理（与 Ingress 共用） |
| 控制面 | Traefik Mesh Controller |
| 负载均衡 | 加权轮询、最少连接 |
| 熔断 | 连接数/延迟/错误率 |
| 限流 | 全局/每服务 |
| mTLS | 服务间加密（可选） |

### 5. Traefik vs Nginx vs HAProxy 深度对比

| 维度 | Traefik | Nginx | HAProxy |
|------|---------|-------|---------|
| 配置方式 | 声明式 CRD/YAML | 静态配置文件 | 静态配置文件 |
| 动态更新 | 原生热更新 | reload（优雅） | reload（优雅） |
| 自动发现 | 15+ Provider | 不支持 | 不支持 |
| 自动 HTTPS | Let's Encrypt 原生 | cert-manager 配合 | cert-manager 配合 |
| 中间件 | 30+ 内置 | Lua/第三方模块 | ACL/规则 |
| 性能 | 高（Go 实现） | 极高（C 实现） | 极高（C 实现） |
| 内存占用 | 中 | 低 | 低 |
| TCP/UDP 代理 | 原生支持 | stream 模块 | 原生支持 |
| 学习曲线 | 低 | 中 | 高 |
| 适用场景 | K8s/Docker 环境 | 传统 Web 服务器 | 高性能 TCP 负载均衡 |

### 6. Traefik 文件配置

```yaml
# traefik.yml（静态配置）
entryPoints:
  web:
    address: ":80"
  websecure:
    address: ":443"
providers:
  file:
    filename: /etc/traefik/dynamic.yml
    watch: true
certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@example.com
      storage: /data/acme.json
      dnsChallenge:
        provider: cloudflare
```

```yaml
# dynamic.yml（动态配置）
http:
  routers:
    webapp:
      rule: Host(`app.example.com`)
      service: webapp-svc
  services:
    webapp-svc:
      loadBalancer:
        servers:
          - url: "http://10.0.1.10:8080"
          - url: "http://10.0.1.11:8080"
```

### 7. Traefik Prometheus 监控

```yaml
metrics:
  prometheus:
    entryPoint: metrics
    addEntryPointsLabels: true
    addRoutersLabels: true
    addServicesLabels: true
```

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `traefik_entrypoint_requests_total` | Counter | 入口请求总数 |
| `traefik_entrypoint_request_duration_seconds` | Histogram | 入口请求延迟 |
| `traefik_router_requests_total` | Counter | 路由请求总数 |
| `traefik_service_requests_total` | Counter | 服务请求总数 |
| `traefik_service_open_connections` | Gauge | 服务打开连接数 |

```promql
# QPS 按路由
sum(rate(traefik_router_requests_total[5m])) by (router)
# P99 延迟
histogram_quantile(0.99, sum(rate(traefik_router_request_duration_seconds_bucket[5m])) by (le, router))
```

---

## 补充：IngressRoute CRD 完整字段解析

### IngressRoute 全字段

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: webapp
  namespace: production
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`example.com`) && PathPrefix(`/api`)
      kind: Rule
      priority: 10
      middlewares:
        - name: rate-limit
          namespace: traefik
        - name: jwt-auth
      services:
        - name: webapp-svc
          port: 80
          weight: 90
          passHostHeader: true
          healthCheck:
            path: /health
            interval: 10s
          serversTransport: my-transport
  tls:
    certResolver: letsencrypt
    domains:
      - main: example.com
        sans: ["*.example.com"]
    options:
      minVersion: VersionTLS12
      sniStrict: true
```

### IngressRouteTCP / IngressRouteUDP

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRouteTCP
metadata:
  name: postgres-route
spec:
  entryPoints:
    - postgres
  routes:
    - match: HostSNI(`*`)
      services:
        - name: postgres-svc
          port: 5432
  tls:
    passthrough: true
---
apiVersion: traefik.io/v1alpha1
kind: IngressRouteUDP
metadata:
  name: dns-route
spec:
  entryPoints:
    - dns
  routes:
    - services:
        - name: dns-svc
          port: 53
```

## 补充：中间件链组合实例（限流+认证+重试）

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: ip-whitelist
spec:
  ipWhiteList:
    sourceRange:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: rate-limit
spec:
  rateLimit:
    average: 100
    burst: 50
    period: 1s
    sourceCriterion:
      ipStrategy:
        depth: 1
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: jwt-auth
spec:
  forwardAuth:
    address: http://auth-service:8080/validate
    trustForwardHeader: true
    authResponseHeaders:
      - X-User-ID
      - X-User-Roles
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: retry-middleware
spec:
  retry:
    attempts: 3
    initialInterval: 100ms
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: full-pipeline
spec:
  chain:
    middlewares:
      - name: ip-whitelist
      - name: rate-limit
      - name: jwt-auth
      - name: retry-middleware
      - name: compress
```

**执行顺序**：IP 白名单 → 限流 → JWT 认证 → 重试 → 压缩。限流尽早拒绝减轻后端压力，认证在限流后避免无谓鉴权开销。

## 补充：Let's Encrypt 证书 HA 部署

### 多副本证书存储方案

| 方案 | 说明 | 适用 |
|------|------|------|
| ReadWriteMany PVC | NFS/CephFS 共享 acme.json | K8s 有 RWX 存储 |
| DNS Challenge | 无需 80 端口，天然多副本 | 推荐生产 |
| 单副本签发 | 只有一个 Pod 做证书签发 | 简单场景 |

```yaml
certificatesResolvers:
  letsencrypt:
    acme:
      email: ops@example.com
      storage: /data/acme.json
      dnsChallenge:
        provider: cloudflare
        delayBeforeCheck: 10s
        resolvers:
          - "1.1.1.1:53"
          - "8.8.8.8:53"
```

## 补充：TCP/UDP 入口路由

Traefik 原生支持 TCP/UDP 入口，需在 EntryPoint 配置中显式声明：

```yaml
entryPoints:
  web:
    address: ":80"
  websecure:
    address: ":443"
  postgres:
    address: ":5432"
  dns:
    address: ":53/udp"
```

| 协议 | EntryPoint | 路由 CRD | 典型场景 |
|------|-----------|----------|----------|
| HTTP/HTTPS | web/websecure | IngressRoute | Web 应用 |
| TCP | 自定义端口 | IngressRouteTCP | 数据库/Redis/gRPC |
| UDP | 自定义端口 | IngressRouteUDP | DNS/DHCP |

## 补充：Plugin Catalog 自定义插件

Traefik 支持 Yaegi（Go 解释器）插件：

| 插件 | 功能 | 场景 |
|------|------|------|
| **Traefik plugincatalog** | 官方插件市场 | 通用 |
| **header-rewrite** | 请求/响应头改写 | 灰度标记 |
| **ip-filtering** | IP 黑白名单增强 | 安全 |
| **rate-limit** | 高级限流 | 防刷 |
| **forward-auth** | 外部认证 | SSO 集成 |

```yaml
# 使用插件
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: my-plugin
spec:
  plugin:
    header-rewrite:
      headers:
        X-Custom-Header: "value"
```

> 插件需在 Traefik 启动时声明 `--experimental.plugins.<name>.moduleName=<module>`。

## 补充：Traefik vs Nginx Ingress 性能功能对比

| 维度 | Traefik | Nginx Ingress |
|------|---------|---------------|
| **配置方式** | 声明式 CRD/Provider | Ingress + 注解 |
| **热更新** | 毫秒级（无 reload） | 需 reload（优雅，但有短暂中断） |
| **自动发现** | 15+ Provider 原生 | 需 Ingress Controller |
| **自动 HTTPS** | Let's Encrypt 原生 | cert-manager 配合 |
| **中间件** | 30+ 内置 | Lua/第三方模块 |
| **吞吐（极限）** | 高（Go 实现） | 极高（C 实现，Nginx 核心） |
| **延迟** | 低 | 更低（Nginx 事件驱动优化） |
| **内存占用** | 中（Go GC） | 低（C 直接管理） |
| **TCP/UDP** | 原生支持 | stream 模块 |
| **WAF** | 无内置 | ModSecurity 集成 |
| **gRPC** | 原生支持 | 需配置 |
| **学习曲线** | 低 | 中 |
| **适用** | K8s/Docker 动态环境 | 高性能传统 Web/混合环境 |

> **选型建议**：K8s 原生 + 自动证书 + 动态环境 → Traefik；极致性能 + WAF + 混合环境 → Nginx Ingress。

## 六、Traefik 与 Consul/Nacos 服务发现集成

### 6.1 Consul 集成

```yaml
# docker-compose.yml Traefik + Consul 集成
services:
  traefik:
    image: traefik:v3.0
    command:
      - "--providers.consul=true"
      - "--providers.consul.endpoint=consul:8500"
      - "--providers.consul.prefix=traefik"
      - "--providers.consul.exposedByDefault=false"
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"  # Dashboard

  consul:
    image: consul:1.15
    command: agent -server -bootstrap-expect=1 -ui -client=0.0.0.0
    ports:
      - "8500:8500"
```

```text
Consul 集成流程：
  1. 服务注册到 Consul（健康检查 + 元数据标签）
  2. Traefik 通过 Consul API 发现服务
  3. 自动创建路由规则
  4. 健康检查失败 → 自动移除路由

Consul 优势：
  - 服务网格（Consul Connect mTLS）
  - 多数据中心支持
  - KV 存储 + 配置中心
  - 健康检查丰富（HTTP/TCP/Script/gRPC）
```

### 6.2 Nacos 集成

```yaml
# Traefik + Nacos 集成（通过 File Provider 桥接）
services:
  traefik:
    image: traefik:v3.0
    command:
      - "--providers.file=true"
      - "--providers.file.watch=true"
    volumes:
      - ./dynamic.yaml:/etc/traefik/dynamic.yaml

  nacos-sync:
    image: nacos-sync:latest
    environment:
      - NACOS_SERVER=nacos:8848
      - TRAEFIK_PROVIDER=consul
```

```yaml
# dynamic.yaml（Nacos 同步生成）
http:
  routers:
    user-service:
      rule: "Host(`api.example.com`) && PathPrefix(`/users`)"
      service: user-service
      middlewares:
        - rate-limit
  services:
    user-service:
      loadBalancer:
        servers:
          - url: "http://10.0.0.1:8080"
          - url: "http://10.0.0.2:8080"
```

## 七、Traefik EntryPoints 安全配置

```yaml
# EntryPoints 安全配置
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
          permanent: true
    http2:
      maxConcurrentStreams: 250

  websecure:
    address: ":443"
    http:
      tls:
        certResolver: letsencrypt
        domains:
          - main: "example.com"
            sans: ["*.example.com"]
    http2:
      maxConcurrentStreams: 250
    forwardedHeaders:
      trustedIPs:
        - "10.0.0.0/8"
        - "172.16.0.0/12"
    originalRequestHeaders:
      forwardedHeaders:
        trustedIPs:
          - "10.0.0.0/8"

  metrics:
    address: ":8082"
    # 仅内网暴露 Prometheus 指标

# 安全加固：
#   1. 强制 HTTPS 重定向
#   2. 限制 HTTP/2 并发流
#   3. 信任代理 IP 转发头
#   4. 指标端点仅内网暴露
#   5. TLS 1.3 强制（默认）
```

## 八、Traefik 中间件链执行优先级

```yaml
# 中间件链执行顺序（按声明顺序依次执行）
http:
  routers:
    api-router:
      rule: "Host(`api.example.com`)"
      middlewares:
        - ip-whitelist      # 1. 先检查 IP 白名单
        - rate-limit         # 2. 再做速率限制
        - circuit-breaker    # 3. 然后熔断保护
        - jwt-auth           # 4. 最后 JWT 认证

  middlewares:
    ip-whitelist:
      ipWhiteRange:
        sourceRange:
          - "10.0.0.0/8"
          - "172.16.0.0/12"

    rate-limit:
      rateLimit:
        average: 100
        burst: 200
        period: 1s

    circuit-breaker:
      circuitBreaker:
        expression: "LatencyAtQuantileMS(50.0) > 100 || NetworkErrorRatio() > 0.30"

    jwt-auth:
      forwardAuth:
        address: "http://auth-service:8080/verify"
        trustForwardHeader: true
```

```text
中间件执行顺序原则：
  1. 安全类优先：IP 白名单 → 认证授权
  2. 保护类次之：限流 → 熔断 → 重试
  3. 转换类最后：请求改写 → 响应改写 → 压缩

  执行顺序错误示例：
    ❌ JWT 认证 → IP 白名单（认证前无法检查 IP）
    ❌ 限流 → IP 白名单（限流后才检查 IP，浪费资源）

  正确顺序：
    ✅ IP 白名单 → 限流 → 熔断 → JWT 认证
```

## 九、Traefik IngressRoute vs 原生 K8s Ingress 对比

| 维度 | IngressRoute（CRD） | 原生 K8s Ingress |
|------|---------------------|------------------|
| 声明方式 | CRD（YAML） | Ingress 资源 |
| 中间件 | 原生支持（链式） | 需注解（有限） |
| TCP/UDP | 原生支持 | 不支持 |
| 金丝雀发布 | 原生支持 | 需 Ingress annotation |
| 路由规则 | 丰富（Host/Path/Header/Query） | 基础（Host/Path） |
| TLS | 自动（Let's Encrypt） | 需 cert-manager |
| 版本管理 | CRD 版本化 | 注解无版本 |
| 社区生态 | Traefik 专属 | 通用（Nginx/Traefik 均支持） |
| 学习曲线 | 低（声明式） | 中（注解式） |
| 适用 | Traefik 专属部署 | 多网关混合环境 |

```yaml
# IngressRoute 示例（推荐）
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: api-route
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`api.example.com`) && PathPrefix(`/v1`)
      kind: Rule
      services:
        - name: api-service
          port: 8080
          weight: 100
      middlewares:
        - name: rate-limit
        - name: jwt-auth
  tls:
    certResolver: letsencrypt
```

## 十、Traefik 生产环境速率限制 + 网络策略

```yaml
# 速率限制中间件（生产配置）
http:
  middlewares:
    # 全局限流：每 IP 100 QPS，突发 200
    global-rate-limit:
      rateLimit:
        average: 100
        burst: 200
        period: 1s
        sourceCriterion:
          ipStrategy:
            depth: 1  # 获取真实 IP 深度

    # API 限流：每用户 10 QPS
    api-rate-limit:
      rateLimit:
        average: 10
        burst: 20
        period: 1s
        sourceCriterion:
          requestHost: {}

    # 登录限流：每 IP 5 次/分钟
    login-rate-limit:
      rateLimit:
        average: 0.083  # 5/60
        burst: 5
        period: 1s
```

```yaml
# K8s NetworkPolicy（限制 Traefik 访问范围）
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: traefik-network-policy
  namespace: traefik
spec:
  podSelector:
    matchLabels:
      app: traefik
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: frontend
      ports:
        - port: 80
        - port: 443
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              name: backend
      ports:
        - port: 8080
    - to:  # 允许访问外部服务
        - ipBlock:
            cidr: 0.0.0.0/0
      ports:
        - port: 443
```

## 十一、Traefik 高可用架构设计

```text
Traefik HA 架构（生产推荐）：

  层级 1：入口负载均衡
    Cloud LB（ALB/NLB）→ Traefik Pod（多副本）
    L4 负载均衡 → L7 Traefik 处理

  层级 2：Traefik 集群
    Traefik Pod 1 ←→ Traefik Pod 2 ←→ Traefik Pod 3
    无状态设计 → 水平扩展
    共享配置：CRD（K8s API Server）

  层级 3：后端服务
    Traefik → Service（K8s Service）→ Pod
    健康检查 → 自动摘除不健康 Pod

  关键配置：
    replicas: 3（至少 3 副本）
    Pod 反亲和性（分散到不同节点）
    PDB（Pod Disruption Budget，最少 2 副本可用）
    资源限制（CPU/Memory requests/limits）
```

```yaml
# Traefik Deployment（HA 配置）
apiVersion: apps/v1
kind: Deployment
metadata:
  name: traefik
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: traefik
  template:
    spec:
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - labelSelector:
                matchLabels:
                  app: traefik
              topologyKey: kubernetes.io/hostname
      containers:
        - name: traefik
          resources:
            requests:
              cpu: "500m"
              memory: "512Mi"
            limits:
              cpu: "1"
              memory: "1Gi"
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: traefik-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: traefik
```

## Traefik IngressRoute CRD 详解

### HTTP / TCP / UDP 路由规则

```yaml
# HTTP 路由
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: my-app
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`app.example.com`) && PathPrefix(`/api`)
      kind: Rule
      services:
        - name: api-service
          port: 8080
      middlewares:
        - name: rate-limit
        - name: jwt-auth
    - match: Host(`app.example.com`)
      kind: Rule
      services:
        - name: frontend-service
          port: 3000
  tls:
    certResolver: letsencrypt

# TCP 路由
apiVersion: traefik.io/v1alpha1
kind: IngressRouteTCP
metadata:
  name: mysql-route
spec:
  entryPoints:
    - tcp-mysql
  routes:
    - match: HostSNI(`mysql.example.com`)
      services:
        - name: mysql-service
          port: 3306

# UDP 路由
apiVersion: traefik.io/v1alpha1
kind: IngressRouteUDP
metadata:
  name: dns-route
spec:
  entryPoints:
    - dns
  routes:
    - services:
        - name: dns-service
          port: 53
```

## Middleware 链配置

### Chain / 组合

```yaml
# Chain 中间件链
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: security-chain
spec:
  chain:
    middlewares:
      - name: rate-limit
      - name: ip-whitelist
      - name: jwt-auth
      - name: headers

# 内置中间件
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: rate-limit
spec:
  rateLimit:
    average: 100
    burst: 200

---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: jwt-auth
spec:
  forwardAuth:
    address: "http://auth-service:8080/verify"
    trustForwardHeader: true
    authResponseHeaders:
      - X-User-Id
      - X-User-Role
```

| 中间件 | 功能 | 配置要点 |
|--------|------|----------|
| rateLimit | 限流 | average/burst |
| ipWhitelist | IP 白名单 | sourceRange |
| basicAuth | 基本认证 | secret |
| headers | 安全头 | 自定义响应头 |
| compress | 压缩 | excludes/contentType |
| circuitBreaker | 熔断 | expression/checkPeriod |

## Gateway API 支持

```yaml
# Gateway API（K8s 标准网关 API）
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: traefik-gateway
spec:
  gatewayClassName: traefik
  listeners:
    - name: web
      protocol: HTTP
      port: 80
    - name: websecure
      protocol: HTTPS
      port: 443

---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: my-app-route
spec:
  parentRefs:
    - name: traefik-gateway
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: api-service
          port: 8080
```

## Traefik Dashboard 配置

```yaml
# 启用 Dashboard
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: dashboard
spec:
  entryPoints:
    - traefik
  routes:
    - match: Host(`traefik.example.com`)
      kind: Rule
      services:
        - name: api@internal
  # 安全：只允许内网访问
  tls: {}

# 或通过文件配置
[api]
  dashboard = true
  insecure = false  # 生产关闭

[entryPoints.traefik]
  address = ":8080"
```

## 负载均衡策略

### Weighted Round Robin / Mirroring

```yaml
# 加权负载均衡
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: weighted-lb
spec:
  weighted:
    services:
      - name: service-v1
        port: 8080
        weight: 90
      - name: service-v2
        port: 8080
        weight: 10

# 流量镜像（影子测试）
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: traffic-mirror
spec:
  mirroring:
    name: service-v1
    port: 8080
    mirrors:
      - name: service-v2
        port: 8080
        percentage: 10
```

| 策略 | 配置 | 说明 |
|------|------|------|
| Round Robin | 默认 | 轮询 |
| Weighted | weight 字段 | 加权轮询 |
| Mirroring | mirroring | 流量镜像 |
| Sticky Session | sticky | 会话保持 |

## TLS 证书管理

### Let's Encrypt / 自定义证书 / TLS Store

```yaml
# Let's Encrypt 自动证书
apiVersion: traefik.io/v1alpha1
kind: TLSOption
metadata:
  name: default
spec:
  minVersion: VersionTLS12
  cipherSuites:
    - TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
    - TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384

# ACME 配置
[certificatesResolvers.letsencrypt.acme]
  email = "admin@example.com"
  storage = "/acme.json"
  [certificatesResolvers.letsencrypt.acme.tlsChallenge]
  # 或 [certificatesResolvers.letsencrypt.acme.httpChallenge]
  # 或 [certificatesResolvers.letsencrypt.acme.dnsChallenge]

# TLS Store（默认证书）
apiVersion: traefik.io/v1alpha1
kind: TLSStore
metadata:
  name: default
spec:
  defaultCertificate:
    secret: default-tls-secret
```

## 十二、Traefik 中间件详解

### 12.1 常用中间件

| 中间件 | 说明 | 配置示例 |
|--------|------|----------|
| BasicAuth | 基本认证 | users: ["admin:$apr1$..."] |
| ForwardAuth | 外部认证服务 | authAddress: http://auth-svc |
| RateLimit | 限流 | average: 100, burst: 50 |
| Retry | 重试 | attempts: 3, initialInterval: 100ms |
| StripPrefix | 路径前缀剥离 | prefixes: ["/api"] |
| Headers | 响应头修改 | customResponseHeaders: {X-Custom: "value"} |
| Compress | 响压压缩 | excludedContentTypes: ["image/*"] |
| CircuitBreaker | 熔断 | expression: "LatencyAtQuantileMS(50.0) > 100" |

### 12.2 中间件链组合示例

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: auth-ratelimit
spec:
  chain:
    middlewares:
      - name: auth
      - name: ratelimit
        rateLimit:
          average: 100
          burst: 50
      - name: compress
```

### 12.3 Traefik 可观测配置

```yaml
# Prometheus 指标
metrics:
  prometheus:
    entryPoint: metrics
    addEntryPointsLabels: true
    addRoutersLabels: true
    addServicesLabels: true

# 访问日志
accessLog:
  filePath: /var/log/traefik/access.log
  format: json
  bufferingSize: 100

# Tracing（Jaeger/Zipkin）
tracing:
  jaeger:
    localAgentHostPort: 127.0.0.1:6831
```

## 十三、Traefik Gateway API 支持

### Gateway API 资源模型

```yaml
# Gateway 定义
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: production-gateway
  namespace: traefik
spec:
  gatewayClassName: traefik
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes:
        namespaces:
          from: All
    - name: https
      protocol: HTTPS
      port: 443
      tls:
        mode: Terminate
        certificateRefs:
          - name: wildcard-cert
      allowedRoutes:
        namespaces:
          from: All
---
# HTTPRoute 定义
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api-route
  namespace: default
spec:
  parentRefs:
    - name: production-gateway
      namespace: traefik
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: api-service
          port: 80
```

### Gateway API 特性对比

| Gateway API 特性 | 说明 | 优势 |
|-----------------|------|------|
| 角色分离 | Gateway/HTTPRoute/TLSRoute | 权限清晰 |
| 多协议 | HTTP/TCP/UDP/gRPC | 统一入口 |
| 可移植 | 标准 API | 避免厂商锁定 |
| 高级路由 | Header 匹配/权重分配 | 灵活路由 |

## 十四、Traefik Dashboard 安全配置

### Dashboard 访问控制

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: traefik-dashboard
  namespace: traefik
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`traefik.example.com`)
      kind: Rule
      services:
        - name: api@internal
          kind: TraefikService
  tls:
    certResolver: letsencrypt
  middlewares:
    - name: basic-auth
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: basic-auth
  namespace: traefik
spec:
  basicAuth:
    secret: traefik-dashboard-auth
```

### Dashboard 安全最佳实践

| 实践 | 说明 |
|------|------|
| 生产关闭 | `--api.dashboard=false` |
| 内网暴露 | 仅内网访问 |
| BasicAuth | 加认证中间件 |
| IP 白名单 | 限制访问 IP |
| HTTPS | 强制 HTTPS |

## 十五、负载均衡策略深度对比

| 策略 | 算法 | 适用场景 | 优缺点 |
|------|------|---------|--------|
| Round Robin | 轮询 | 通用 | 简单均匀 |
| Weighted Round Robin | 加权轮询 | 异构服务器 | 按能力分配 |
| Least Connections | 最少连接 | 长连接场景 | 避免过载 |
| IP Hash | IP 哈希 | 会话保持 | 会话粘性 |
| Random | 随机 | 简单场景 | 均匀性差 |

### 负载均衡配置

```yaml
apiVersion: traefik.io/v1alpha1
kind: ServersTransport
metadata:
  name: custom-transport
spec:
  serverName: backend
  insecureSkipVerify: false
  maxIdleConnsPerHost: 200
  forwardingTimeouts:
    dialTimeout: 30s
    responseHeaderTimeout: 60s
    idleConnTimeout: 90s
```

## 十六、TLS 证书管理最佳实践

| 证书类型 | 适用场景 | 自动续期 | 成本 |
|----------|---------|---------|------|
| Let's Encrypt | 公网域名 | 是(90天) | 免费 |
| 自签名 | 内部服务 | 否 | 免费 |
| 商业证书 | 企业域名 | 否 | 付费 |
| CA 证书 | 内部 PKI | 否 | 自建 |

### TLS 配置示例

```yaml
# TLSOption 配置
apiVersion: traefik.io/v1alpha1
kind: TLSOption
metadata:
  name: default
spec:
  minVersion: VersionTLS12
  cipherSuites:
    - TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
    - TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384

# TLS Store（默认证书）
apiVersion: traefik.io/v1alpha1
kind: TLSStore
metadata:
  name: default
  namespace: traefik
spec:
  defaultCertificate:
    secretName: wildcard-tls
```

## 十七、Traefik 常见问题排查

| 问题 | 原因 | 解决 |
|------|------|------|
| 502/503 | 后端 Pod 不健康 | 检查 readiness probe |
| 证书过期 | Let's Encrypt 续期失败 | 检查 ACME 配置/存储 |
| 路由不生效 | IngressRoute 语法错 | kubectl describe 检查 |
| 性能差 | 中间件过多 | 精简中间件链 |
| 连接超时 | 后端响应慢 | 调整超时配置 |

## 十八、Traefik Enterprise 功能

### Traefik Mesh（服务网格）

| 特性 | 说明 |
|------|------|
| 架构 | 轻量级服务网格，无 sidecar |
| 数据面 | Traefik 代理（与 Ingress 共用） |
| 控制面 | Traefik Mesh Controller |
| 负载均衡 | 加权轮询、最少连接 |
| 熔断 | 连接数/延迟/错误率 |
| 限流 | 全局/每服务 |
| mTLS | 服务间加密（可选） |

### Traefik Enterprise vs 开源版

| 维度 | 开源版 | Enterprise |
|------|--------|-----------|
| 中间件 | 30+ 内置 | 50+ 内置 |
| 服务网格 | 无 | Traefik Mesh |
| 高级路由 | 基础 | 高级（镜像/灰度） |
| 支持 | 社区 | 官方支持 |
| 许可 | MIT | 商业许可 |

## 十九、Traefik vs Nginx vs HAProxy vs Kong vs APISIX 选型

| 维度 | Traefik | Nginx | HAProxy | Kong | APISIX |
|------|---------|-------|---------|------|--------|
| 部署方式 | 单二进制 | 模块化 | 单二进制 | 插件化 | 插件化 |
| 配置方式 | 文件/API/CRD | 配置文件 | 配置文件 | Admin API | Admin API |
| 服务发现 | 原生支持 | 无 | 无 | 无 | 原生支持 |
| 性能 | 高 | 极高 | 极高 | 中高 | 高 |
| 学习曲线 | 低 | 中 | 高 | 中 | 高 |
| 社区生态 | 增长中 | 成熟 | 成熟 | 成熟 | 增长中 |
| 适用场景 | K8s/Docker | 传统/静态 | 高性能 TCP | 企业 API | 云原生 API |

### 选型决策

```
K8s 原生 + 自动证书 + 动态环境 → Traefik
极致性能 + WAF + 混合环境 → Nginx
高 TCP 负载均衡 → HAProxy
企业级 API 治理 → Kong/APISIX
轻量级微服务网关 → Traefik
```

## IngressRoute CRD（Kubernetes部署）

### IngressRoute配置

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: web-ingress
spec:
  entryPoints:
    - web
  routes:
    - match: Host(`example.com`) && PathPrefix(`/api`)
      kind: Rule
      services:
        - name: api-service
          port: 80
          weight: 100
      middlewares:
        - name: rate-limit
    - match: Host(`example.com`)
      kind: Rule
      services:
        - name: web-service
          port: 80
```

### IngressRoute优势

| 特性 | IngressRoute | 传统Ingress |
|------|-------------|-------------|
| 验证 | CRD校验 | 有限校验 |
| 功能 | 支持中间件 | 功能有限 |
| 更新 | 动态更新 | 需要重载 |
| 扩展 | 支持插件 | 有限扩展 |

## 中间件链（Rate Limit/Auth/Headers）

### 常用中间件

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: rate-limit
spec:
  rateLimit:
    average: 100
    burst: 50
    period: 1s
---
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: auth-basic
spec:
  basicAuth:
    secret: auth-secret
---
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: security-headers
spec:
  headers:
    stsSeconds: 31536000
    stsIncludeSubdomains: true
    frameDeny: true
    contentTypeNosniff: true
    browserXssFilter: true
```

### 中间件组合

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: chain
spec:
  chain:
    middlewares:
      - name: rate-limit
      - name: auth-basic
      - name: security-headers
```

## Gateway API（Kubernetes网关标准）

### Gateway API资源

| 资源 | 说明 |
|------|------|
| GatewayClass | 网关类定义（类似StorageClass） |
| Gateway | 网关实例（监听器配置） |
| HTTPRoute | HTTP路由规则 |
| GRPCRoute | gRPC路由规则 |
| TCPRoute | TCP路由规则 |
| TLSRoute | TLS路由规则 |

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: production-gateway
spec:
  gatewayClassName: traefik
  listeners:
    - name: http
      protocol: HTTP
      port: 80
    - name: https
      protocol: HTTPS
      port: 443
      tls:
        mode: Terminate
        certificateRefs:
          - name: tls-cert
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api-route
spec:
  parentRefs:
    - name: production-gateway
  hostnames:
    - "api.example.com"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /v1
      backendRefs:
        - name: api-v1
          port: 80
```

## Kubernetes Ingress对比

| 维度 | Traefik Ingress | Nginx Ingress | HAProxy Ingress |
|------|----------------|---------------|-----------------|
| 配置方式 | CRD + 注解 | 注解 | ConfigMap |
| 动态更新 | 原生支持 | 部分支持 | 部分支持 |
| 中间件 | 丰富 | 有限 | 有限 |
| 服务发现 | 原生支持 | 原生支持 | 原生支持 |
| 性能 | 高 | 最高 | 高 |
| 生态 | 插件丰富 | 最成熟 | 稳定 |

## 负载均衡策略（WRR/镜像/Sticky）

### 负载均衡配置

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: ServersTransport
metadata:
  name: my-transport
spec:
  serverName: example.com
  insecureSkipVerify: true
---
# 加权轮询（Weighted Round Robin）
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: weighted-route
spec:
  routes:
    - match: Host(`example.com`)
      kind: Rule
      services:
        - name: v1-service
          port: 80
          weight: 90
        - name: v2-service
          port: 80
          weight: 10
```

### 镜像流量

```yaml
# 流量镜像（Shadow Traffic）
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: mirror-route
spec:
  routes:
    - match: Host(`example.com`)
      kind: Rule
      middlewares:
        - name: traffic-mirror
      services:
        - name: main-service
          port: 80
---
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: traffic-mirror
spec:
  mirroring:
    name: main-service
    percentage: 10
    mirrors:
      - name: canary-service
        port: 80
```

## TLS配置（Let's Encrypt/证书管理）

### 自动TLS配置

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: secure-route
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`example.com`)
      kind: Rule
      services:
        - name: web-service
          port: 80
  tls:
    certResolver: letsencrypt
    domains:
      - main: example.com
        sans:
          - "*.example.com"
---
# ACME配置
apiVersion: traefik.containo.us/v1alpha1
kind: CertStore
metadata:
  name: default
spec:
  kind: ClusterStore
  vault:
    server: https://vault.example.com
    path: pki
    role: traefik
```

## Traefik Enterprise（Service Mesh/RBAC/Metrics）

### Traefik企业版功能

| 功能 | 社区版 | 企业版 |
|------|--------|--------|
| 路由/负载均衡 | ✅ | ✅ |
| 中间件 | 基础 | 高级 |
| Service Mesh | ❌ | ✅ |
| RBAC | ❌ | ✅ |
| 高级监控 | ❌ | ✅ |
| 企业支持 | ❌ | ✅ |

### Service Mesh配置

```yaml
# Traefik Mesh配置
apiVersion: traefik.containo.us/v1alpha1
kind: ServiceMesh
metadata:
  name: default
spec:
  enableTracing: true
  enableStats: true
  meshGateway:
    port: 8080
```

## Traefik vs Nginx vs HAProxy vs Envoy

| 维度 | Traefik | Nginx | HAProxy | Envoy |
|------|---------|-------|---------|-------|
| 语言 | Go | C | C | C++ |
| 配置 | 动态 | 静态/动态 | 静态 | 动态 |
| 服务发现 | 原生 | 模块 | 模块 | xDS |
| 可观测 | 内置Dashboard | 需要扩展 | 基础 | 强大 |
| 适用 | K8s/云原生 | Web服务 | TCP负载 | Service Mesh |
| 性能 | 高 | 最高 | 高 | 高 |

## 运维管理（Dashboard/Prometheus/日志）

### Dashboard配置

```yaml
# Dashboard配置
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: traefik-dashboard
spec:
  entryPoints:
    - web
  routes:
    - match: Host(`traefik.example.com`)
      kind: Rule
      services:
        - name: api@internal
          kind: TraefikService
      middlewares:
        - name: basic-auth
```

### Prometheus监控

```yaml
# 启用Prometheus metrics
apiVersion: traefik.containo.us/v1alpha1
kind: ServersTransport
metadata:
  name: prometheus
spec:
  forwardAuth:
    address: http://auth-service:8080
---
# 配置文件
[metrics]
  [metrics.prometheus]
    buckets = [0.1, 0.3, 1.2, 5.0]
    entryPoint = "metrics"
```

## 最佳实践（生产环境/安全/性能调优）

### 生产环境配置

```yaml
# 生产环境配置要点
1. 高可用部署：
   - Deployment replicas >= 3
   - Pod反亲和性
   - PodDisruptionBudget

2. 资源限制：
   resources:
     requests:
       cpu: 100m
       memory: 128Mi
     limits:
       cpu: 1000m
       memory: 512Mi

3. 健康检查：
   livenessProbe:
     httpGet:
       path: /ping
       port: 8080
     initialDelaySeconds: 10
   readinessProbe:
     httpGet:
       path: /ping
       port: 8080
```

### 安全最佳实践

| 实践 | 说明 |
|------|------|
| HTTPS强制 | 所有入口启用TLS |
| HSTS | 启用Strict-Transport-Security |
| 限流 | 配置rateLimit中间件 |
| 认证 | 启用认证中间件 |
| WAF | 集成ModSecurity或云WAF |
| 网络策略 | K8s NetworkPolicy限制流量 |

### 性能调优

| 参数 | 说明 | 优化值 |
|------|------|--------|
| maxIdleConns | 最大空闲连接 | 按需 |
| IdleConnTimeout | 空闲连接超时 | 90s |
| forwardingTimeout | 转发超时 | 30s |
| ContentLengthStrict | 严格内容长度 | 按需 |

## 与其他板块的关系

- 网关选型总览见「[API 网关](./API网关.md)」；
- Kong/APISIX 对比见「[Kong 与 APISIX 网关](./Kong与APISIX网关.md)」；
- Nginx 原理见「[Nginx](./Nginx.md)」；
- K8s 基础见「[云原生/Kubernetes 核心](../../云原生/Kubernetes核心.md)」；
- 云上流量接入（LB/CDN）见「[云网络与流量接入体系](./云网络与流量接入体系.md)」。

---

## 八、Traefik 中间件详解

### 8.1 常用中间件

| 中间件 | 说明 | 配置示例 |
|--------|------|----------|
| BasicAuth | 基本认证 | users: ["admin:$apr1$..."] |
| ForwardAuth | 外部认证服务 | authAddress: http://auth-svc |
| RateLimit | 限流 | average: 100, burst: 50 |
| Retry | 重试 | attempts: 3, initialInterval: 100ms |
| StripPrefix | 路径前缀剥离 | prefixes: ["/api"] |
| Headers | 响应头修改 | customResponseHeaders: {X-Custom: "value"} |
| Compress | 响压压缩 | excludedContentTypes: ["image/*"] |
| CircuitBreaker | 熔断 | expression: "LatencyAtQuantileMS(50.0) > 100" |

### 8.2 中间件组合示例

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: auth-ratelimit
spec:
  chain:
    middlewares:
      - name: auth
      - name: ratelimit
        rateLimit:
          average: 100
          burst: 50
      - name: compress
```

### 8.3 Traefik 可观测配置

```yaml
# Prometheus 指标
metrics:
  prometheus:
    entryPoint: metrics
    addEntryPointsLabels: true
    addRoutersLabels: true
    addServicesLabels: true

# 访问日志
accessLog:
  filePath: /var/log/traefik/access.log
  format: json
  bufferingSize: 100

# Tracing（Jaeger/Zipkin）
tracing:
  jaeger:
    localAgentHostPort: 127.0.0.1:6831
```

---

## 九、Traefik 生产配置清单

| 配置项 | 建议值 |
|--------|--------|
| Dashboard | 生产关闭或加 BasicAuth |
| 优雅停机 | gracePeriod: 30s |
| 连接超时 | transport.respondingTimeouts.readTimeout: 60s |
| 重试 | retry.attempts: 3 |
| 限流 | rateLimit.average: 100 |
| 日志级别 | INFO（生产）/DEBUG（排查） |
| TLS 版本 | minVersion: VersionTLS12 |
| 密码套件 | TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 |

### 9.1 IngressRoute 完整示例

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: api-gateway
  namespace: production
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`api.example.com`) && PathPrefix(`/v1`)
      kind: Rule
      middlewares:
        - name: rate-limit
        - name: jwt-auth
        - name: strip-prefix
      services:
        - name: api-service
          port: 80
          weight: 100
    - match: Host(`api.example.com`) && PathPrefix(`/v2`)
      kind: Rule
      services:
        - name: api-v2
          port: 80
  tls:
    certResolver: letsencrypt
```

### 9.2 中间件配置示例

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: rate-limit
spec:
  rateLimit:
    average: 100
    burst: 50
    period: 1s
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: jwt-auth
spec:
  forwardAuth:
    address: http://auth-service:8080/auth
    trustForwardHeader: true
    authResponseHeaders:
      - X-User-ID
      - X-User-Roles
```

### 9.3 部署架构

```
公网用户 → Cloud LB（NLB/CLB）
  → Traefik Ingress Controller（K8s Pod）
    → 中间件链（认证/限流/重试）
      → K8s Service（ClusterIP）
        → Pod（应用）
```

---

## 十、Traefik 常见问题排查

| 问题 | 原因 | 解决 |
|------|------|------|
| 502/503 | 后端 Pod 不健康 | 检查 readiness probe |
| 证书过期 | Let's Encrypt 续期失败 | 检查 ACME 配置/存储 |
| 路由不生效 | IngressRoute 语法错 | kubectl describe 检查 |
| 性能差 | 中间件过多 | 精简中间件链 |
| 连接超时 | 后端响应慢 | 调整超时配置 |

---

## 十一、Traefik Gateway API 支持

### Gateway API 资源模型

```yaml
# Gateway 定义
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: production-gateway
  namespace: traefik
spec:
  gatewayClassName: traefik
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes:
        namespaces:
          from: All
    - name: https
      protocol: HTTPS
      port: 443
      tls:
        mode: Terminate
        certificateRefs:
          - name: wildcard-cert
      allowedRoutes:
        namespaces:
          from: All
---
# HTTPRoute 定义
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api-route
  namespace: default
spec:
  parentRefs:
    - name: production-gateway
      namespace: traefik
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: api-service
          port: 80
```

| Gateway API特性 | 说明 | 优势 |
|-----------------|------|------|
| 角色分离 | Gateway/HTTPRoute/TLSRoute | 权限清晰 |
| 多协议 | HTTP/TCP/UDP/gRPC | 统一入口 |
| 可移植 | 标准API | 避免厂商锁定 |
| 高级路由 | Header匹配/权重分配 | 灵活路由 |

### Traefik Dashboard 安全配置

```yaml
# Dashboard 访问控制
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: traefik-dashboard
  namespace: traefik
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`traefik.example.com`)
      kind: Rule
      services:
        - name: api@internal
          kind: TraefikService
  tls:
    certResolver: letsencrypt
  middlewares:
    - name: basic-auth
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: basic-auth
  namespace: traefik
spec:
  basicAuth:
    secret: traefik-dashboard-auth
```

## 十二、负载均衡策略深度对比

| 策略 | 算法 | 适用场景 | 优缺点 |
|------|------|---------|--------|
| Round Robin | 轮询 | 通用 | 简单均匀 |
| Weighted Round Robin | 加权轮询 | 异构服务器 | 按能力分配 |
| Least Connections | 最少连接 | 长连接场景 | 避免过载 |
| IP Hash | IP哈希 | 会话保持 | 会话粘性 |
| Random | 随机 | 简单场景 | 均匀性差 |

```yaml
# 负载均衡策略配置
apiVersion: traefik.io/v1alpha1
kind: ServersTransport
metadata:
  name: custom-transport
spec:
  serverName: backend
  insecureSkipVerify: false
  maxIdleConnsPerHost: 200
  forwardingTimeouts:
    dialTimeout: 30s
    responseHeaderTimeout: 60s
    idleConnTimeout: 90s
```

## 十三、TLS 证书管理最佳实践

| 证书类型 | 适用场景 | 自动续期 | 成本 |
|----------|---------|---------|------|
| Let's Encrypt | 公网域名 | 是(90天) | 免费 |
| 自签名 | 内部服务 | 否 | 免费 |
| 商业证书 | 企业域名 | 否 | 付费 |
| CA证书 | 内部PKI | 否 | 自建 |

```yaml
# TLS 证书配置
apiVersion: traefik.io/v1alpha1
kind: TLSStore
metadata:
  name: default
  namespace: traefik
spec:
  defaultCertificate:
    secretName: wildcard-tls
---
# ACME 自动证书
apiVersion: traefik.io/v1alpha1
kind: CertificatesStore
metadata:
  name: letsencrypt
  namespace: traefik
spec:
  kind: ClusterStore
  provider:
    name: letsencrypt
    email: admin@example.com
    httpChallenge:
      entryPoint: web
```

## 十四、Traefik vs Nginx vs Kong vs APISIX 选型

| 维度 | Traefik | Nginx | Kong | APISIX |
|------|---------|-------|------|--------|
| 部署方式 | 单二进制 | 模块化 | 插件化 | 插件化 |
| 配置方式 | 文件/API/CRD | 配置文件 | Admin API | Admin API |
| 服务发现 | 原生支持 | 无 | 无 | 原生支持 |
| 性能 | 高 | 极高 | 中高 | 高 |
| 学习曲线 | 低 | 中 | 中 | 高 |
| 社区生态 | 增长中 | 成熟 | 成熟 | 增长中 |
| 适用场景 | K8s/Docker | 传统/静态 | 企业API | 云原生API |

> 一句话：**Traefik = Provider 自动发现 + 中间件编排 + Let's Encrypt 自动证书 + 单二进制部署；选型先看「环境（K8s/Docker 动态环境→Traefik，静态传统→Nginx）」，再定「治理深度（轻量→Traefik，企业级 API→Kong/APISIX）」，最后配「HTTPS（自动）+ 可观测（Prometheus 大盘）」**。
