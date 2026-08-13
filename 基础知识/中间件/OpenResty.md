# OpenResty（Nginx + Lua 高性能网关 / 动态扩展）

> OpenResty 是 **Nginx 内核 + LuaJIT** 的高性能 Web 平台，以「**在 Nginx 请求处理各阶段嵌入 Lua 逻辑**」实现「静态 Nginx 做不到的动态能力」：动态路由、灰度、鉴权、限流、缓存、自定义协议。相比原生 Nginx（配置写死）、Spring Cloud Gateway（Java 慢）、Kong/APISIX（封装好的产品），OpenResty 是「**可编程的 Nginx**」——自己掌控一切的高性能网关地基。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 静态配置限制 | Nginx 只能改配置 reload，无法按请求动态决策 |
| 性能 vs 灵活 | Java 网关灵活但性能差；Nginx 快但不可编程 |
| 横切逻辑下沉 | 鉴权/限流/灰度在每个业务重复，需要网关层统一 |
| 连接 MySQL/Redis | 网关需要直连 Redis 做限流/鉴权，Nginx 原生做不到 |
| 自定义协议 | 需要代理/解析非 HTTP 协议（如 MQTT/私有协议） |

> 核心认知：**OpenResty = Nginx 的 11 个处理阶段 + LuaJIT 脚本**——每个阶段都能注入 Lua 逻辑，事件循环零阻塞，性能接近纯 Nginx。

---

## 二、核心原理

### 2.1 Nginx 请求处理阶段（Phase，核心模型）

```
init_by_lua      —— 启动时加载（全局配置）
init_worker_lua  —— worker 启动（定时器/预热）
ssl_*            —— TLS 握手阶段（动态证书）
set_by_lua       —— 变量赋值
rewrite_by_lua   —— URL 重写/路由决策 ⭐
access_by_lua    —— 访问控制：鉴权/限流/IP 黑名单 ⭐
content_by_lua   —— 内容生成（替代静态文件/代理）
header_filter_lua —— 响应头改写
body_filter_lua  —— 响应体改写
log_by_lua       —— 日志/统计上报
balancer_by_lua  —— 动态负载均衡/一致性哈希
```

**选型关注点**：业务逻辑 90% 落在 rewrite（路由）、access（鉴权限流）、log（统计）三个阶段——理解阶段 = 理解 OpenResty。

### 2.2 性能模型：为什么快

- **Nginx 事件循环**：非阻塞，单 worker 处理海量连接；
- **LuaJIT**：JIT 编译的 Lua，性能 ≈ C（比 Lua 解释器快 10~50 倍）；
- **零阻塞原则**：Lua 内禁止 sleep/阻塞 IO，一切用 cosocket（异步 socket）——连接 Redis/MySQL 也是非阻塞；
- **共享内存**：`lua_shared_dict` 进程间共享（限流计数/缓存）。

### 2.3 cosocket（异步网络库，核心武器）

```lua
-- 非阻塞连接 Redis（限流/鉴权/缓存）示例
local redis = require "resty.redis"
local red = redis:new()
red:set_timeouts(1000, 1000, 1000)
local ok, err = red:connect("127.0.0.1", 6379)   -- 不阻塞 worker
local res, err = red:incr("req_count")           -- 计数限流
```

**选型关注点**：cosocket 让网关能直连 Redis/MySQL/上游做「有状态决策」——这是原生 Nginx 永远做不到的。

### 2.4 动态路由与灰度示例

```lua
-- access_by_lua：按 Header 灰度 + Redis 限流
local redis = require "resty.redis"
local red = redis:new()

-- 灰度：按用户灰度标签路由
local gray = ngx.var.http_x_gray_version   -- 灰度 Header
if gray and gray == "v2" then
    ngx.var.upstream = "backend_v2"        -- 动态选上游
else
    ngx.var.upstream = "backend_v1"
end

-- 限流：滑动窗口计数
local cnt = red:incr(ngx.var.remote_addr)
if cnt > 100 then ngx.exit(429) end        -- 超限拒绝
```

---

## 三、核心特性

| 特性 | 说明 |
|------|------|
| 高性能 | LuaJIT + 事件循环，性能接近纯 Nginx |
| 动态决策 | 每个请求按 Header/参数/Redis 数据实时路由 |
| 丰富库 | resty.redis / resty.mysql / resty.http / resty.limit.* 等 100+ 官方库 |
| 灰度/限流 | 内置 resty.limit（令牌桶/漏桶/滑动窗口） |
| 共享内存 | lua_shared_dict 分布式计数（多 worker 一致） |
| 定时任务 | ngx.timer 后台任务（指标上报/清理） |
| 协议扩展 | 可处理非 HTTP 协议（MQTT/私有 TCP） |
| 热更新 | lua 文件修改即时生效（无需 reload） |

---

## 四、OpenResty vs Nginx vs Kong/APISIX vs Spring Cloud Gateway

| 维度 | OpenResty | 原生 Nginx | Kong/APISIX | Spring Cloud Gateway |
|------|-----------|-----------|-------------|----------------------|
| 可编程 | 强（Lua） | 无 | 插件化（受限） | 强（Java） |
| 性能 | 高 | 最高 | 高 | 中 |
| 动态决策 | 强（每请求） | 弱 | 中 | 强 |
| 学习成本 | 高（Lua + 阶段） | 中 | 低（插件） | 低（Java） |
| 维护成本 | 高（自研逻辑） | 低 | 低（产品化） | 中 |
| 适用 | 定制化高性能网关 | 静态代理 | 开箱即用网关 | Java 生态 |

**选型关注点**：
- 需要高度定制 + 性能敏感 → **OpenResty**（自研网关/开放平台）；
- 不想自研、要开箱即用 → **Kong/APISIX**（本质也是 OpenResty 封装）；
- 团队全 Java → **Spring Cloud Gateway**；
- 纯静态场景 → 原生 Nginx 就够。

---

## 五、生产实践

### 5.1 关键实践

| 实践 | 说明 |
|------|------|
| 禁止阻塞 | Lua 内严禁 sleep/阻塞调用（会卡死整个 worker） |
| 超时必配 | cosocket 必须 set_timeouts（默认可能无限等） |
| 限流选型 | 单机 → resty.limit；集群 → Redis 计数（注意原子性） |
| 共享内存 | 合理设置 `lua_shared_dict` 大小（内存换性能） |
| 日志 | log_by_lua 异步上报（access log 结构化 JSON） |
| 灰度 | Header/Cookie/用户特征 → 动态 upstream（权重表） |

### 5.2 常见坑

- **phase 混用**：init_by_lua 里不能访问请求；access 里改 header 要到 header_filter——阶段语义必须清楚；
- **共享内存序列化**：存储非字符串需 cjson 序列化（shm 只存字符串）；
- **DNS 缓存**：upstream 动态域名要配 resolver + 缓存过期；
- **Lua 版本**：OpenResty 自带 LuaJIT，别装系统 Lua 造成 ABI 冲突。

---

## 六、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 自研高性能网关 | OpenResty | Kong/APISIX |
| 开箱即用网关 | Kong/APISIX | OpenResty |
| 灰度/限流下沉 | OpenResty（Lua） | Sentinel |
| 静态代理 | 原生 Nginx | — |
| Java 生态网关 | Spring Cloud Gateway | — |
| 云原生 Ingress | APISIX/Traefik | — |

---

## 七、与其他板块的关系

- Nginx 基础见「[Nginx](./Nginx.md)」；
- Kong/APISIX（OpenResty 封装）见「[Kong 与 APISIX 网关](./Kong与APISIX网关.md)」；
- 网关选型见「[API 网关](./API网关.md)」；
- 限流熔断见「[Sentinel 限流熔断](./Sentinel限流熔断.md)」；
- 云上流量接入见「[云网络与流量接入体系](./云网络与流量接入体系.md)」。

> 一句话：**OpenResty = Nginx 阶段模型 + LuaJIT + cosocket（Redis/MySQL 异步访问）——把 Nginx 从「配置驱动」升级为「可编程驱动」；选型先看「定制深度（要掌控一切→OpenResty，要产品化→Kong/APISIX）」，再守「零阻塞 + 超时必配」红线，最后配「灰度（动态 upstream）+ 限流（resty.limit/Redis）」**。
