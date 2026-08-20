# Kong 与 APISIX 网关深入（插件架构 / 路由匹配 / 负载均衡 / 灰度发布 / 部署拓扑 / 选型）

> Kong（Lua/OpenResty）与 APISIX（Lua/OpenResty，Apache 基金会）是**两大开源云原生 API 网关**。核心价值：**流量入口统一治理**——路由、鉴权、限流、灰度、可观测一次配好。本篇深入拆解：插件化架构、路由与匹配优先级、负载均衡与健康检查、灰度发布、部署拓扑、选型决策。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 流量入口分散 | 每个服务自己处理鉴权/限流，重复且不一致 |
| 配置改动慢 | 网关规则改动要重载/重启 |
| 灰度发布 | 新版本流量按比例/条件切换 |
| 鉴权统一 | 多服务统一认证（OAuth2/JWT/Key-Auth） |
| 可观测性 | 网关层统一记录调用/延迟/错误 |
| 高可用 | 网关自身高可用（集群部署） |

> 核心认知：**Kong/APISIX = 「可编程的流量入口」**——核心是 **Route（路由规则）→ Service（后端服务）→ Upstream（后端实例组）** 三层模型，所有能力（鉴权/限流/灰度）通过**插件**挂载到路由上，配置存中心化存储，**热更新不重启**。

---

## 二、核心数据模型

```
三层模型：

  Route（路由规则）：Host + Path + Method + Headers 匹配
    ↓ 绑定
  Service（后端服务）：一个逻辑后端（含超时/重试）
    ↓ 指向
  Upstream（后端实例组）：多实例 + 负载均衡 + 健康检查

示例：
  Route:  api.example.com /orders/*  → Service: order-service
  Service: order-service → Upstream: 10.0.0.1:8080, 10.0.0.2:8080

配置存储：
  Kong：PostgreSQL（Cassandra 旧版）
  APISIX：etcd（v3，天然分布式）
  → 多节点共享配置 → 热更新（无需重启）
```

---

## 三、插件架构（核心机制）

### 3.1 插件生命周期

```
插件挂在 Route/Service/Consumer 上，请求经过时按顺序执行：

  1. rewrite      （改写请求：路径/Header）
  2. access       （访问控制：鉴权/限流/IP 黑白名单）
  3. before_proxy （转发前）
  4. proxy        （转发到后端）
  5. header_filter（响应头处理）
  6. body_filter  （响应体处理）
  7. log          （日志/指标上报）

插件优先级：数字越大越先执行（可配置）

处理逻辑（on request → on response）：
  鉴权 → 限流 → 路由改写 → 转发 → 响应处理 → 日志
```

### 3.2 常用插件

| 类别 | 插件（APISIX/Kong） |
|------|---------------------|
| 鉴权 | jwt-auth / key-auth / basic-auth / oauth2 / hmac-auth |
| 流量控制 | limit-count / limit-req / limit-conn |
| 灰度 | traffic-split / canary / blue-green |
| 协议转换 | grpc-transcode / kafka-proxy |
| 可观测性 | prometheus / opentelemetry / zipkin |
| 安全 | cors / ip-restriction / uri-blocker / waf |
| 服务发现 | dns / consul / nacos |
| 请求处理 | proxy-rewrite / response-rewrite / redirect |

### 3.3 插件执行原理

```
APISIX 插件实现：
  Lua 表定义（优先级 + 各阶段处理函数）
  编译期生成执行链（按优先级排序）
  请求到达 → 按链执行（可中断）

Kong 插件实现：
  Lua 插件包（schema 校验 + 各阶段函数）
  每个插件独立配置（绑定 Route/Service/Consumer/Global）

自定义插件（新语言插件）：
  APISIX：Lua/Java/Go（wasm 支持）
  Kong：Lua（PDK 开发）
```

### 3.4 开发自定义插件（示例思路）

```lua
-- APISIX 自定义插件骨架
local plugin_name = {
    version = 0.1,
    priority = 2500,
    name = "my-header",
    schema = {
        type = "object",
        properties = {
            header_name = { type = "string" },
            header_value = { type = "string" },
        },
        required = { "header_name", "header_value" },
    },
}

function plugin_name.access(conf, ctx)
    ngx.req.set_header(conf.header_name, conf.header_value)
end

return plugin_name
```

---

## 四、路由匹配（深入）

### 4.1 匹配规则

```
APISIX Route 匹配优先级（精确 > 前缀 > 正则）：

  匹配条件（组合）：
    uri / method / host / remote_addr / vars / priority / filter_func

  1. 精确匹配（uri == "/v1/orders"）
  2. 前缀匹配（uri == "/orders/*"）
  3. 正则匹配（uri == ~ "^/user/\\d+$"）
  4. 同优先级 → priority 数字大者先

Kong 路由匹配：
  Protocols（http/https/grpc）
  Methods + Hosts + Paths + Headers + SNIs
  匹配失败 → 404/默认路由

示例：
  # APISIX 创建路由（admin API）
  curl http://127.0.0.1:9180/apisix/admin/routes/1 -X PUT -d '
  {
    "uri": "/orders/*",
    "methods": ["GET", "POST"],
    "plugins": {
      "jwt-auth": {},
      "limit-count": {
        "count": 1000, "time_window": 60
      }
    },
    "upstream": {
      "type": "roundrobin",
      "nodes": {"10.0.0.1:8080": 1, "10.0.0.2:8080": 1}
    }
  }'
```

### 4.2 路由匹配性能

```
性能关键：
  路由数量大（万级）→ 匹配算法效率
  APISIX：radixtree（radix tree）匹配（亿级请求性能）
  Kong：先查最具体匹配（缓存 + 优先表）

实践：
  路由数量控制在万级以内
  合理设计 uri 前缀（避免过多正则）
```

---

## 五、负载均衡与健康检查

### 5.1 负载均衡策略

```
APISIX Upstream 类型：
  roundrobin（加权轮询，默认）
  chash（一致性哈希：按 IP/参数 → 会话保持）
  ewma（动态权重：按延迟调整）
  least_conn（最少连接）

Kong 负载均衡：
  加权轮询 / 一致性哈希（upstream 层）

会话保持场景（有状态服务）：
  chash + key（remote_addr / Header / Cookie）
```

### 5.2 健康检查

```
主动检查：
  定时探测（TCP/HTTP 指定路径）
  失败 N 次 → 标记不健康 → 摘除流量
  恢复探测 → 重新加入

被动检查（traffic-based）：
  根据真实请求结果判断（5xx 计数）
  连续失败 → 标记不健康（比主动快）

配置示例：
  "check": {
    "active": {
      "timeout": 5,
      "http_path": "/health",
      "healthy": {"interval": 2, "successes": 2},
      "unhealthy": {"interval": 1, "http_failures": 3}
    },
    "passive": {
      "unhealthy": {"http_failures": 5}
    }
  }

重试机制：
  后端失败重试次数（idempotent 方法可安全重试）
  注意超时与重试叠加（重试风暴）
```

---

## 六、灰度发布与分流（深入）

### 6.1 流量拆分（traffic-split）

```yaml
# APISIX traffic-split 插件
"traffic-split": {
  "rules": [
    {
      "weighted_upstreams": [
        {"upstream": {"nodes": {"v1-service:80": 1}}, "weight": 90},
        {"upstream": {"nodes": {"v2-service:80": 1}}, "weight": 10}
      ]
    }
  ]
}
```

### 6.2 灰度策略对比

| 方式 | 实现 | 适用 |
|------|------|------|
| 按比例 | traffic-split 权重 | 通用灰度 |
| 按条件 | 路由匹配（header/cookie/参数） | 指定用户灰度 |
| 按 IP 段 | ip-restriction + 路由 | 内部测试 |
| 时间灰度 | 定时规则 | 大促前演练 |

```
生产灰度流程：
  1. 新建 v2 Upstream（新版本服务）
  2. traffic-split 1% → 观察指标（错误率/延迟）
  3. 逐步提升 10% → 50% → 100%
  4. 全量后清理 v1
  5. 有问题秒回滚（权重归零）
```

---

## 七、Kong vs APISIX 对比

| 维度 | Kong | APISIX |
|------|------|--------|
| 出身 | Kong Inc.（2015） | Apache 基金会（2019） |
| 语言/平台 | Lua/OpenResty + Go（新） | Lua/OpenResty + 多语言 |
| 配置存储 | PostgreSQL | etcd |
| 管理 API | Kong Admin API | APISIX Admin API |
| 插件数 | 内置 60+ | 内置 100+ |
| 服务发现 | DNS | DNS/Nacos/Consul/Eureka 等 |
| 云原生 | 有（K8s CRD） | 强（K8s CRD/服务网格） |
| 社区 | 成熟（企业版商业） | 活跃（Apache） |
| 性能 | 好 | 好（radixtree 路由） |
| 适用 | 传统/企业 | 云原生/高扩展 |

**选型关注点**：
- 云原生/K8s/高扩展 → **APISIX**（etcd 配置 + 丰富插件 + 服务发现丰富）；
- 企业商业支持 → **Kong Enterprise**；
- 已有 PostgreSQL 运维体系 → **Kong**；
- 高并发小延迟 → 两者皆可（APISIX radixtree 略优）。

---

## 八、部署拓扑

### 8.1 部署模式

```
模式一：传统 VM/裸机
  Nginx 前 → Kong/APISIX 集群（多节点 + LB）
  配置中心：PostgreSQL / etcd 集群

模式二：K8s 云原生
  Ingress Controller（网关作为集群入口）
  CRD 定义路由（Ingress/APISIXRoute）
  自动发现 Service

模式三：服务网格边车
  网关 + 边车（复杂场景）
  APISIX 支持 Mesh 模式

高可用要点：
  网关多副本 + LB（外部/内部）
  配置存储高可用（PG 主从 / etcd 集群）
  健康检查 + 自动摘除
```

### 8.2 性能指标

```
网关性能监控（Prometheus 插件）：
  请求量 QPS / 延迟 P50/P99
  错误率（4xx/5xx）
  连接数/后端延迟
  插件执行耗时（定位瓶颈插件）

容量规划：
  单节点 APISIX 约 5~10 万 QPS（简单路由）
  限流/鉴权插件增加耗时（毫秒级）
  按峰值 × 1.5 冗余规划节点
```

---

## 九、生产实践

### 9.1 最佳实践

| 实践 | 说明 |
|------|------|
| 插件最小化 | 路由只挂必要插件（每个插件加耗时） |
| 限流前置 | 限流在鉴权前（防恶意消耗认证） |
| 超时/重试 | 统一配置（防重试风暴） |
| 配置审核 | 变更走 review（Admin API 审计） |
| 灰度 | 权重 + 指标观察 + 秒回滚 |
| 监控告警 | 网关指标 + 告警规则 |
| 版本升级 | 平滑升级（多节点滚动） |

### 9.2 常见坑

| 坑 | 说明 | 对策 |
|----|------|------|
| 重试风暴 | 后端故障 + 重试叠加 | 限制重试次数 |
| 限流误伤 | 全局限流过严 | 分路由限流 + 监控 |
| 配置不一致 | 多节点配置漂移 | 中心化配置（etcd/PG） |
| 插件性能 | 正则/加密插件拖慢 | 性能测试 + 必要插件 |
| 后端故障恢复慢 | 健康检查间隔长 | 缩短检测间隔 |
| 路由冲突 | 多个路由匹配同一请求 | 优先级 + 精确匹配 |

---

## 十、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 云原生/K8s 网关 | APISIX | Kong |
| 企业商业支持 | Kong Enterprise | — |
| 插件丰富/服务发现 | APISIX | Kong |
| 高并发低延迟 | APISIX | Kong |
| 已有 PostgreSQL 生态 | Kong | — |
| 简单网关 | 云网关/轻量网关 | APISIX 单节点 |

---

## 十一、与其他板块的关系

- OpenResty 底层见「[OpenResty](./OpenResty.md)」；
- Spring 生态网关见「[Spring Cloud Gateway](./SpringCloudGateway.md)」；
- Nginx 基础见「[Nginx](./Nginx.md)」；
- 网关选型整体见「[API 网关](./API网关.md)」；
- 服务网格（更细粒度流量治理）见「[云原生/Service Mesh](../../云原生/ServiceMesh.md)」。

> 一句话：**Kong/APISIX = Route→Service→Upstream 三层模型 + 插件化能力（鉴权/限流/灰度/可观测）+ 中心化配置热更新——选型先看「云原生/插件丰富→APISIX，企业商业→Kong」；生产守则：插件最小化、限流前置、重试受限、灰度带指标、配置走审核**。