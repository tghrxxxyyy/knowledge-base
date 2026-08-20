# OpenResty 深入（Nginx 阶段模型 / LuaJIT 嵌入 / cosocket 原理 / 限流限速 / 生产实践）

> OpenResty = **Nginx + LuaJIT 的 Web 平台**：在 Nginx 的请求处理阶段中嵌入 Lua 脚本，把高性能事件驱动与业务逻辑结合，常用于 API 网关、限流、WAF、动态路由、灰度发布。本篇深入拆解：请求处理阶段模型、LuaJIT 嵌入机制、cosocket 异步 IO、常见场景实现、生产实践。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| Nginx 配置能力有限 | 纯静态配置无法做动态路由/灰度/鉴权 |
| 业务逻辑前置 | 校验/限流/改写等逻辑放网关而不是应用 |
| 高性能动态处理 | 每请求动态计算不能牺牲 Nginx 性能 |
| C 模块开发门槛高 | Nginx 模块开发难（C 语言 + 内存管理） |
| 传统网关僵化 | 每次改规则要改配置重载/重启 |

> 核心认知：**OpenResty = 「把 Nginx 从 Web Server 变成 Web 应用平台」**——Lua 脚本直接嵌在 Nginx 请求生命周期各阶段执行，零上下文切换成本，性能接近原生 Nginx。

---

## 二、Nginx 请求处理阶段模型（核心基础）

```
请求处理生命周期（按顺序）：

  1. init_by_lua        进程启动初始化（加载配置/预热）
  2. init_worker_by_lua 每个 worker 启动初始化
  3. set_by_lua         设置变量
  4. rewrite_by_lua     重写阶段（URL 改写/重定向/鉴权）
  5. access_by_lua      访问控制（鉴权/限流/IP 黑白名单）
  6. content_by_lua     内容生成（业务处理/反向代理决策）
  7. header_filter_by_lua   响应头修改
  8. body_filter_by_lua     响应体修改（压缩/脱敏）
  9. log_by_lua         日志记录（访问日志/指标上报）
  10. balancer_by_lua   负载均衡策略（动态选后端）
  11. ssl_certificate_by_lua 动态证书
```

```
nginx.conf 配置示例：
location /api/ {
    rewrite_by_lua_block {
        -- 校验签名/改写路径
    }
    access_by_lua_block {
        -- 鉴权 + 限流
    }
    content_by_lua_block {
        -- 转发到后端或生成响应
    }
    log_by_lua_block {
        -- 记录指标
    }
}
```

---

## 三、LuaJIT 嵌入机制（深入）

### 3.1 LuaJIT 与 Nginx 的结合

```
LuaJIT = Lua 5.1 兼容的 JIT 编译器（比解释型 Lua 快 10~50 倍）

嵌入机制：
  Nginx 事件循环中运行 Lua VM
  每个 worker 一个 Lua VM（全局变量共享）
  每个请求一个 coroutine（协程）→ 阻塞操作不阻塞事件循环

关键：一切 IO 用 cosocket（异步）→ 不在 Lua 里做阻塞 IO
```

### 3.2 Lua 代码组织

```
文件组织：
  /usr/local/openresty/nginx/lua/
    ├── init.lua          （启动初始化）
    ├── access.lua        （鉴权）
    ├── limit.lua         （限流）
    └── util.lua          （公共函数）

加载方式：
  *by_lua_file：按文件加载（开发）
  *by_lua_block：内联代码块
  lua_package_path：指定模块搜索路径（require）

性能注意：
  避免每请求 require 大模块（缓存）
  全局表共享（worker 级缓存）
```

### 3.3 共享内存与缓存

```
lua_shared_dict（共享内存字典）：
  worker 间共享（跨进程）
  用途：计数（限流）、缓存（token/配置）、锁

示例：
  lua_shared_dict limit_store 10m;
  lua_shared_dict token_cache 50m;

共享字典限制：
  容量固定（写满报错）
  需处理竞争（可加锁）

其他缓存：
  lua-resty-lrucache（worker 内 LRU 缓存）
  lua-resty-redis（外部缓存）
```

---

## 四、cosocket 异步 IO（核心原理）

### 4.1 什么是 cosocket

```
cosocket = coroutine + socket（Lua 协程里的非阻塞 socket）

原理：
  Lua 协程里发起 socket 请求 → Nginx 事件循环注册事件
  → 协程挂起（不占线程）→ 响应到达 → 协程恢复

优势：
  请求挂起不阻塞 worker（可同时处理数千并发）
  代码像同步写（无回调地狱）

限制：
  只能在 rewrite/access/content 等阶段用
  不能跨 worker
```

### 4.2 使用示例

```lua
-- 访问 Redis（异步）
local redis = require "resty.redis"
local red = redis:new()
red:set_timeouts(1000, 1000, 1000)
local ok, err = red:connect("127.0.0.1", 6379)
if not ok then
    ngx.log(ngx.ERR, "redis connect failed: ", err)
    return ngx.exit(503)
end
local res, err = red:get("user:10086")
red:set_keepalive(10000, 100)

-- 访问 HTTP 后端（异步）
local httpc = require "resty.http"
local http = httpc.new()
local res, err = http:request_uri("http://internal-service:8080/check", {
    method = "POST",
    body = "token=" .. token,
    headers = { ["Content-Type"] = "application/x-www-form-urlencoded" }
})
```

### 4.3 超时与连接池

```
超时设置（必配，防挂死）：
  connect_timeout / send_timeout / read_timeout

连接池（性能关键）：
  set_keepalive（复用连接）
  池大小 按 worker × 后端数 预估
  连接池命中率监控（lua_shared_dict 统计）
```

---

## 五、常见场景实现（深入）

### 5.1 限流（lua-resty-limit）

```lua
-- 令牌桶限流（resty.limit.req）
local limit_req = require "resty.limit.req"
local lim, err = limit_req.new("limit_store", 100, 10)

local key = ngx.var.binary_remote_addr  -- 按 IP
local delay, err = lim:incoming(key, true)
if not delay then
    return ngx.exit(503)  -- 超过限流 → 503
end

if delay > 0 then
    ngx.sleep(delay)  -- 平滑限速（按需）
end
```

```
限流维度：
  按 IP / 按用户 / 按接口 / 按业务维度
  集群限流：共享内存 + Redis（lua-resty-redis 计数）
  漏斗 vs 令牌桶：突发容忍不同

注意：
  limit_store 共享内存容量规划
  集群模式用 Redis（跨节点一致）
```

### 5.2 动态路由与灰度

```lua
-- 动态路由（读 Redis 配置，秒级生效）
local route_key = "route:" .. ngx.var.host
local target = cache_get(route_key)
if not target then
    target = red:get(route_key)
    cache_set(route_key, target)
end
-- 灰度：按 header/参数/比例选版本
local version = "v1"
local uid = ngx.var.http_x_user_id
if uid and (tonumber(uid) % 100) < 10 then
    version = "v2"  -- 10% 用户灰度
end
```

### 5.3 WAF（请求安全）

```lua
-- 访问控制：IP 黑白名单 + 敏感路径 + 参数校验
local ip = ngx.var.binary_remote_addr
if blacklist:contains(ip) then
    return ngx.exit(403)
end

if ngx.re.match(ngx.var.uri, "(\\.\\./|\\.env|phpmyadmin)") then
    return ngx.exit(403)
end

-- SQL 注入/ XSS 关键词过滤（注意误杀）
```

### 5.4 鉴权与签名

```lua
-- access 阶段：签名校验（HMAC-SHA256）
local hmac = require "resty.openssl.hmac"
local expected = hmac:new("secret-key", "sha256"):update(canonical_string):final()
if ngx.var.http_x_signature ~= expected then
    return ngx.exit(401)
end
```

### 5.5 响应体改写

```lua
-- body_filter：响应体脱敏/注入
body_filter_by_lua_block {
    local body = ngx.arg[1]
    if body then
        body = ngx.re.gsub(body, "1[3-9]\\d{9}", "****")  -- 手机号脱敏
        ngx.arg[1] = body
    end
}
```

---

## 六、性能与运维

### 6.1 性能关键

| 因素 | 说明 |
|------|------|
| worker 数 | CPU 核数（Nginx 事件驱动） |
| 共享内存 | 按需（限制 10~50m） |
| 阻塞操作 | 禁止（sleep/磁盘/阻塞 socket） |
| 后端依赖 | 每次请求多依赖 → 延迟叠加 |
| Lua 代码 | 模块缓存 + 避免高开销正则 |
| 连接池 | 后端连接复用 |

### 6.2 调试与排障

```
日志：
  error_log 级别 + Lua 错误定位（lua 文件:行号）
  ngx.log(ngx.DEBUG/INFO/WARN/ERR, ...)

调试工具：
  resty-cli（命令行直接跑 Lua）
  --resty 调试模式
  access.log 加自定义字段（阶段耗时）

常见问题：
  "attempt to index a nil value" → 变量未初始化
  共享内存写满 → 扩容/清理
  cosocket 超时 → 检查后端/网络
```

---

## 七、OpenResty vs Kong vs APISIX

| 维度 | OpenResty | Kong | APISIX |
|------|-----------|------|--------|
| 定位 | 平台（Lua 开发） | 网关产品 | 网关产品 |
| 插件体系 | 自己写 | 内置插件 + 自定义 | 内置插件丰富 + 自定义 |
| 管理 UI | 无 | 有（Kong Manager） | 有（dashboard） |
| 生态 | 底层 | 商业支持（Kong Enterprise） | 活跃社区 + 云原生 |
| 适用 | 深度定制/网关底座 | 现成网关 | 现成网关 + 云原生 |

> 见「[Kong 与 APISIX 网关](./Kong与APISIX网关.md)」深度篇。

---

## 八、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 深度定制/自己开发插件 | OpenResty | — |
| 现成网关 + 插件 | APISIX | Kong |
| 云原生网关 | APISIX | Kong |
| 大规模限流/鉴权 | OpenResty | APISIX 插件 |
| 商业支持 | Kong Enterprise | 云网关 |
| 简单需求 | Nginx + 少量 Lua | OpenResty |

---

## 九、与其他板块的关系

- 网关体系见「[Kong 与 APISIX 网关](./Kong与APISIX网关.md)」与「[Spring Cloud Gateway](./SpringCloudGateway.md)」；
- Nginx 基础见「[Nginx](./Nginx.md)」；
- 服务网格（边车替代网关场景）见「[云原生/Service Mesh](../../云原生/ServiceMesh.md)」；
- 网关对比见「[API 网关](./API网关.md)」。

> 一句话：**OpenResty = Nginx 阶段模型（rewrite/access/content...）+ LuaJIT（worker 内协程）+ cosocket（异步 IO 不阻塞事件循环）+ 共享内存（跨 worker 状态）——生产要点：禁阻塞 IO、配超时连接池、共享内存容量规划、阶段职责清晰**。