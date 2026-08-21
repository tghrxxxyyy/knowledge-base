# API 网关

> **核心认知**：API 网关是微服务架构的统一入口，它将路由、认证、限流、熔断、日志等横切关注点从业务服务中抽离出来，形成集中式流量管控层。网关不是简单的反向代理，而是微服务治理的第一道防线。

## 要解决的问题

| 问题 | 没有网关时 | 有网关后 |
|------|-----------|----------|
| 客户端复杂性 | 需要知道每个微服务地址 | 统一网关地址，内部路由透明 |
| 认证授权 | 每个服务各自实现 | 网关统一认证，下游信任网关 |
| 限流熔断 | 每个服务单独配置 | 网关层集中策略 |
| 协议转换 | 客户端需适配多种协议 | 网关统一转换（HTTP/gRPC/WebSocket） |
| 日志审计 | 分散在各服务，难以聚合 | 网关层统一采集请求日志 |
| 灰度发布 | 每个服务实现路由规则 | 网关按规则分流流量 |

## 架构模式

### 网关在架构中的位置

```
                    ┌─────────────┐
                    │   客户端     │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  负载均衡    │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  API 网关    │  ← 统一入口
                    │  (Gateway)  │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
   ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
   │  用户服务    │ │  订单服务    │ │  商品服务    │
   └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
          │                │                │
   ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
   │    MySQL     │ │   MongoDB   │ │    Redis    │
   └─────────────┘ └─────────────┘ └─────────────┘
```

### 网关核心功能模块

```mermaid
graph TD
    A[客户端请求] --> B[协议处理]
    B --> C[路由匹配]
    C --> D[认证鉴权]
    D --> E[限流熔断]
    E --> F[请求/响应转换]
    F --> G[日志采集]
    G --> H[后端服务]
    H --> I[响应聚合]
    I --> J[返回客户端]
```

## 核心功能详解

### 1. 路由与负载均衡

```yaml
# 路由配置示例
routes:
  - match:
      path: /api/users/**
    route:
      - service: user-service
        weight: 90
      - service: user-service-v2
        weight: 10    # 金丝雀发布

  - match:
      path: /api/orders/**
      headers:
        x-debug: "true"
    route:
      - service: order-service-debug  # 调试流量路由

  - match:
      path: /api/products/**
      method: GET
    route:
      - service: product-service-read  # 读写分离
```

### 2. 认证与授权

```
网关认证流程：
  1. 提取 Authorization Header
  2. 验证 JWT 签名和有效期
  3. 提取 scope / roles / user_id
  4. 检查路由权限（scope 与路由匹配）
  5. 将用户信息注入 Header 传递给下游
  6. 下游服务信任网关传递的身份信息
```

### 3. 限流策略

| 限流维度 | 说明 | 典型配置 |
|----------|------|----------|
| 全局限流 | 整个网关的请求上限 | 10000 QPS |
| 路由限流 | 单个 API 的请求上限 | /api/orders: 1000 QPS |
| 用户限流 | 单个用户的请求上限 | 100 QPS/user |
| IP 限流 | 单个 IP 的请求上限 | 50 QPS/IP |
| 令牌桶 | 允许突发流量 | 100 QPS，桶容量 200 |
| 滑动窗口 | 平滑限流 | 60s 内最多 1000 次 |

### 4. 熔断与降级

```mermaid
stateDiagram-v2
    [*] --> 关闭: 初始状态
    关闭 --> 打开: 错误率 > 阈值
    打开 --> 半开: 等待冷却时间
    半开 --> 关闭: 探测请求成功
    半开 --> 打开: 探测请求失败
```

### 5. 请求转换

| 转换类型 | 场景 | 示例 |
|----------|------|------|
| Header 添加 | 传递追踪信息 | 添加 X-Request-ID |
| Header 移除 | 安全考虑 | 移除内部认证 Header |
| Body 转换 | 数据格式适配 | XML → JSON |
| 路径重写 | 后端路径不一致 | /api/v1/users → /internal/users |
| 响应聚合 | BFF 模式 | 调用多个服务，聚合结果 |

## 主流 API 网关对比

| 特性 | Kong | APISIX | Spring Cloud Gateway | Envoy |
|------|------|--------|---------------------|-------|
| 语言 | Lua/OpenResty | Lua/OpenResty | Java/Spring | C++ |
| 性能 | 高 | 极高 | 中 | 极高 |
| 扩展性 | 插件机制 | 插件机制 | Filter 链 | WASM/Lua |
| 服务发现 | DNS/Consul | DNS/Consul/Eureka | Eureka/Nacos | xDS |
| 配置管理 | Admin API | etcd | 配置文件 | xDS |
| 学习曲线 | 中 | 中 | 低（Java 生态） | 高 |
| 适用场景 | 通用 | 高性能场景 | Spring 生态 | Service Mesh |

## 网关高可用设计

```
高可用策略：
  ├── 多实例部署：至少 2 个网关节点
  ├── 无状态设计：会话信息外置到 Redis
  ├── 健康检查：主动探测后端服务状态
  ├── 优雅降级：网关故障时直连后端
  ├── 限流保护：防止网关被打垮
  └── 监控告警：网关延迟/错误率/吞吐量
```

### 性能优化

| 优化手段 | 效果 | 实现方式 |
|----------|------|----------|
| 连接池复用 | 减少 TCP 握手开销 | Keep-Alive + 连接池 |
| 响应缓存 | 减少后端调用 | 缓存热点 API 响应 |
| 异步 I/O | 提高并发处理能力 | 非阻塞事件驱动 |
| 协议优化 | 减少传输开销 | HTTP/2、gRPC |
| 本地缓存 | 减少配置查询延迟 | 路由规则本地缓存 |

## 网关选型决策

```
选型路径：
  ├── Java 技术栈？
  │   ├── 是 → Spring Cloud Gateway
  │   └── 否 ↓
  ├── 需要高性能？
  │   ├── 是 → APISIX 或 Envoy
  │   └── 否 ↓
  ├── 需要丰富插件？
  │   ├── 是 → Kong
  │   └── 否 ↓
  └── Service Mesh 场景？
      ├── 是 → Envoy (Istio 数据面)
      └── 否 → 根据团队熟悉度选择
```

## 常见陷阱

| 陷阱 | 后果 | 正确做法 |
|------|------|----------|
| 网关单点 | 故障时全部服务不可用 | 多实例 + 负载均衡 |
| 网关做太多业务逻辑 | 网关膨胀，难以维护 | 仅处理横切关注点 |
| 不限流 | 流量洪峰击垮后端 | 全局+路由+用户级限流 |
| 证书管理混乱 | HTTPS 终止配置出错 | 集中证书管理 |
| 不监控网关 | 故障时无法定位 | 完善的 metrics 和 tracing |

## WebSocket 支持

### 网关 WebSocket 代理

```
WebSocket 连接流程：
  1. 客户端发起 HTTP Upgrade 请求
  2. 网关验证 Token（通常在首次握手时）
  3. 网关与后端建立 WebSocket 连接
  4. 双向消息透传

关键配置：
  upgrade: websocket
  proxy_read_timeout: 3600s    # 长连接超时
  proxy_send_timeout: 3600s
```

### WebSocket vs HTTP 在网关中的差异

| 维度 | HTTP 请求 | WebSocket |
|------|-----------|-----------|
| 连接模型 | 短连接/Keep-Alive | 长连接 |
| 路由匹配 | Path + Method | Path（握手时） |
| 限流方式 | 按请求次数 | 按连接数 + 消息数 |
| 认证时机 | 每次请求 | 握手时一次性认证 |
| 负载均衡 | L7 路由 | L4/L7 连接级路由 |
| 健康检查 | HTTP 探测 | 连接存活检测 |

### APISIX WebSocket 配置示例

```yaml
# routes 配置
routes:
  - uri: /ws/*
    upstream:
      type: roundrobin
      nodes:
        "ws-server-1:8080": 1
        "ws-server-2:8080": 1
    plugins:
      proxy-rewrite:
        regex_uri:
          - "^/ws/(.*)"
          - "/$1"
```

## gRPC 代理

### gRPC 网关代理模式

```mermaid
graph LR
    C[HTTP/JSON 客户端] -->|REST| GW[API 网关]
    GW -->|gRPC-Web| G1[gRPC 服务1]
    GW -->|gRPC| G2[gRPC 服务2]
    C2[gRPC 客户端] -->|gRPC| GW
```

### gRPC 代理 vs HTTP 代理

| 维度 | HTTP 代理 | gRPC 代理 |
|------|-----------|-----------|
| 协议 | HTTP/1.1, HTTP/2 | HTTP/2（强制） |
| 序列化 | JSON/XML | Protobuf |
| 流式 | 不支持 | 支持（单向/双向） |
| 网关开销 | 序列化/反序列化 | 透传（低开销） |
| 健康检查 | HTTP 端点 | gRPC Health Protocol |

### Envoy gRPC 代理配置

```yaml
# Envoy 配置
static_resources:
  listeners:
    - name: listener_0
      address:
        socket_address:
          address: 0.0.0.0
          port_value: 8443
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                route_config:
                  virtual_hosts:
                    - name: backend
                      routes:
                        - match:
                            prefix: "/grpc.service/"
                          route:
                            cluster: grpc_backend
                            timeout: 0s
                            retry_policy:
                              retry_conditions:
                                - 5xx
                              num_retries: 3

  clusters:
    - name: grpc_backend
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      typed_extension_protocol_options:
        envoy.extensions.upstreams.http.v3.HttpProtocolOptions:
          "@type": type.googleapis.com/envoy.extensions.upstreams.http.v3.HttpProtocolOptions
          explicit_http_config:
            http2_protocol_options: {}
```

## 金丝雀发布

### 基于网关的流量分割

```mermaid
graph TD
    A[100% 流量] --> B{网关路由}
    B -->|90%| C[服务 v1 稳定版]
    B -->|10%| D[服务 v2 金丝雀版]
    D -->|监控指标正常| E[逐步增加 v2 流量]
    D -->|监控指标异常| F[自动回滚到 v1]
```

### 金丝雀发布策略配置

```yaml
# Kong 插件配置
plugins:
  - name: canary
    config:
      services:
        - service: user-service
          routes:
            - route: user-api
              canary:
                upstream: user-service-v2
                weight: 10          # 10% 流量到 v2
                start_time: 2024-01-01T00:00:00Z
                duration: 3600      # 持续 1 小时
                criteria:
                  - header: x-user-type
                    value: "beta"    # Beta 用户走 v2
                  - cookie: feature_flag
                    value: "new_ui"
```

### 金丝雀发布监控指标

| 指标 | 阈值（回滚条件） | 采集方式 |
|------|------------------|----------|
| 错误率 | > 1% | Access Log 统计 |
| P99 延迟 | > 基线 1.5x | Metrics 监控 |
| CPU 使用率 | > 80% | 节点 Exporter |
| 内存使用率 | > 85% | 节点 Exporter |
| 5xx 数量 | > 10/min | Access Log |

## 网关可观测性

### 三大支柱

```mermaid
graph TD
    A[网关可观测性] --> B[Metrics 指标]
    A --> C[Logging 日志]
    A --> D[Tracing 链路追踪]

    B --> B1[QPS / 延迟 / 错误率]
    B --> B2[连接数 / 上游健康度]
    B --> B3[限流触发次数]

    C --> C1[Access Log 结构化日志]
    C --> C2[Error Log]
    C --> C3[慢查询日志]

    D --> D1[OpenTelemetry 集成]
    D --> D2[Jaeger / Zipkin]
```

### Access Log 结构化格式

```json
{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "method": "POST",
  "path": "/api/orders",
  "status": 200,
  "upstream_status": 200,
  "upstream_service": "order-service",
  "upstream_time": 45,
  "gateway_time": 3,
  "bytes_sent": 1234,
  "request_id": "abc-123-def",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "user_id": "user-001",
  "client_ip": "192.168.1.100",
  "latency": 48
}
```

### Prometheus 指标配置

```yaml
# Envoy Stats 指标
metrics:
  - name: http_requests_total
    type: counter
    labels:
      method: "$method"
      path: "$path"
      status: "$status"
      upstream: "$upstream_cluster"

  - name: http_request_duration_seconds
    type: histogram
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5]
    labels:
      upstream: "$upstream_cluster"

# Grafana Dashboard 关键 Panel
# 1. 网关 QPS (按路由/状态码)
# 2. 延迟 P50/P95/P99 (按路由)
# 3. 错误率 (按路由/上游服务)
# 4. 上游连接数 / 活跃连接数
# 5. 限流触发次数
```

## 限流算法详解

### 固定窗口（Fixed Window）

```
时间窗口：[10:00:00, 10:00:01] 限流 100 QPS

10:00:00.000 → count=1   ✅
10:00:00.500 → count=50  ✅
10:00:00.999 → count=100 ✅
10:00:01.000 → count=1   ✅  （窗口重置）
...

问题：窗口边界突发——999ms 内 100 请求 + 001ms 内 100 请求 = 200 QPS 突发
```

### 滑动窗口（Sliding Window Log）

```
维护一个时间戳列表，每次请求：
  1. 移除窗口外的时间戳
  2. 检查窗口内时间戳数量
  3. 未超限 → 记录当前时间戳
  4. 超限 → 拒绝

优点：精确限流
缺点：内存开销大（需存储每个请求的时间戳）
实现：Redis ZSET (score=timestamp, member=unique_id)
```

### 令牌桶（Token Bucket）

```
配置：rate=100/s, capacity=200

10:00:00.000 → tokens=200（满桶）
10:00:00.000 → 请求 50 个 → tokens=150  ✅
10:00:00.500 → 桶补充 50 → tokens=200（满桶）
10:00:01.000 → 请求 250 个 → tokens=0（桶空）  ✅ 允许前 200 个
10:00:01.001 → 请求 1 个 → tokens=-1  ❌ 拒绝

特点：允许突发流量（burst），平均速率受 rate 控制
```

### 漏桶（Leaky Bucket）

```
配置：rate=100/s, capacity=200

输入：请求进入队列（桶）
输出：以固定速率（100/s）处理

10:00:00.000 → 队列空
10:00:00.000 → 突发 200 请求 → 队列满（200）
10:00:00.000 → 突发 50 请求 → 队列溢出  ❌ 拒绝 50 个
10:00:01.000 → 队列处理 100 → 剩余 100

特点：流量整形（平滑输出），不允许突发
```

### 算法对比

| 算法 | 精确度 | 突发允许 | 内存开销 | 实现复杂度 | 适用场景 |
|------|--------|----------|----------|------------|----------|
| 固定窗口 | 低 | 不允许 | 低 | 低 | 简单限流 |
| 滑动窗口 | 高 | 不允许 | 高 | 中 | 精确计数 |
| 令牌桶 | 中 | 允许（burst） | 低 | 中 | API 限流（推荐） |
| 漏桶 | 中 | 不允许 | 低 | 中 | 流量整形 |

### Redis 实现令牌桶

```lua
-- Lua 脚本：令牌桶限流
local key = KEYS[1]
local rate = tonumber(ARGV[1])        -- 令牌生成速率（个/秒）
local capacity = tonumber(ARGV[2])     -- 桶容量
local now = tonumber(ARGV[3])          -- 当前时间戳（ms）
local requested = tonumber(ARGV[4])    -- 请求的令牌数

local last_tokens = tonumber(redis.call("GET", key) or capacity)
local last_refreshed = tonumber(redis.call("GET", key .. ":ts") or now)

-- 计算补充的令牌
local delta = math.floor((now - last_refreshed) / 1000) * rate
local tokens = math.min(capacity, last_tokens + delta)

local allowed = 0
if tokens >= requested then
    tokens = tokens - requested
    allowed = 1
end

redis.call("SET", key, tokens)
redis.call("SET", key .. ":ts", now)
redis.call("EXPIRE", key, math.ceil(capacity / rate) * 2)

return { allowed, tokens }
```

## 网关迁移策略

### 从单体到网关 + 微服务

```mermaid
graph TD
    A[阶段 1: 单体应用] --> B[引入网关作为唯一入口]
    B --> C[阶段 2: 网关 + 单体]
    C --> D[逐步拆分微服务]
    D --> E[阶段 3: 网关 + 多微服务]
    E --> F[完全微服务化]
```

### 迁移步骤

| 阶段 | 操作 | 风险 | 回滚方案 |
|------|------|------|----------|
| 1 | 网关部署，直连单体 | 低 | DNS 切回原地址 |
| 2 | 认证逻辑迁移到网关 | 中 | 网关透传原认证 |
| 3 | 拆分第一个微服务 | 高 | 网关回退到单体 |
| 4 | 逐步迁移其他服务 | 中 | 灰度发布 + 监控 |

### 流量切换策略

```
DNS 切换法：
  1. 网关部署，验证健康
  2. DNS TTL 调低（60s）
  3. 切换 DNS 到网关 IP
  4. 监控 30 分钟
  5. 异常则 DNS 切回

负载均衡切换法：
  1. 网关加入 LB 池，权重设为 0
  2. 逐步增加权重：0 → 10 → 50 → 100
  3. 每步观察 15 分钟
  4. 有问题则降低权重
```

## 网关安全防护

### DDoS 防护

```
多层 DDoS 防护：
  ├── 第 1 层：云厂商 DDoS 防护（如 AWS Shield）
  │   └── 网络层攻击过滤（SYN Flood, UDP Flood）
  ├── 第 2 层：WAF（如 AWS WAF, CloudFlare）
  │   └── 应用层攻击检测（SQL 注入, XSS）
  ├── 第 3 层：网关限流
  │   └── 按 IP/User/App 维度限流
  └── 第 4 层：后端限流 + 熔断
      └── 保护后端服务不被打垮
```

### IP 白名单 / 黑名单

```yaml
# APISIX 配置
plugins:
  - name: ip-restriction
    config:
      whitelist:
        - "10.0.0.0/8"       # 内网
        - "203.0.113.0/24"   # 办公网
      message: "Access denied"
      status_code: 403

  - name: consumer-restriction
    config:
      whitelist:
        - consumer-1          # 允许特定消费者
      rejected_code: 403
```

### Bot 检测

```
Bot 检测策略：
  ├── User-Agent 分析
  │   ├── 空/异常 UA → 拦截
  │   ├── 已知恶意 Bot UA → 拦截
  │   └── 合法 Bot（Googlebot）→ 放行但限流
  ├── 行为分析
  │   ├── 高频相同路径请求 → 限流
  │   ├── 无 JavaScript 执行环境 → 拦截
  │   └── 点击轨迹异常 → 验证码
  ├── JavaScript Challenge
  │   └── 要求客户端执行 JS 获取 token
  └── CAPTCHA 验证
      └── 疑似 Bot 时触发验证码
```

### 安全 Headers 配置

```yaml
# 网关统一注入安全 Headers
plugins:
  - name: response-rewrite
    config:
      headers:
        add:
          - "X-Content-Type-Options: nosniff"
          - "X-Frame-Options: DENY"
          - "X-XSS-Protection: 1; mode=block"
          - "Strict-Transport-Security: max-age=31536000; includeSubDomains"
          - "Content-Security-Policy: default-src 'self'"
          - "Referrer-Policy: strict-origin-when-cross-origin"
          - "Permissions-Policy: camera=(), microphone=(), geolocation=()"
        remove:
          - "Server"
          - "X-Powered-By"
```

## 与其他板块的关系

| 关联板块 | 关系描述 |
|----------|----------|
| **负载均衡** | 网关通常部署在负载均衡器之后，自身也做后端负载均衡 |
| **微服务架构** | 网关是微服务架构的标配组件 |
| **认证授权** | 网关是 OAuth2/JWT 认证的常见实施点 |
| **Service Mesh** | Envoy 既是 API 网关也是 Mesh 的数据面 |
| **监控体系** | 网关是 Metrics/Logging/Tracing 的关键采集点 |

## 一句话总结

API 网关是微服务的统一入口和流量管控层，将路由、认证、限流、熔断等横切关注点集中管理，是微服务架构中不可或缺的基础设施。

---

## 参考资料

- [Kong 官方文档](https://docs.konghq.com/)
- [Apache APISIX 文档](https://apisix.apache.org/docs/)
- [Spring Cloud Gateway 文档](https://spring.io/projects/spring-cloud-gateway)
- [Envoy 网关文档](https://www.envoyproxy.io/docs/envoy/latest/)
- [Microservices Patterns - API Gateway](https://microservices.io/patterns/apigateway.html)
