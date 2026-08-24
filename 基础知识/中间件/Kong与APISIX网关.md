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

## 十二、Kong 插件开发

### 12.1 Kong 插件开发流程

```
1. 创建插件目录：kong/plugins/my-plugin/
2. 编写 schema.lua（配置定义）
3. 编写 handler.lua（各阶段处理函数）
4. 在 kong.conf 中启用插件
5. 绑定到 Route/Service/Global
```

### 12.2 Kong 插件骨架

```lua
-- kong/plugins/my-plugin/schema.lua
local typedefs = require "kong.db.schema.typedefs"

return {
  name = "my-plugin",
  fields = {
    { protocols = typedefs.protocols { default = { "http", "https" } } },
    { config = {
        type = "record",
        fields = {
          { header_name = { type = "string", required = true } },
          { header_value = { type = "string", required = true } },
          { rate_limit = { type = "number", default = 100 } },
        },
    }},
  },
}

-- kong/plugins/my-plugin/handler.lua
return {
  PRIORITY = 1000,
  access = function(conf, plugin)
    kong.service.request.set_header(conf.header_name, conf.header_value)
  end,
  header_filter = function(conf, plugin)
    kong.response.set_header("X-Powered-By", "my-plugin")
  end,
  log = function(conf, plugin)
    kong.log.info("request processed by my-plugin")
  end,
}
```

### 12.3 Kong 插件 vs APISIX 插件

| 维度 | Kong 插件 | APISIX 插件 |
|------|-----------|-------------|
| 语言 | Lua（PDK） | Lua/Java/Go/WASM |
| 开发复杂度 | 中等 | 低（轻量级） |
| 热加载 | 需 reload | 支持热加载 |
| 生态 | 成熟（60+） | 丰富（100+） |
| 文档 | 完善 | 完善 |

---

## 十三、Kong in Kubernetes（Kong Ingress Controller）

### 13.1 架构

```
K8s 集群：
  Kong Ingress Controller（Pod）
    → 监听 Ingress/KongIngress CRD
    → 动态更新 Kong 网关配置
    → 路由到后端 Service Pod

CRD 资源：
  KongIngress：网关专属配置
  TCPIngress：TCP 路由
  UDPIngress：UDP 路由
  KongPlugin：插件配置
  KongConsumer：消费者
```

### 13.2 KongIngress CRD 示例

```yaml
apiVersion: configuration.konghq.com/v1
kind: KongIngress
metadata:
  name: api-kong
upstream:
  hash_on: none
  algorithm: round-robin
  healthchecks:
    active:
      http_path: /healthz
      healthy:
        interval: 5
        successes: 2
      unhealthy:
        interval: 3
        http_failures: 3
service:
  connect_timeout: 5000
  read_timeout: 60000
  write_timeout: 60000
route:
  strip_path: true
  preserve_host: false
  protocols:
  - https
```

### 13.3 Kong Plugin CRD

```yaml
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: rate-limit-plugin
  namespace: default
config:
  minute: 100
  policy: local
  fault_tolerant: true
plugin: rate-limiting
---
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: jwt-plugin
config:
  uri_param_names: jwt
  claims_to_verify:
  - exp
plugin: jwt
```

---

## 十四、APISIX 插件架构

### 14.1 插件运行机制

```
APISIX 插件执行流程：
  1. 请求到达 → 生成插件执行链（按优先级排序）
  2. rewrite 阶段 → 改写请求
  3. access 阶段 → 鉴权/限流/IP 限制
  4. before_proxy → 转发前处理
  5. proxy → 转发到后端
  6. header_filter → 响应头处理
  7. body_filter → 响应体处理
  8. log → 日志/指标上报

插件优先级（数字越大越先执行）：
  cors: 120000
  ip-restriction: 30000
  jwt-auth: 2500
  limit-count: 1040
  proxy-rewrite: 10080
  prometheus: 910
```

### 14.2 多语言插件支持

```yaml
# APISIX 插件多语言架构
APISIX 核心（Lua）
  ├── Lua 插件（原生，性能最佳）
  ├── Java 插件（通过 RPC 调用）
  ├── Go 插件（通过 RPC 调用）
  └── WASM 插件（WebAssembly）

WASM 插件示例：
  使用 Rust/Go 编译为 WASM
  在 APISIX 中运行
  安全隔离 + 跨平台
```

### 14.3 APISIX 插件热加载

```bash
# 动态启用插件
curl http://127.0.0.1:9180/apisix/admin/routes/1 -X PUT -d '
{
  "uri": "/api/*",
  "plugins": {
    "limit-count": {
      "count": 100,
      "time_window": 60
    }
  }
}'

# 插件热更新（无需重启）
# 修改插件代码后，APISIX 自动重新加载
```

---

## 十五、APISIX vs Kong 性能对比

### 15.1 基准测试数据

| 指标 | APISIX | Kong |
|------|--------|------|
| 简单路由 QPS | ~12 万 | ~8 万 |
| 路由匹配延迟 | ~0.3ms | ~0.5ms |
| 内存占用（空载） | ~30MB | ~50MB |
| 配置热更新时间 | <100ms | ~1s（reload） |
| 路由数量（万级） | 性能稳定 | 性能下降 |

### 15.2 路由匹配性能

```
APISIX：radixtree（Radix Tree）匹配
  路由数量增加 → 匹配时间基本不变
  万级路由：O(log n) 复杂度

Kong：先查最具体匹配（缓存 + 优先表）
  路由数量增加 → 匹配时间略有增加
  万级路由：O(n) 退化风险

实践建议：
  路由控制在万级以内
  合理设计 uri 前缀
  避免过多正则路由
```

### 15.3 性能测试方法

```bash
# 使用 wrk 测试
wrk -t12 -c400 -d30s http://127.0.0.1:9080/api/test

# 使用 vegeta 测试
echo "GET http://127.0.0.1:9080/api/test" | vegeta attack -rate=10000 -duration=30s | vegeta report

# 监控指标
# - 请求量 QPS
# - 延迟 P50/P99
# - 错误率
# - CPU/内存使用率
```

---

## 十六、APISIX Serverless

### 16.1 Serverless 插件

```json
{
  "plugins": {
    "serverless-pre-function": {
      "phase": "rewrite",
      "functions": [
        "return function(conf, ctx) ngx.say('hello from serverless') end"
      ]
    },
    "serverless-post-function": {
      "phase": "log",
      "functions": [
        "return function(conf, ctx) ngx.log(ngx.INFO, 'request processed') end"
      ]
    }
  }
}
```

### 16.2 Serverless 使用场景

| 场景 | 说明 |
|------|------|
| 快速原型 | 无需部署服务，网关内直接运行逻辑 |
| 边缘计算 | 在网关层执行轻量计算 |
| 请求预处理 | 转发前修改 Header/参数 |
| 响应后处理 | 日志记录/指标上报 |
| 简单聚合 | 多个后端结果聚合 |

---

## 十七、API 网关迁移策略

### 17.1 迁移路径

```
迁移三阶段：
  Phase 1：并行运行（新旧网关同时接收流量）
    → 灰度切换 10% 流量到新网关
    → 监控指标对比

  Phase 2：逐步切换
    → 10% → 30% → 50% → 80% → 100%
    → 每步观察错误率/延迟

  Phase 3：下线旧网关
    → 确认全量切换完成
    → 保留旧网关 7 天
    → 下线
```

### 17.2 迁移检查清单

| 检查项 | 说明 |
|--------|------|
| 路由规则 | 所有路由已迁移且匹配正确 |
| 鉴权插件 | JWT/OAuth2 配置一致 |
| 限流规则 | 限流阈值已迁移 |
| 灰度策略 | 灰度规则已迁移 |
| 监控告警 | 指标采集已对接 |
| 日志 | 访问日志格式一致 |
| 性能 | 延迟/QPS 不退化 |
| 回滚方案 | 保留旧网关可快速回滚 |

### 17.3 灰度切换策略

```yaml
# Nginx 灰度切换示例
upstream old_gateway {
    server 10.0.0.1:80;
}

upstream new_gateway {
    server 10.0.0.2:80;
}

split_clients "${remote_addr}" $target {
    10% new_gateway;
    * old_gateway;
}

server {
    location / {
        proxy_pass http://$target;
    }
}
```

---

## 十八、网关安全加固

### 18.1 安全配置清单

| 加固项 | 说明 |
|--------|------|
| TLS 配置 | TLSv1.2+，禁用弱加密套件 |
| 速率限制 | 全局+路由级限流 |
| IP 黑白名单 | 按路由配置 ACL |
| 请求验证 | 参数校验/SQL 注入防护 |
| 响应头安全 | CORS/X-Frame-Options/CSP |
| 日志审计 | 访问日志+异常日志 |
| 证书管理 | 自动续期+轮转 |

### 18.2 APISIX 安全插件组合

```json
{
  "plugins": {
    "cors": {
      "allow_origins": "https://example.com",
      "allow_methods": ["GET", "POST"],
      "allow_headers": ["Authorization"]
    },
    "ip-restriction": {
      "whitelist": ["10.0.0.0/8", "172.16.0.0/12"]
    },
    "uri-blocker": {
      "block_rules": ["\\.env", "wp-admin", "phpmyadmin"]
    },
    "request-validation": {
      "body_schema": {
        "type": "object",
        "required": ["name"],
        "properties": {
          "name": {"type": "string"}
        }
      }
    },
    "prometheus": {},
    "opentelemetry": {}
  }
}
```

---

## 十九、网关可观测性

### 19.1 可观测性三支柱

| 支柱 | 工具 | 指标 |
|------|------|------|
| 指标 | Prometheus + Grafana | QPS/延迟/错误率/连接数 |
| 日志 | ELK/Loki | 访问日志/错误日志 |
| 链路 | Jaeger/Zipkin | 请求追踪/Span 分析 |

### 19.2 网关核心监控指标

```
网关监控黄金信号：
  ├── 请求量（QPS/RPM）
  ├── 错误率（4xx/5xx 比例）
  ├── 延迟分位线（P50/P90/P99）
  ├── 连接数（活跃/总计）
  ├── 后端健康状态
  ├── 插件执行耗时
  └── 限流/熔断触发次数
```

### 19.3 告警规则示例

```yaml
# Prometheus 告警规则
groups:
- name: gateway-alerts
  rules:
  - alert: HighErrorRate
    expr: rate(gateway_http_responses_total{status=~"5.."}[5m]) / rate(gateway_http_responses_total[5m]) > 0.05
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "网关 5xx 错误率 > 5%"

  - alert: HighLatency
    expr: histogram_quantile(0.99, rate(gateway_http_request_duration_seconds_bucket[5m])) > 2
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "网关 P99 延迟 > 2s"

  - alert: LowActiveServers
    expr: gateway_backend_active_servers < 2
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "后端活跃实例 < 2"
```

---

## 十一、与其他板块的关系

- OpenResty 底层见「[OpenResty](./OpenResty.md)」；
- Spring 生态网关见「[Spring Cloud Gateway](./SpringCloudGateway.md)」；
- Nginx 基础见「[Nginx](./Nginx.md)」；
- 网关选型整体见「[API 网关](./API网关.md)」；
- 服务网格（更细粒度流量治理）见「[云原生/Service Mesh](../../云原生/ServiceMesh.md)」。

> 一句话：**Kong/APISIX = Route→Service→Upstream 三层模型 + 插件化能力（鉴权/限流/灰度/可观测）+ 中心化配置热更新——选型先看「云原生/插件丰富→APISIX，企业商业→Kong」；生产守则：插件最小化、限流前置、重试受限、灰度带指标、配置走审核**。