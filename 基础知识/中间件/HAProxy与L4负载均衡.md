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

## 七、与其他板块的关系

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
