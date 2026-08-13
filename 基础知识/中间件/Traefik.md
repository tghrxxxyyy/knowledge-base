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

## 七、与其他板块的关系

- 网关选型总览见「[API 网关](./API网关.md)」；
- Kong/APISIX 对比见「[Kong 与 APISIX 网关](./Kong与APISIX网关.md)」；
- Nginx 原理见「[Nginx](./Nginx.md)」；
- K8s 基础见「[云原生/Kubernetes 核心](../../云原生/Kubernetes核心.md)」；
- 云上流量接入（LB/CDN）见「[云网络与流量接入体系](./云网络与流量接入体系.md)」。

> 一句话：**Traefik = Provider 自动发现 + 中间件编排 + Let's Encrypt 自动证书 + 单二进制部署；选型先看「环境（K8s/Docker 动态环境→Traefik，静态传统→Nginx）」，再定「治理深度（轻量→Traefik，企业级 API→Kong/APISIX）」，最后配「HTTPS（自动）+ 可观测（Prometheus 大盘）」**。
