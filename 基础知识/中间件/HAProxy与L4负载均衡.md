# HAProxy 与四层负载均衡（L4 LB / LVS / Keepalived）

> HAProxy 是**业界最强大的开源负载均衡器**：L4（TCP 层）性能顶级、L7（HTTP 层）规则丰富、单实例可达百万并发。它与 LVS（Linux 内核级四层负载）、Keepalived（VIP 高可用）组成「入口高可用四件套」。相比 Nginx（L7 为主）、Envoy（云原生），HAProxy 以「**L4 性能 + 会话保持 + 健康检查 + 无业务逻辑**」成为大型系统第一道入口的事实标准。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 单点故障 | 应用服务器单机，挂了服务就不可用 |
| 高并发入口 | 百万连接需要内核级转发而非应用层转发 |
| 会话保持 | 购物车/登录态需要同一用户固定到同一后端 |
| 健康检查 | 后端实例挂了要自动剔除、恢复自动加入 |
| 分层负载 | L4（IP/端口）+ L7（URL/Host）分层治理 |

> 核心认知：**负载均衡 = 前端（VIP + LB 集群）+ 后端（RS 实例池）**——LB 对外一个虚拟 IP，把流量按策略分发到后端，后端增减对客户端透明。

---

## 二、核心原理

### 2.1 部署架构（三层入口模型）

```
公网 DNS → LVS（DR 模式，内核转发，扛最大流量）
              → HAProxy 集群（VIP + Keepalived，L4/L7 治理）
                  → Nginx/应用集群（L7 路由/静态/业务）
                      → 服务实例（应用/缓存/DB 前）
```

- **LVS 在最前**：纯内核态（vs 用户态），单机千万级 PPS，专门扛流量洪峰；
- **HAProxy 中层**：负责健康检查、会话保持、L7 规则、限流；
- **Nginx 靠后**：静态资源、L7 复杂路由、业务。

### 2.2 HAProxy 工作模式

| 模式 | 说明 | 场景 |
|------|------|------|
| TCP（L4） | 按 IP:Port 转发，不解包应用层 | 数据库/Redis/MQ 前 |
| HTTP（L7） | 解析 URL/Host/Cookie，规则路由 | Web 服务前 |

**选型关注点**：纯性能优先 → TCP 模式；需要 URL 路由/会话保持 → HTTP 模式。

### 2.3 调度算法

| 算法 | 说明 | 适用场景 |
|------|------|----------|
| roundrobin | 轮询（默认，平滑加权） | 通用 |
| leastconn | 最少连接 | 长连接（WebSocket/DB） |
| source | 源 IP 哈希（会话保持） | 无 Cookie 场景 |
| uri | 按 URL 哈希 | 缓存命中优化 |
| hdr | 按 Header 哈希 | 按用户维度路由 |
| first | 按服务器顺序填满 | 资源密集型 |

### 2.4 会话保持（Sticky Session）

| 方式 | 说明 |
|------|------|
| Cookie（appsession） | HAProxy 注入/改写 Cookie 绑定后端 |
| Source IP | 同一源 IP 哈希到同一后端 |
| 一致性哈希 | 后端增减只影响部分会话 |

**选型关注点**：会话保持与负载均衡是矛盾的——除非业务有状态（Session/本地缓存），否则优先无状态化 + 去掉粘滞（可水平扩展）。

### 2.5 健康检查

```
主动检查：TCP connect / HTTP GET 指定路径 / Redis/MQ 协议检查
被动检查：连续 N 次失败 → 标记 DOWN（剔除），恢复阈值后重新加入
  ├── rise/fall 参数（连续成功/失败次数）
  ├── interval（检查间隔）
  └── 慢启动（weight 逐步恢复，防雪崩）
```

### 2.6 LVS 三种模式

| 模式 | 原理 | 特点 |
|------|------|------|
| NAT | LB 改目的地址转发 | 回包也过 LB（瓶颈） |
| DR（直接路由） | LB 改 MAC 转发，后端直回答复客户端 | 回包不经过 LB，性能最高（最常用） |
| TUN（隧道） | IP 封装转发 | 跨网段，复杂 |

**选型关注点**：同机房大流量 → **DR 模式**（回包直答，LB 无瓶颈）；跨网段 → TUN；小规模 → NAT。

### 2.7 Keepalived（VIP 高可用）

```
两台 HAProxy + 一个 VIP
  ├── Master 持有 VIP，VRRP 心跳宣告
  ├── 备份节点监听心跳，Master 故障 → 秒级抢 VIP
  └── 配合脚本检查 HAProxy 进程/健康，异常自动切换
```

**选型关注点**：Keepalived 是「VIP 漂移」标准方案——客户端永远访问 VIP，LB 节点故障对客户端透明。

---

## 三、核心特性

| 特性 | 说明 |
|------|------|
| 性能 | 单实例百万并发连接（C 语言，无业务逻辑） |
| 双栈 | L4/L7 双模式，协议级健康检查（HTTP/Redis/MySQL...） |
| 会话保持 | Cookie/Source/一致性哈希 |
| 限流 | 连接数/速率限制（防 CC） |
| 访问控制 | ACL + 规则（IP 白名单/路径） |
| 可观测 | 内置 stats 页 + Prometheus exporter |
| 优雅排空 | 平滑摘除后端（drain 模式） |
| 无单点 | Keepalived + VIP 或官方 Keepalived 模式 |

---

## 四、HAProxy vs LVS vs Nginx vs Envoy

| 维度 | HAProxy | LVS | Nginx | Envoy |
|------|---------|-----|-------|-------|
| 层级 | L4+L7 | L4（内核） | L7 | L4+L7 |
| 性能 | 极高 | 最高（内核态） | 高 | 高 |
| 配置 | 文本（专业） | ipvsadm | 文本 | xDS/文件 |
| 会话保持 | 强 | 哈希 | 强（upstream） | 一致性哈希 |
| 健康检查 | 协议级 | 弱（需脚本） | HTTP 级 | 主动+被动 |
| 动态配置 | reload（近秒级） | 命令行 | reload | 实时（xDS） |
| 云原生 | 弱 | 弱 | 中 | 强 |
| 适用 | 入口 L4/L7 | 超大流量 L4 | 静态/L7 路由 | 服务网格 |

**选型关注点**：
- 第一道入口/超大流量 → **LVS（DR）+ HAProxy**；
- Web 层 L7 路由/静态 → **Nginx**；
- 服务网格/微服务动态治理 → **Envoy**；
- 云上托管 → 云 LB（ALB/NLB，见「云网络」篇）。

---

## 五、生产实践

### 5.1 关键配置

| 配置 | 建议 |
|------|------|
| mode | 数据库/Redis 前用 TCP，Web 用 HTTP |
| maxconn | 默认 4096 需调大（ulimit 同步调） |
| 超时 | `timeout connect 5s / client 30s / server 30s`（必须显式配置） |
| 健康检查 | `option httpchk GET /healthz` + `inter 5s rise 2 fall 3` |
| 慢启动 | `slowstart 60s`（后端恢复时逐步加权重） |
| 粘滞 | 无状态业务建议关闭（保证水平扩展） |

### 5.2 常见坑

- **超时未配置**：默认无限等待，后端挂起会拖死连接池；
- **keepalived 脑裂**：VIP 两端同时持有 → 用脚本 + 仲裁（如 ping 网关/检查对方存活）规避；
- **LVS DR 模式要求**：后端需抑制 ARP（`arp_ignore=1 arp_announce=2`），否则回包直接走网卡导致漂移；
- **日志**：生产必须开 `option httplog`（排障第一手段）。

---

## 六、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 超大流量入口 | LVS（DR）+ Keepalived | HAProxy |
| 通用 L4/L7 负载 | HAProxy | Nginx |
| Web 静态/L7 路由 | Nginx | HAProxy |
| 服务网格 | Envoy | — |
| 云上 | 云 LB（NLB/ALB） | HAProxy on VM |
| 数据库/Redis 前 | HAProxy（TCP） | — |

---

## 十二、HAProxy 健康检查深入

### 12.1 健康检查方法详解

| 检查类型 | 方式 | 说明 |
|---------|------|------|
| TCP 检查 | `check` | 三次握手成功即存活 |
| HTTP 检查 | `option httpchk` | GET 指定路径 + 期望状态码 |
| SSL 检查 | `option ssl-hello-chk` | SSL 握手成功 |
| Redis 检查 | `option redis-check` | PING 命令 |
| MySQL 检查 | `option mysql-check` | MySQL 协议握手 |
| SMTP 检查 | `option smtpchk` | SMTP EHLO |

### 12.2 健康检查参数调优

```ini
backend web_servers
    option httpchk GET /healthz
    http-check expect status 200

    server web1 10.0.0.1:8080 check inter 5s rise 3 fall 2 slowstart 60s
    server web2 10.0.0.2:8080 check inter 5s rise 3 fall 2 slowstart 60s
    server web3 10.0.0.3:8080 check inter 5s rise 3 fall 2 slowstart 60s backup

# 参数说明：
# inter: 检查间隔（默认 2s）
# rise: 连续成功次数标记为 UP
# fall: 连续失败次数标记为 DOWN
# slowstart: 恢复后权重逐步提升时间
# backup: 备用服务器（主服务器全 DOWN 时启用）
```

### 12.3 高级健康检查

```ini
# HTTP 多路径检查
backend api_servers
    option httpchk
    http-check connect
    http-check send meth GET uri /health ver HTTP/1.1 hdr Host api.example.com
    http-check expect status 200

    server api1 10.0.0.1:8080 check
    server api2 10.0.0.2:8080 check

# TCP 检查自定义字符串
backend db_servers
    option tcp-check
    tcp-check connect
    tcp-check send PING\r\n
    tcp-check expect string +PONG

    server db1 10.0.0.1:6379 check
```

---

## 十三、HAProxy Stick Tables（会话保持）

### 13.1 Stick Table 原理

```
Stick Table = 进程内共享的键值存储
  用于：会话保持、速率限制、连接计数
  存储位置：内存（可选复制到其他节点）

键类型：
  ip（源 IP）/ integer（自定义）/ string（自定义）

值类型：
  conn（当前连接数）
  rate（速率）
  sess（会话数）
  bytes_in/out（流量）
  gpc0/gpc1（计数器）
  server_id（绑定服务器）
```

### 13.2 Stick Table 配置示例

```ini
# 基于源 IP 的会话保持（5 分钟超时）
frontend http-in
    stick-table type ip size 200k expire 30m
    stick on src
    default_backend servers

backend servers
    balance roundrobin
    server s1 10.0.0.1:8080 check
    server s2 10.0.0.2:8080 check

# 基于 Cookie 的会话保持
frontend http-in
    cookie SRVID insert indirect nocache

backend servers
    cookie SRVID insert indirect nocache
    server s1 10.0.0.1:8080 check cookie s1
    server s2 10.0.0.2:8080 check cookie s2
```

### 13.3 Stick Table 速率限制

```ini
# 限速：每秒最多 50 请求
frontend http-in
    stick-table type ip size 100k expire 30s store http_req_rate(10s)
    stick on src
    http-request deny deny_status 429 if { http_req_rate(10s) gt 50 }

# 连接数限制
frontend http-in
    stick-table type ip size 100k expire 1m store conn_cur
    stick on src
    http-request deny deny_status 429 if { conn_cur gt 100 }
```

### 13.4 多节点 Stick Table 复制

```ini
# 节点间同步 stick table
peers mycluster
    peer h1 10.0.0.1:10000
    peer h2 10.0.0.2:10000

frontend http-in
    stick-table type ip size 200k expire 30m peers mycluster
    stick on src
```

---

## 十四、HAProxy ACL 规则

### 14.1 ACL 基础语法

```
acl <名称> <条件> [<值>]

条件类型：
  path_beg /path     路径前缀
  path_end /path     路径后缀
  path_beg -i /path  路径前缀（忽略大小写）
  hdr(Header)        请求头
  src IP/mask        源 IP
  dst IP/mask        目标 IP
  port 端口
  method GET/POST    HTTP 方法
  ssl_fc             SSL 连接
  req_ssl_sni        SNI 域名
```

### 14.2 ACL 路由示例

```ini
frontend http-in
    bind *:80
    bind *:443 ssl crt /etc/haproxy/certs/

    # 基于路径路由
    acl is_api path_beg /api/
    acl is_static path_end .css .js .png .jpg
    acl is_websocket hdr(Upgrade) -i WebSocket

    # 基于域名路由
    acl is_api_host hdr(Host) -i api.example.com
    acl is_web_host hdr(Host) -i www.example.com

    # 基于 IP 白名单
    acl is_internal src 10.0.0.0/8

    # 路由规则
    use_backend api_servers if is_api or is_api_host
    use_backend static_servers if is_static
    use_backend ws_servers if is_websocket
    use_backend admin_servers if is_internal
    default_backend web_servers
```

### 14.3 ACL 访问控制

```ini
# IP 黑白名单
frontend http-in
    acl blocked_ips src -f /etc/haproxy/blocked_ips.txt
    http-request deny if blocked_ips

# 基于 User-Agent 封禁爬虫
    acl is_bot hdr_sub(User-Agent) -i bot crawler spider
    http-request deny if is_bot

# 基于速率限制（配合 stick-table）
    stick-table type ip size 100k expire 30s store http_req_rate(10s)
    stick on src
    http-request deny deny_status 429 if { http_req_rate(10s) gt 100 }
```

---

## 十五、HAProxy TCP vs HTTP 模式深入

### 15.1 TCP 模式（L4）

```ini
# TCP 模式：数据库负载均衡
listen mysql-cluster
    mode tcp
    bind *:3306
    option mysql-check user haproxy
    balance roundrobin
    server db1 10.0.0.1:3306 check
    server db2 10.0.0.2:3306 check

# TCP 模式：Redis 集群
listen redis-cluster
    mode tcp
    bind *:6379
    option tcp-check
    tcp-check send PING\r\n
    tcp-check expect string +PONG
    balance leastconn
    server redis1 10.0.0.1:6379 check
    server redis2 10.0.0.2:6379 check
```

### 15.2 HTTP 模式（L7）

```ini
# HTTP 模式：Web 应用
frontend web-in
    mode http
    bind *:80
    bind *:443 ssl crt /etc/haproxy/certs/

    # HTTP 层解析
    option httplog
    option forwardfor
    option http-server-close

    # 路由规则
    acl is_ssl ssl_fc
    http-request redirect scheme https unless is_ssl
    default_backend web_servers
```

### 15.3 选型对比

| 维度 | TCP 模式 | HTTP 模式 |
|------|---------|----------|
| 层级 | L4（IP:Port） | L7（URL/Host/Cookie） |
| 性能 | 极高（不解包） | 高（需解析 HTTP） |
| 路由能力 | 无 | URL/Header/Cookie 路由 |
| 健康检查 | TCP 握手 | HTTP 状态码 |
| 会话保持 | Source IP | Cookie/Header |
| 适用场景 | 数据库/Redis/MQ | Web 应用/API 网关 |

---

## 十六、HAProxy in Kubernetes（haproxy-ingress）

### 16.1 架构模型

```
K8s 集群：
  Service (NodePort/LoadBalancer)
    → HAProxy Ingress Controller（Pod）
      → 解析 Ingress 规则
      → 路由到后端 Service Pod

HAProxy Ingress Controller：
  监听 Ingress 资源变更
  动态更新 HAProxy 配置
  支持 ConfigMap 自定义
```

### 16.2 Ingress 配置示例

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-ingress
  annotations:
    haproxy.org/ssl-redirect: "true"
    haproxy.org/check: "true"
    haproxy.org/check-interval: "5s"
    haproxy.org/sticky-table: "type=ip size=200k expire=30m"
spec:
  ingressClassName: haproxy
  tls:
  - hosts:
    - app.example.com
    secretName: app-tls
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /api/
        pathType: Prefix
        backend:
          service:
            name: api-service
            port:
              number: 8080
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-service
            port:
              number: 80
```

### 16.3 haproxy-ingress vs nginx-ingress

| 维度 | haproxy-ingress | nginx-ingress |
|------|-----------------|---------------|
| L4 性能 | 极高 | 高 |
| L7 功能 | 丰富 | 丰富 |
| 会话保持 | Stick Table | Cookie |
| 动态配置 | 近实时 | reload |
| 社区活跃度 | 中 | 高 |
| 生态 | 较少 | 丰富 |

---

## 十七、HAProxy vs Nginx vs Envoy 综合对比

| 维度 | HAProxy | Nginx | Envoy |
|------|---------|-------|-------|
| 内存占用 | 低（单进程） | 低 | 中（多线程） |
| 连接处理 | 单事件驱动 | 单事件驱动 | 多线程 |
| 配置热更新 | reload（近秒级） | reload（秒级） | 实时（xDS） |
| 健康检查 | 协议级（丰富） | HTTP 级 | 主动+被动 |
| 限流 | Stick Table | limit_req | 令牌桶 |
| 负载均衡 | 轮询/最少连接/哈希 | 轮询/哈希/最少连接 | 一致性哈希/轮询 |
| WebSocket | 支持 | 支持 | 支持 |
| gRPC | TCP 模式透传 | 需 HTTP/2 | 原生支持 |
| 服务发现 | DNS | DNS | xDS（丰富） |
| 可观测性 | Stats + Exporter | 日志 | Prometheus + 追踪 |
| 学习曲线 | 陡峭（专业） | 中等 | 中等 |
| 最佳场景 | L4 入口/数据库 | Web/静态/L7 | 服务网格/微服务 |

---

## 十八、HAProxy with Prometheus 监控

### 18.1 启用 Prometheus Exporter

```ini
# haproxy.cfg
global
    stats socket /var/run/haproxy.sock mode 660 level admin

# 或使用 haproxy_exporter
# 启动：haproxy_exporter --haproxy.scrape-uri=http://haproxy:8404/stats
```

### 18.2 关键监控指标

| 指标 | 说明 | 告警建议 |
|------|------|---------|
| haproxy_backend_active_servers | 活跃后端数 | < 期望值 |
| haproxy_backend_current_sessions | 当前会话数 | > 80% maxconn |
| haproxy_backend_http_responses_total | HTTP 响应计数 | 5xx 突增 |
| haproxy_backend_response_time_seconds | 后端响应时间 | P99 > 1s |
| haproxy_frontend_current_sessions | 前端会话数 | > 80% maxconn |
| haproxy_server_bytes_in_total | 入站流量 | 突增 |

### 18.3 Grafana Dashboard 配置

```
面板规划：
┌──────────────────────────────────────┐
│  连接数趋势  │  QPS  │  错误率  │
├──────────────────────────────────────┤
│  后端健康    │  响应时间 P99  │  队列长度 │
├──────────────────────────────────────┤
│  每秒会话率  │  拒绝连接数    │  后端状态 │
└──────────────────────────────────────┘
```

---

## 十九、HAProxy SSL 终止

### 19.1 SSL 终止配置

```ini
frontend https-in
    bind *:443 ssl crt /etc/haproxy/certs/example.pem
    mode http

    # HTTP 到 HTTPS 重定向
    http-request redirect scheme https unless { ssl_fc }

    # SSL 参数
    ssl-default-bind-ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256
    ssl-default-bind-options ssl-min-ver TLSv1.2 no-tls-tickets
    tune.ssl.default-dh-param 2048

    default_backend servers
```

### 19.2 SSL 透传（Pass-through）

```ini
# SSL 透传：不解密直接转发
frontend tcp-in
    mode tcp
    bind *:443
    option tcplog
    tcp-request inspect-delay 5s
    tcp-request content accept if { req_ssl_hello_type 1 }

    # 基于 SNI 路由
    use_backend api_servers if { req_ssl_sni -i api.example.com }
    default_backend web_servers
```

### 19.3 双向 TLS（mTLS）

```ini
frontend mtls-in
    bind *:443 ssl crt /etc/haproxy/server.pem ca-file /etc/haproxy/ca.crt verify required
    mode http

    # 将客户端证书信息传递给后端
    http-request set-header X-Client-Cert-CN %[ssl_fc_s_dn CN]

    default_backend servers
```

### 19.4 SSL Session 复用

```ini
global
    # SSL Session 缓存（减少 TLS 握手开销）
    tune.ssl.cachesize 20000
    tune.ssl.lifetime 300

    # SSL Session Ticket（跨节点复用）
    ssl-default-bind-options force-tlsv12
```

---

## 七、HAProxy 健康检查方式对比

### 7.1 检查类型详解

| 检查类型 | 方式 | 配置示例 | 适用场景 |
|---------|------|---------|---------|
| TCP 检查 | `check` | `server s1 10.0.0.1:80 check` | 通用（端口可达即存活） |
| HTTP 检查 | `option httpchk` | `option httpchk GET /healthz` | Web 服务（需返回 200） |
| Agent 检查 | `agent-check` | `agent-send "health\n"` | 自定义健康逻辑（如检查磁盘） |
| SSL 检查 | `option ssl-hello-chk` | `option ssl-hello-chk` | HTTPS 服务 |
| MySQL 检查 | `option mysql-check` | `option mysql-check user haproxy` | MySQL 从库 |
| Redis 检查 | `option redis-check` | `option redis-check` | Redis（PING 命令） |

### 7.2 检查参数调优

```ini
backend web_servers
    option httpchk GET /healthz
    http-check expect status 200

    # inter: 检查间隔（默认 2s）
    # rise: 连续成功次数标记为 UP（默认 2）
    # fall: 连续失败次数标记为 DOWN（默认 3）
    # slowstart: 恢复后权重逐步提升时间（防雪崩）
    server web1 10.0.0.1:8080 check inter 5s rise 3 fall 2 slowstart 60s
    server web2 10.0.0.2:8080 check inter 5s rise 3 fall 2 slowstart 60s
    server web3 10.0.0.3:8080 check backup  # 备用服务器
```

### 7.3 高级 HTTP 检查

```ini
# 多路径检查
backend api_servers
    option httpchk
    http-check connect
    http-check send meth GET uri /health ver HTTP/1.1 hdr Host api.example.com
    http-check expect status 200

    server api1 10.0.0.1:8080 check
    server api2 10.0.0.2:8080 check

# TCP 检查自定义字符串（如 Redis）
backend db_servers
    option tcp-check
    tcp-check connect
    tcp-check send PING\r\n
    tcp-check expect string +PONG
    server db1 10.0.0.1:6379 check
```

## 八、Stick Table 会话保持原理与配置

### 8.1 Stick Table 原理

```
Stick Table = 进程内共享的键值存储
  用途：会话保持、速率限制、连接计数
  存储位置：内存（可选复制到其他节点）

键类型：
  ip（源 IP）/ integer（自定义）/ string（自定义）

值类型：
  conn（当前连接数）
  rate（速率）
  sess（会话数）
  bytes_in/out（流量）
  server_id（绑定服务器）
```

### 8.2 会话保持配置

```ini
# 基于源 IP 的会话保持（30 分钟超时）
frontend http-in
    stick-table type ip size 200k expire 30m
    stick on src
    default_backend servers

# 基于 Cookie 的会话保持（更精确）
frontend http-in
    cookie SRVID insert indirect nocache

backend servers
    cookie SRVID insert indirect nocache
    server s1 10.0.0.1:8080 check cookie s1
    server s2 10.0.0.2:8080 check cookie s2
```

### 8.3 Stick Table 速率限制

```ini
# 限速：每秒最多 50 请求
frontend http-in
    stick-table type ip size 100k expire 30s store http_req_rate(10s)
    stick on src
    http-request deny deny_status 429 if { http_req_rate(10s) gt 50 }

# 连接数限制
frontend http-in
    stick-table type ip size 100k expire 1m store conn_cur
    stick on src
    http-request deny deny_status 429 if { conn_cur gt 100 }
```

### 8.4 多节点 Stick Table 复制

```ini
# 节点间同步 stick table（保持会话粘性跨节点一致）
peers mycluster
    peer h1 10.0.0.1:10000
    peer h2 10.0.0.2:10000

frontend http-in
    stick-table type ip size 200k expire 30m peers mycluster
    stick on src
```

## 九、ACL 规则编写实战

### 9.1 ACL 条件类型

```
acl <名称> <条件> [<值>]

路径条件：
  path_beg /path     路径前缀
  path_end /path     路径后缀
  path_beg -i /path  路径前缀（忽略大小写）
  path_reg ^/api/.*  路径正则

Header 条件：
  hdr(Host)          请求 Host 头
  hdr(Upgrade)       升级头（WebSocket）
  hdr_sub(User-Agent) User-Agent 子串

IP 条件：
  src IP/mask        源 IP
  dst IP/mask        目标 IP

其他：
  method GET/POST    HTTP 方法
  ssl_fc             SSL 连接
  req_ssl_sni        SNI 域名
```

### 9.2 ACL 路由示例

```ini
frontend http-in
    bind *:80
    bind *:443 ssl crt /etc/haproxy/certs/

    # 基于路径路由
    acl is_api path_beg /api/
    acl is_static path_end .css .js .png .jpg
    acl is_websocket hdr(Upgrade) -i WebSocket

    # 基于域名路由
    acl is_api_host hdr(Host) -i api.example.com
    acl is_web_host hdr(Host) -i www.example.com

    # 基于 IP 白名单
    acl is_internal src 10.0.0.0/8

    # 路由规则
    use_backend api_servers if is_api or is_api_host
    use_backend static_servers if is_static
    use_backend ws_servers if is_websocket
    use_backend admin_servers if is_internal
    default_backend web_servers
```

### 9.3 ACL 访问控制

```ini
# IP 黑白名单
frontend http-in
    acl blocked_ips src -f /etc/haproxy/blocked_ips.txt
    http-request deny if blocked_ips

# 封禁爬虫
    acl is_bot hdr_sub(User-Agent) -i bot crawler spider
    http-request deny if is_bot

# 基于速率限制（配合 stick-table）
    stick-table type ip size 100k expire 30s store http_req_rate(10s)
    stick on src
    http-request deny deny_status 429 if { http_req_rate(10s) gt 100 }
```

## 十、HAProxy 在 K8s 中作为 Ingress

### 10.1 架构模型

```
K8s 集群：
  Service (NodePort/LoadBalancer)
    → HAProxy Ingress Controller（Pod）
      → 解析 Ingress 规则
      → 路由到后端 Service Pod

HAProxy Ingress Controller：
  监听 Ingress 资源变更
  动态更新 HAProxy 配置（近实时）
  支持 ConfigMap 自定义
```

### 10.2 Ingress 配置示例

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-ingress
  annotations:
    haproxy.org/ssl-redirect: "true"
    haproxy.org/check: "true"
    haproxy.org/check-interval: "5s"
    haproxy.org/sticky-table: "type=ip size=200k expire=30m"
spec:
  ingressClassName: haproxy
  tls:
  - hosts:
    - app.example.com
    secretName: app-tls
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /api/
        pathType: Prefix
        backend:
          service:
            name: api-service
            port:
              number: 8080
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-service
            port:
              number: 80
```

## 十一、HAProxy vs Nginx vs Envoy 性能对比

| 维度 | HAProxy | Nginx | Envoy |
|------|---------|-------|-------|
| L4 连接处理 | 极高（单事件驱动） | 高 | 高（多线程） |
| L7 吞吐 | 高 | 高 | 高 |
| 内存占用 | 低（单进程） | 低 | 中 |
| 配置热更新 | reload（近秒级） | reload（秒级） | 实时（xDS） |
| 会话保持 | Stick Table | Cookie/upstream | 一致性哈希 |
| 限流 | Stick Table | limit_req | 令牌桶 |
| WebSocket | 支持 | 支持 | 支持 |
| gRPC | TCP 模式透传 | 需 HTTP/2 | 原生支持 |
| 服务发现 | DNS | DNS | xDS（丰富） |
| 可观测性 | Stats + Exporter | 日志 | Prometheus + 追踪 |
| 学习曲线 | 陡峭 | 中等 | 中等 |
| 最佳场景 | L4 入口/数据库 | Web/静态/L7 | 服务网格/微服务 |

## 十二、HAProxy Prometheus 指标关键项

| 指标 | 说明 | 告警建议 |
|------|------|---------|
| `haproxy_backend_active_servers` | 活跃后端数 | < 期望值 |
| `haproxy_backend_current_sessions` | 当前会话数 | > 80% maxconn |
| `haproxy_backend_http_responses_total` | HTTP 响应计数 | 5xx 突增 |
| `haproxy_backend_response_time_seconds` | 后端响应时间 | P99 > 1s |
| `haproxy_frontend_current_sessions` | 前端会话数 | > 80% maxconn |
| `haproxy_server_bytes_in_total` | 入站流量 | 突增 |
| `haproxy_backend_http_requests_total` | HTTP 请求总数 | — |
| `haproxy_server_status` | 后端状态（1=UP） | 0 |

```ini
# 启用 Prometheus 指标暴露
frontend stats
    bind *:8404
    stats enable
    stats uri /metrics
    stats refresh 10s
```

## 十三、与其他板块的关系

- Envoy 对比见「[Envoy 服务代理](./Envoy服务代理.md)」；
- Nginx 原理见「[Nginx](./Nginx.md)」；
- 网关选型见「[API 网关](./API网关.md)」；
- 云上负载均衡（NLB/ALB/CLB）见「[云网络与流量接入体系](./云网络与流量接入体系.md)」。

---

## 八、HAProxy 生产配置清单

### 8.1 haproxy.cfg 关键配置

```ini
global
    maxconn 50000
    log /dev/log local0
    stats socket /var/run/haproxy.sock mode 660 level admin

defaults
    mode http
    timeout connect 5s
    timeout client 30s
    timeout server 30s
    option httplog
    option dontlognull
    option http-server-close
    option forwardfor

frontend http-in
    bind *:80
    bind *:443 ssl crt /etc/haproxy/certs/
    redirect scheme https if !{ ssl_fc }
    default_backend servers

backend servers
    balance roundrobin
    option httpchk GET /healthz
    server server1 192.168.1.10:8080 check inter 5s rise 2 fall 3
    server server2 192.168.1.11:8080 check inter 5s rise 2 fall 3
```

### 8.2 监控指标

```
HAProxy 关键指标：
  当前连接数（current）
  最大连接数（maxconn）
  会话率（sessions/sec）
  后端健康状态（backend status）
  队列长度（queue）
  拒绝连接数（denied）
  错误响应数（errors）
```

### 8.3 LVS + Keepalived 配置

```bash
# LVS DR 模式配置
ipvsadm -A -t 192.168.1.100:80 -s rr
ipvsadm -a -t 192.168.1.100:80 -r 192.168.1.11:80 -g
ipvsadm -a -t 192.168.1.100:80 -r 192.168.1.12:80 -g

# Keepalived 配置
vrrp_script check_haproxy {
    script "/usr/bin/killall -0 haproxy"
    interval 2
    weight -20
}

vrrp_instance VI_1 {
    state MASTER
    interface eth0
    virtual_router_id 51
    priority 100
    advert_int 1
    virtual_ipaddress {
        192.168.1.100/24
    }
    track_script {
        check_haproxy
    }
}
```

### 8.4 常见问题排查

| 问题 | 原因 | 解决 |
|------|------|------|
| 连接数满 | maxconn 太小 | 调大 maxconn + ulimit |
| 后端超时 | 服务器响应慢 | 调整 timeout server |
| VIP 漂移 | 脑裂 | 检查 VRRP 优先级/仲裁 |
| 502 错误 | 后端不可达 | 检查健康检查配置 |

---

## 九、负载均衡选型决策树

```
需要负载均衡？
  ├── 超大流量入口 → LVS（DR）+ Keepalived
  ├── 通用 L4/L7 → HAProxy
  ├── Web 静态/L7 → Nginx
  ├── 服务网格 → Envoy
  └── 云上托管 → NLB/ALB/CLB
```

---

## 十、LVS + HAProxy + Keepalived 完整配置

### 10.1 LVS DR 模式配置脚本

```bash
#!/bin/bash
# LVS DR 模式配置
VIP=192.168.1.100
RIP1=192.168.1.11
RIP2=192.168.1.12

# 配置虚拟网卡
ifconfig eth0:0 $VIP broadcast $VIP netmask 255.255.255.255 up
route add -host $VIP dev eth0:0

# 配置 LVS
ipvsadm -C
ipvsadm -A -t $VIP:80 -s rr
ipvsadm -a -t $VIP:80 -r $RIP1:80 -g
ipvsadm -a -t $VIP:80 -r $RIP2:80 -g
```

### 10.2 Keepalived 完整配置

```ini
global_defs {
    router_id LVS_MASTER
}

vrrp_instance VI_1 {
    state MASTER
    interface eth0
    virtual_router_id 51
    priority 100
    advert_int 1
    authentication {
        auth_type PASS
        auth_pass 1234
    }
    virtual_ipaddress {
        192.168.1.100/24
    }
    track_script {
        check_haproxy
    }
}

vrrp_script check_haproxy {
    script "/usr/bin/killall -0 haproxy"
    interval 2
    weight -20
}
```

### 10.3 后端 ARP 抑制配置

```bash
# 在 RS（Real Server）上执行
echo 1 > /proc/sys/net/ipv4/conf/lo/arp_ignore
echo 2 > /proc/sys/net/ipv4/conf/lo/arp_announce
echo 1 > /proc/sys/net/ipv4/conf/all/arp_ignore
echo 2 > /proc/sys/net/ipv4/conf/all/arp_announce
```

---

## 十一、负载均衡监控指标

| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| 当前连接数 | 活跃连接 | >80% maxconn |
| 会话速率 | 每秒新建连接 | 突增 |
| 后端健康 | UP/DOWN 状态 | DOWN |
| 响应时间 | 后端响应延迟 | >1s |
| 错误率 | 5xx 比例 | >1% |
| 队列长度 | 等待队列 | >100 |

---

> 一句话：**入口高可用 = LVS（内核转发扛量）+ HAProxy（L4/L7 治理 + 健康检查 + 会话保持）+ Keepalived（VIP 漂移）；选型先定「层级（超大规模→LVS，通用→HAProxy）」，再定「会话保持策略（无状态优先）」，最后配「健康检查 + 超时 + 慢启动」**。
