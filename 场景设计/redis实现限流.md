# Redis 实现限流

Redis 可以通过多种数据结构实现限流，常见的限流算法包括固定窗口限流、滑动窗口限流、令牌桶算法和漏桶算法。以下是这些算法的实现原理和基于 Redis 的实现方式。

## 1. 固定窗口限流

**原理**：将时间划分为固定大小的窗口（如每分钟），在每个窗口内限制请求次数。

**实现**：
- 使用 Redis 的 `INCR` 命令记录窗口内的请求次数。
- 使用 `EXPIRE` 命令设置窗口的过期时间。
- 如果请求次数超过阈值，拒绝请求。

**代码示例**：

```java
public boolean isAllowed(String key, int limit, int windowSeconds) {
    String redisKey = "rate_limit:" + key;
    Long count = redisTemplate.opsForValue().increment(redisKey);
    if (count == 1) {
        redisTemplate.expire(redisKey, windowSeconds, TimeUnit.SECONDS);
    }
    return count <= limit;
}
```

**缺点**：在窗口切换时可能出现流量突增。

## 2. 滑动窗口限流

**原理**：将时间划分为多个小窗口，统计当前时间窗口内的请求数量。

**实现**：
- 使用 Redis 的有序集合（ZSET）记录请求时间戳。
- 每次请求时移除过期的时间戳。
- 统计当前窗口内的请求数量。

**代码示例**：

```java
public boolean isAllowed(String key, int limit, int windowSeconds) {
    String redisKey = "rate_limit:" + key;
    long currentTime = Instant.now().getEpochSecond();
    long windowStart = currentTime - windowSeconds;

    redisTemplate.opsForZSet().add(redisKey, String.valueOf(currentTime), currentTime);
    redisTemplate.opsForZSet().removeRangeByScore(redisKey, 0, windowStart);
    Long count = redisTemplate.opsForZSet().zCard(redisKey);

    return count != null && count <= limit;
}
```

## 3. 令牌桶算法

**原理**：以固定速率向桶中添加令牌，请求需要消耗令牌，桶空时拒绝请求。

**实现**：
- 使用 Redis 的 Lua 脚本实现原子操作，确保线程安全。

**代码示例**：

```java
public boolean allowRequest(int tokensNeeded) {
    Object result = jedis.eval(LUA_SCRIPT, 1, REDIS_KEY, String.valueOf(tokensNeeded),
                               String.valueOf(capacity), String.valueOf(rate), String.valueOf(System.currentTimeMillis() / 1000));
    return (Long) result == 1;
}
```

## 4. 漏桶算法

**原理**：以固定速率处理请求，多余的请求被丢弃。

**实现**：
- 使用 Redis 的 Lua 脚本实现原子操作。

**代码示例**：

```java
public boolean allowRequest() {
    Object result = jedis.eval(LUA_SCRIPT, 1, REDIS_KEY, String.valueOf(System.currentTimeMillis() / 1000),
                               String.valueOf(capacity), String.valueOf(rate));
    return (Long) result == 1;
}
```

## 选择合适的限流算法

- **固定窗口限流**：适用于流量均匀的场景，实现简单，但可能在窗口切换时出现流量突增。
- **滑动窗口限流**：适用于对流量分布敏感的场景，能更平滑地控制请求频率。
- **令牌桶算法**：适用于需要精确控制速率且支持突发流量的场景。
- **漏桶算法**：适用于需要平滑处理请求的场景。

根据具体需求选择合适的限流算法，并结合 Redis 的数据结构实现高效的限流机制。

## 5. 令牌桶算法（完整 Lua 实现）

令牌桶允许突发：桶容量 `capacity`，令牌生成速率 `rate`/秒。下面用 Lua 脚本保证"计算+扣减"原子执行，避免并发竞态。

```lua
-- KEYS[1] 限流 key
-- ARGV[1] capacity  ARGV[2] rate(每秒)  ARGV[3] now(秒)  ARGV[4] requested(本次请求令牌数)
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local last = tonumber(data[2])
if tokens == nil then
  tokens = capacity
  last = now
end

local delta = math.min(capacity, (now - last) * rate)
tokens = math.min(capacity, tokens + delta)
local allowed = 0
if tokens >= requested then
  tokens = tokens - requested
  allowed = 1
end
redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', key, math.ceil(capacity / rate) + 1)
return allowed
```

## 6. 漏桶算法（完整 Lua 实现）

漏桶平滑流出，超出容量直接拒绝：

```lua
-- KEYS[1] key  ARGV[1] capacity  ARGV[2] rate(每秒漏出)  ARGV[3] now  ARGV[4] 本次水量
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'water', 'ts')
local water = tonumber(data[1]) or 0
local last = tonumber(data[2]) or now

local leaked = math.min(water, (now - last) * rate)
water = water - leaked
local allowed = 0
if water + requested <= capacity then
  water = water + requested
  allowed = 1
end
redis.call('HMSET', key, 'water', water, 'ts', now)
redis.call('EXPIRE', key, math.ceil(capacity / rate) + 1)
return allowed
```

## 7. 滑动窗口计数（ZSET Lua 实现）

```lua
-- KEYS[1] key  ARGV[1] window(秒)  ARGV[2] limit  ARGV[3] now(毫秒)  ARGV[4] 唯一成员
local key = KEYS[1]
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window * 1000)
local count = redis.call('ZCARD', key)
local allowed = 0
if count < limit then
  redis.call('ZADD', key, now, member)
  allowed = 1
end
redis.call('PEXPIRE', key, window * 1000)
return allowed
```

## 8. 压测对比与选型建议

| 算法 | 平滑度 | 突发支持 | 存储开销 | Redis 命令 | 适用场景 |
|------|--------|----------|----------|-----------|----------|
| 固定窗口 | 差（临界突增） | 不支持 | 1 key | INCR | 简单计数 |
| 滑动窗口(ZSET) | 好 | 不支持 | 多（每请求1成员） | ZADD/ZCARD | 精准计数 |
| 令牌桶 | 中 | 支持 | 1 hash | Lua | API 限流、突发 |
| 漏桶 | 最好 | 不支持 | 1 hash | Lua | 流量整形、保护下游 |

> 压测要点：使用 `redis-benchmark` 或自研压测（如 1 万并发、持续 60s）。Lua 脚本在单线程内原子执行，QPS 可达 5w+，但长脚本会阻塞其他命令，需控制脚本复杂度。固定窗口因无脚本开销吞吐最高，但精度最低。

```bash
# 令牌桶压测示意（伪命令：-E eval 执行脚本）
redis-benchmark -n 100000 -c 100 -r 1000 \
  -E eval -s "$(cat token_bucket.lua)" 1 rl:api 100 10 "$(date +%s)" 1
```
