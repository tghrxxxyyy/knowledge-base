# 缓存中间件：Memcached 与本地缓存（Caffeine/Guava）

> Redis 之外，还有两类缓存天天在跑：Memcached（老牌分布式缓存）与 Caffeine/Guava（进程内本地缓存）。「本地缓存 + 分布式缓存 + 多级缓存」是互联网系统的性能三件套，本文把后两块讲透。
> 开源参考：[memcached/memcached](https://github.com/memcached/memcached)（C，BSD 3-Clause，LiveJournal 开源）、[ben-manes/caffeine](https://github.com/ben-manes/caffeine)（Java 进程内缓存性能标杆）、Google Guava Cache（[google/guava](https://github.com/google/guava)）。

---

## 〇、本体介绍（它是什么 / 适用场景 / 核心概念）

**它是什么**：Memcached 是**分布式内存 KV 缓存**（多节点无主、纯内存、过期即删）；Caffeine 是**Java 进程内缓存**（多级缓存最靠近 CPU 的一层）。两者与 Redis 一起构成「本地 → 分布式」的缓存体系。

**解决什么痛点**：热点数据放内存就近读取，避免每次打到 DB。Memcached 用最简单模型解决「跨进程共享缓存」；Caffeine 用极快命中解决「单进程内的热数据重复计算/重复查」。

**核心概念**：Memcached（key-value、内存淘汰 LRU、过期 TTL、一致性哈希客户端路由、无持久化、无集群主从）；Caffeine（CacheLoader 自动加载、过期策略（expireAfterWrite/Access）、容量淘汰（maximumSize 近似 LRU/W-TinyLFU）、统计命中率、异步刷新）。

**适用场景**：Memcached——高并发读多写少、需要共享缓存、无持久化要求；Caffeine——单进程热点、本地结果缓存、多级缓存第一层。
**不适用**：需要持久化/分布式锁/复杂数据结构 → Redis；缓存一致性要求极高且共享 → 用分布式缓存 + 订阅失效（见「场景设计/多级缓存框架」）。

---

## 一、Memcached：极简分布式缓存

### 1.1 定位与 Redis 对比（面试高频）

| 维度 | Memcached | Redis |
|------|-----------|-------|
| 数据类型 | 仅 string KV | string/hash/list/set/zset/bitmap... |
| 持久化 | ❌ 纯内存（重启全丢） | ✅ RDB/AOF |
| 集群 | 客户端分片（一致性哈希），无主从 | 主从 + Cluster（官方） |
| 分布式锁/事务 | ❌ | ✅ SETNX + Lua |
| 淘汰策略 | LRU（slab 内） | LRU/LFU/随机/noeviction |
| 内存模型 | **slab 分配器**（防碎片） | 内存分配器（jemalloc） |
| 多线程 | ✅ 多线程（mc 1.5+） | 单线程事件循环 |
| 性能 | 极高（多核扩展好） | 极高（单实例但 IO 多路复用） |
| 典型场景 | 纯 KV 缓存、共享会话 | 缓存 + 数据结构业务 |

> 现状：新项目基本直接用 Redis（功能全面）；Memcached 多见于存量系统（纯 KV 大缓存）或极致多线程吞吐场景。

### 1.2 核心机制

1. **一致性哈希客户端路由**：客户端按 key 哈希到节点，增删节点只影响相邻一小段 key（虚拟节点均衡）。节点无通信、无复制——**简单即优势**。
2. **slab 分配器**：内存按 slab class 分块（chunk 固定大小），避免碎片；坑：**key 大小分布不均时内存浪费**，需要算好增长因子。
3. **LRU 淘汰 + 过期**：`expire` 超时懒删除；内存满按 LRU 淘汰（可禁淘汰防热点被打掉）。
4. **多线程**（1.5+）：多 worker 线程 + 锁分段，多核扩展性好于 Redis 单线程（纯 get/set 场景）。
5. **无持久化、无复制**：挂了就是「缓存没了」，必须容忍缓存回源（Cache-Aside 模式天然适配）。

### 1.3 生产注意

- 容量 = 热点数据量 × 余量（1.3~1.5 倍），宁多勿少（淘汰风暴）。
- 监控 `curr_items`（当前条目）、`evictions`（淘汰数，暴涨=容量不足）、命中率（hit ratio < 90% 排查）。
- 雪崩防护：缓存过期时间加**随机抖动**；回源加分布式锁防击穿（见「场景设计/缓存经典三问与一致性」）。

---

## 二、Caffeine：进程内缓存性能标杆

### 2.1 为什么快（对比 Guava Cache）

- **W-TinyLFU 淘汰策略**：频次 + 新鲜度（时间窗口衰减），比 Guava 的 LRU 更准（不被「一次性热点」污染缓存）。
- **并发读无锁**：读路径无锁（类似 ConcurrentHashMap 分段 CAS），命中读是纳秒级。
- **异步加载/刷新**：`refreshAfterWrite` 后台刷新不阻塞读（配合异步实现「读不 miss」）。
- 数据在**本进程堆内**，无网络开销——多级缓存里第一层（次毫秒）与 Redis（亚毫秒~毫秒）不是一个量级。

### 2.2 快速上手

```java
Cache<String, Object> cache = Caffeine.newBuilder()
    .maximumSize(10_000)                 // 容量上限（近似淘汰）
    .expireAfterWrite(5, TimeUnit.MINUTES) // 写后 5 分钟过期
    .expireAfterAccess(30, TimeUnit.MINUTES) // 访问后 30 分钟（可叠加）
    .recordStats()                       // 命中率统计
    .build();

Object v = cache.get("key", k -> loadFromDb(k));  // 自动回源加载（getIfAbsent）
```

### 2.3 配置经验

| 配置 | 说明 | 坑 |
|------|------|----|
| `maximumSize` / `maximumWeight` | 容量上限 | 不设会无限增长 → OOM |
| `expireAfterWrite` | 写后过期 | 热点冷数据过期后回源抖动 |
| `expireAfterAccess` | 访问后重置过期 | 长活对象永不淘汰 |
| `refreshAfterWrite` | 后台刷新（保持旧值可用） | 需配 CacheLoader 且异步 refresh |
| `recordStats` | 命中率监控 | 不上报等于没看 |
| 数据一致性 | 本进程各实例各自缓存 | 多实例间不一致 → 靠 TTL 收敛或消息失效 |

### 2.4 与多级缓存的组合（生产标准姿势）

```mermaid
flowchart LR
    Q[请求] --> C1[Caffeine 本地缓存<br/>命中 ~μs]
    C1 -->|miss| C2[Redis 分布式缓存<br/>命中 ~ms]
    C2 -->|miss| DB[(MySQL)]
    DB -->|回填| C2
    C2 -->|回填| C1
    MSG[MQ 变更事件] -->|失效| C1
    MSG -->|失效| C2
```

- 注意：**本地缓存天然多副本不一致**（每实例一份），只能服务「强一致要求低」的热点；一致性要求高的走 Redis + 订阅失效。
- 详见「场景设计/多级缓存框架」「场景设计/缓存经典三问与一致性」。

---

## 三、本地缓存 vs 分布式缓存（怎么选）

| 维度 | 本地缓存（Caffeine/Guava） | 分布式缓存（Redis/Memcached） |
|------|---------------------------|------------------------------|
| 延迟 | 纳秒~微秒（进程内） | 亚毫秒~毫秒（网络一次） |
| 容量 | 受单机堆限制（几 GB） | 集群可扩展（百 GB~TB） |
| 一致性 | 多实例各自一份，**天然不一致** | 共享一份，相对一致 |
| 失效 | 本进程失效 | 可通过 MQ/订阅广播失效 |
| 适用 | 每实例相同/可容忍短暂不一致的热点 | 需要全局一致、多服务共享的数据 |
| 典型 | 字典表、配置快照、用户维表、计算结果 | 会话、库存、热点商品、全局限流 |

**口诀**：读多写少、数据全局同一 → 本地缓存；需要共享/强一致/大数据 → 分布式缓存；两者叠加 → 多级缓存（本地优先 + Redis 兜底）。

---

## 面试高频问题（20+ 条）

1. **Memcached 和 Redis 区别？** 数据类型（仅 KV vs 丰富）、持久化（无 vs RDB/AOF）、集群（客户端分片 vs 主从+Cluster）、锁/事务（无 vs 有）、线程模型（多线程 vs 单线程事件循环）。

2. **Memcached 一致性哈希？** 客户端按 key 哈希到环上节点，增删节点只重排相邻 key；虚拟节点解决分布不均；无节点间通信与复制。

3. **Memcached 内存管理？** slab 分配器：内存分 slab class、chunk 固定大小防碎片；key 大小分布不均时空间浪费（增长因子权衡）。

4. **Memcached 会丢数据吗？** 会：无持久化、重启即空；容量满 LRU 淘汰；设计上必须「可容忍缓存丢」——Cache-Aside 回源即可。

5. **Memcached 还值得用吗？** 新项目一般直接 Redis；存量纯 KV 大缓存或极致多线程吞吐场景仍可用；选型看团队维护成本。

6. **Caffeine 为什么比 Guava Cache 好？** W-TinyLFU 淘汰（频次+新鲜度）优于 LRU、读无锁并发更高、异步 refresh、更细过期策略。

7. **W-TinyLFU 是什么？** 频率计数 + 时间窗口衰减的淘汰算法：既能识别高频热点，又不会被一次性突发流量污染缓存。

8. **Caffeine 和 Redis 怎么选？** 单进程热点、可容忍不一致 → Caffeine（快）；共享/强一致/大数据 → Redis；生产常组合成多级缓存。

9. **多级缓存一致性怎么处理？** 本地缓存 TTL 收敛 + MQ 变更广播失效 + Redis 订阅失效；强一致数据不落本地缓存。

10. **本地缓存的坑？** 多实例不一致、每实例一份内存（堆压力）、长过期导致脏数据；过期策略与容量必须显式配置。

11. **expireAfterWrite 和 expireAfterAccess 区别？** 写后固定过期（防脏数据）；访问后重置过期（防热点被清）；组合用看数据特性。

12. **refreshAfterWrite 作用？** 到期后异步刷新保持旧值可用，读不 miss、无回源抖动；需 CacheLoader 支持。

13. **为什么读无锁这么快？** 类似 ConcurrentHashMap 的并发设计（分段 + CAS），读路径没有锁与内存屏障开销。

14. **缓存命中率怎么提升？** 热点预热、过期时间随机化、refresh 保旧值、容量留余量、失效用消息异步（别直接删热点）。

15. **缓存击穿/穿透/雪崩？** 击穿：热点 key 过期瞬时打满 DB → 互斥锁重建；穿透：查不存在的 key → 布隆过滤器/空值缓存；雪崩：大批 key 同时过期 → 随机过期时间/多级缓存（见「缓存经典三问」）。

16. **Memcached 多线程优势？** 多 worker 线程并行处理，多核扩展性好；Redis 单线程靠 IO 多路复用，瓶颈在单核（大 value 序列化时明显）。

17. **Memcached 监控看什么？** curr_items / evictions（淘汰率）/ hit ratio / get_misses / bytes；淘汰暴涨 = 容量不足要扩容。

18. **缓存更新策略？** 先更新 DB 再删缓存（延迟双删/消息异步删）或先删缓存再更 DB（配合事务）；读侧 Cache-Aside 回源。（详见「缓存经典三问」）

19. **进程内缓存会导致什么问题？** 堆内存占用上升（Full GC 压力）、多实例数据不一致、重启即失（预热成本）——用 TTL/消息失效/预热缓解。

20. **什么时候本地缓存不够？** 数据量超单机内存、需要全局唯一视图、强一致性约束——升级分布式缓存。

21. **Caffeine 统计怎么用？** recordStats + `cache.stats()`（hitRate/missRate/evictionCount），接入监控大盘，命中率是缓存健康度第一指标。

22. **缓存框架选型？** 分布式：Redis（首选）/ Memcached（存量）；本地：Caffeine（首选）/ Guava（简单存量）；组合：见「多级缓存框架」。

---

## Memcached Slab Allocator Internals

### Slab 分配器原理

```
Slab Allocator = 预分配固定大小内存块，避免碎片

内存结构：
  Slab Class 1: chunk 96B → 存 <96B 的 item
  Slab Class 2: chunk 120B → 存 96-120B 的 item
  Slab Class 3: chunk 152B → 存 120-152B 的 item
  ...
  Slab Class N: chunk 最大 → 存最大 item

每个 Slab Class：
  ├── Slab Page（固定 1MB）
  ├── Slab Page 切分成 N 个 chunk
  └── 空闲 chunk 链表

分配流程：
  1. item 大小 → 找到合适的 Slab Class
  2. 从空闲 chunk 链表取一个
  3. 链表空 → 申请新的 Slab Page（1MB）→ 切分

问题：
  增长因子（Growth Factor）默认 1.25
  如 item 90B 和 120B 分在不同 Class → 碎片
  
  优化：调整增长因子匹配实际 item 大小分布
  stats slabs 查看各 Class 利用率
```

## Memcached Consistent Hashing Deep

```
一致性哈希环（客户端实现）：

Key 哈希 → 环上位置 → 顺时针找最近节点
  增删节点只影响相邻 key（~1/N 数据迁移）

虚拟节点：
  每个真实节点 → M 个虚拟节点（均匀分布）
  默认 100-200 个虚拟节点/节点
  
  解决问题：
  ├── 物理节点少时数据倾斜
  ├── 异构硬件性能差异
  └── 增删节点影响范围更小

客户端库实现：
  libketama（PHP/Python）
  ketama（Ruby）
  consistent hashing（Go/Java）
  
配置：
  选择虚拟节点数（100-200 平衡均匀性与内存）
  监控各节点 item 数（确保均匀分布）
```

## Memcached CAS Operations

```
CAS（Compare-And-Swap）= 乐观锁并发控制

场景：
  多客户端同时更新同一 key → 覆盖问题
  
CAS 流程：
  1. GET with CAS（返回 value + cas_token）
  2. 修改 value
  3. SET with CAS（检查 cas_token 是否匹配）
     匹配 → 更新成功
     不匹配 → 重试（其他客户端已修改）

命令：
  gets key → 返回 value + cas_token
  cas key flags exptime bytes cas_unique [noreply]\r\n
  <data block>

适用：
  计数器（并发安全更新）
  购物车（并发修改）
  会话更新
  
注意：
  CAS 有性能开销（CAS miss 需重试）
  高并发场景权衡一致性 vs 性能
```

## Memcached Binary Protocol

```
Binary Protocol = 二进制协议（性能优于文本协议）

优势：
  解析更快（固定格式，无需文本解析）
  支持 CAS 操作
  支持 SASL 认证
  更紧凑的包头

帧格式：
  +--------+--------+--------+--------+--------+--------+
  | Magic  | Opcode | Key Len| Extras | VBucket| Total  |
  | 1 byte | 1 byte | 2 bytes| 1 byte | 2 bytes| 4 bytes|
  +--------+--------+--------+--------+--------+--------+
  | Status | Reserved| Body   | Key    | Value  |
  | 2 bytes| 2 bytes | Length |        |        |
  +--------+--------+--------+--------+--------+

Opcode:
  0x00: Get
  0x01: Set
  0x05: Delete
  0x0A: Increment
  0x0B: Decrement

启用：
  memcached -B binary  # 默认启用
```

## Caffeine Cache (W-TinyLFU)

### W-TinyLFU 淘汰算法

```
W-TinyLFU = Window TinyLFU（频率 + 新鲜度）

组成：
  Window Cache（1% 容量）: LRU，短期热点
  Main Cache（99% 容量）: Segmented LRU（sLRU）
    Probation（10%）: 新数据进入
    Protected（90%）: 高频数据保护

频率统计：
  Count-Min Sketch（4-bit 计数器）
  每个 key 4-bit 频率计数（最大 15）
  窗口衰减（定期老化，防止历史热点污染）

准入策略：
  新数据先入 Window
  要进入 Main → 频率 > Main 中最低频率
  → 自然淘汰低频数据，保留高频热点

对比：
  LRU: 只看时间，一次性热点会污染
  LFU: 只看频率，新热点进不来
  W-TinyLFU: 频率+新鲜度，兼顾两者
```

## Guava Cache

```java
// Guava Cache（老一代本地缓存）
LoadingCache<String, Object> cache = CacheBuilder.newBuilder()
    .maximumSize(10_000)
    .expireAfterWrite(5, TimeUnit.MINUTES)
    .expireAfterAccess(30, TimeUnit.MINUTES)
    .removalListener(notification -> log.info("Removed: {}", notification))
    .build(new CacheLoader<String, Object>() {
        @Override
        public Object load(String key) {
            return loadFromDb(key);
        }
    });

// 获取（自动回源）
Object value = cache.getUnchecked("key");

对比 Caffeine：
  Guava: LRU 淘汰，读有锁
  Caffeine: W-TinyLFU，读无锁，异步刷新
  新项目推荐 Caffeine
```

## Local Cache Patterns

### Cache-Aside（旁路缓存）

```java
// 读：先查缓存 → miss 查 DB → 回填缓存
public Object get(String key) {
    Object value = cache.getIfPresent(key);
    if (value != null) return value;
    
    value = db.query(key);
    cache.put(key, value);
    return value;
}

// 写：先更新 DB → 删缓存
public void update(String key, Object value) {
    db.update(key, value);
    cache.invalidate(key);
}
```

### Read-Through（读穿透）

```java
// 缓存自动加载（Caffeine CacheLoader）
Cache<String, Object> cache = Caffeine.newBuilder()
    .build(key -> db.query(key));  // 自动回源

// 使用：cache.get(key) 自动加载
```

### Write-Through（写穿透）

```java
// 写：缓存同步写 DB
Cache<String, Object> cache = Caffeine.newBuilder()
    .writer((key, value) -> db.upsert(key, value))  // 写 DB
    .build();

cache.put("key", value);  // 同时写缓存和 DB
```

### Write-Behind（异步写）

```java
// 写：缓存异步批量写 DB
Cache<String, Object> cache = Caffeine.newBuilder()
    .writer((key, value) -> {
        // 异步批量写入队列
        writeQueue.offer(new WriteOp(key, value));
    })
    .executor(executor)
    .build();

// 后台线程批量消费队列写 DB
```

## Cache Warming Strategies

```
缓存预热策略：

1. 启动时预热
   @PostConstruct
   public void warmup() {
       List<String> hotKeys = getHotKeys();
       hotKeys.forEach(key -> cache.get(key, this::loadFromDb));
   }

2. 定时预热
   @Scheduled(fixedRate = 300000)  // 5分钟
   public void refreshHotKeys() {
       List<String> hotKeys = getHotKeysFromAccessLog();
       hotKeys.forEach(key -> cache.get(key, this::loadFromDb));
   }

3. 访问时预热
   public Object getWithWarmup(String key) {
       Object value = cache.getIfPresent(key);
       if (value == null) {
           value = loadFromDb(key);
           cache.put(key, value);
       }
       return value;
   }

4. 预测预热
   根据历史访问模式预测热点
   提前加载即将成为热点的数据
```

## Thundering Herd Prevention

```
雷群效应（Thundering Herd）= 大量请求同时回源 DB

场景：
  热点 key 过期 → 大量请求同时 miss → 打爆 DB

解决方案：

1. 分布式锁（互斥重建）
   public Object getWithLock(String key) {
       Object value = cache.getIfPresent(key);
       if (value != null) return value;
       
       String lockKey = "lock:" + key;
       if (redis.setnx(lockKey, "1", 10, TimeUnit.SECONDS)) {
           try {
               value = db.query(key);
               cache.put(key, value);
           } finally {
               redis.del(lockKey);
           }
       } else {
           Thread.sleep(100);  // 等待其他线程重建
           return cache.getIfPresent(key);
       }
       return value;
   }

2. 永不过期 + 异步刷新
   cache.get(key, this::loadFromDb);  // 永不过期
   // 后台定时刷新热点数据

3. 随机过期时间
   int ttl = baseTtl + ThreadLocalRandom.current().nextInt(60);
   cache.put(key, value, ttl, TimeUnit.SECONDS);
```

## Cache Stampede Solutions

```
缓存穿透（Cache Stampede）= 雷群效应的变体

解决方案：

1. Singleflight（Go）
   // 同一 key 只有一个请求回源
   var g singleflight.Group
   value, err, _ := g.Do(key, func() (interface{}, error) {
       return db.Query(key)
   })

2. Java Singleflight
   private final ConcurrentHashMap<String, CompletableFuture<Object>> inflight = new ConcurrentHashMap<>();
   
   public Object get(String key) {
       Object value = cache.getIfPresent(key);
       if (value != null) return value;
       
       return inflight.computeIfAbsent(key, k -> 
           CompletableFuture.supplyAsync(() -> {
               try {
                   Object v = db.query(k);
                   cache.put(k, v);
                   return v;
               } finally {
                   inflight.remove(k);
               }
           })
       ).join();
   }

3. 提前重建
   // 缓存过期前 N 秒异步刷新
   cache.policy().refreshAfterWrite(4, TimeUnit.MINUTES);
   cache.policy().expireAfterWrite(5, TimeUnit.MINUTES);
```

## Redis vs Memcached Comparison

| 维度 | Redis | Memcached |
|------|-------|-----------|
| 数据类型 | String/Hash/List/Set/ZSet/Bitmap | 仅 String |
| 持久化 | RDB/AOF | 无 |
| 集群 | 主从+Cluster（官方） | 客户端一致性哈希 |
| 内存管理 | jemalloc | Slab Allocator |
| 线程模型 | 单线程事件循环 | 多线程（1.5+） |
| 分布式锁 | SETNX + Lua | CAS |
| 发布订阅 | Pub/Sub + Stream | 无 |
| Lua 脚本 | 支持 | 无 |
| 适用场景 | 缓存+数据结构+业务 | 纯 KV 缓存 |
| 性能 | 极高 | 极高（多核扩展好） |

## 九-2、Caffeine W-TinyLFU 与 LFU 近似算法详解

```
W-TinyLFU = Window TinyLFU（频率 + 新鲜度）

算法组成：
  Window Cache（1% 容量）：LRU，短期热点快速进入
  Main Cache（99% 容量）：Segmented LRU（sLRU）
    Probation（10%）：新数据进入，低频淘汰
    Protected（90%）：高频数据保护，不轻易淘汰

频率统计：
  Count-Min Sketch：4-bit 计数器（最大 15）
  每个 key 4-bit 频率计数（节省内存）
  窗口衰减：定期老化，防止历史热点污染

准入策略：
  新数据先入 Window Cache
  要进入 Main Cache → 频率 > Main 中最低频率
  → 自然淘汰低频数据，保留高频热点

对比传统 LFU：
  LFU：只看频率，新热点进不来
  LRU：只看时间，一次性热点会污染
  W-TinyLFU：频率+新鲜度，兼顾两者
  准确率接近 LFU，性能接近 LRU
```

## 九-3、Caffeine expireAfterWrite vs expireAfterAccess 选择

| 策略 | 行为 | 适用场景 |
|------|------|----------|
| expireAfterWrite | 写入后固定时间过期 | 防脏数据（如配置/缓存 DB 结果） |
| expireAfterAccess | 访问后重置过期时间 | 防热点被清（如用户 Session） |
| 两者组合 | 可叠加（取较短时间） | 热点数据 + 最大容忍时间 |

```
选择指南：
  数据会变化 → expireAfterWrite（保证最终一致性）
  数据不变但要保活 → expireAfterAccess（热点常驻）
  组合使用：
    expireAfterWrite(5min) + expireAfterAccess(30min)
    → 最长 5 分钟过期，热点可续命

refreshAfterWrite（异步刷新）：
  到期后后台异步刷新，旧值继续可用
  读不 miss，无回源抖动
  需配合 CacheLoader 使用
```

## 九-4、Guava Cache removalListener 异步通知

```java
LoadingCache<String, Object> cache = CacheBuilder.newBuilder()
    .maximumSize(10_000)
    .removalListener(notification -> {
        // 异步通知（不要做耗时操作）
        log.info("Removed: key={}, cause={}", 
            notification.getKey(), notification.getCause());
        // cause: SIZE/EVICTED/EXPIRED/REPLACED/EXPLICIT/INVALIDATION
    })
    .build(key -> loadFromDb(key));

// 注意：
// 1. removalListener 在删除时同步执行（会阻塞）
// 2. 需要异步 → 用 AsyncLoadingCache + 异步 listener
// 3. 通知时机：SIZE=容量满淘汰，EXPIRED=过期，EXPLICIT=手动删除
```

## 九-5、本地缓存分布式一致性问题

```
问题：
  每个实例本地缓存各自一份 → 数据变更后各实例不一致

解决方案：布隆过滤器 + TTL 组合策略

1. 布隆过滤器（Bloom Filter）
   - 快速判断 key 是否可能存在
   - 避免大量不存在的 key 打到 DB
   - 误判率可调（如 1%）

2. TTL 组合策略
   - 本地缓存短 TTL（如 30s）
   - 变更时广播失效（MQ/Redis Pub/Sub）
   - TTL 兜底：广播丢失时最多 30s 不一致

3. 版本号方案
   - 缓存带版本号
   - 查询时比较版本号，不匹配则回源
   - 版本号存 Redis/DB（全局递增）

4. Canal 订阅
   - DB binlog → Canal → 广播失效本地缓存
   - 最终一致（延迟秒级）
```

## 九-6、Redis 与本地缓存双写一致性方案（延迟双删）

```
延迟双删 = 保证 Redis 与 DB 最终一致

流程：
  1. 写入 DB（更新数据）
  2. 删除本地缓存（Caffeine）
  3. 删除 Redis 缓存
  4. 延迟 N 毫秒（如 500ms）
  5. 再次删除 Redis 缓存（防止并发读写脏数据）

为什么延迟双删：
  并发场景：线程 A 写 DB → 线程 B 读 Redis（旧值）→ 写本地缓存
  → 线程 A 删 Redis → 线程 B 的本地缓存已是旧值
  → 延迟后再删一次，确保最终一致

代码示例：
  public void update(String key, Object value) {
    db.update(key, value);
    localCache.invalidate(key);
    redis.del(key);
    Thread.sleep(500);  // 延迟
    redis.del(key);     // 二次删除
  }
```

## 九-7、缓存穿透/击穿/雪崩三件套完整代码

```java
// 1. 缓存穿透（查不存在的 key）→ 布隆过滤器 + 空值缓存
public Object getWithBloom(String key) {
    if (!bloomFilter.mightContain(key)) return null;  // 布隆过滤器拦截
    Object value = cache.getIfPresent(key);
    if (value == null) {
        value = db.query(key);
        if (value == null) {
            cache.put(key, NULL_VALUE);  // 空值缓存（短 TTL）
        } else {
            cache.put(key, value);
        }
    }
    return value;
}

// 2. 缓存击穿（热点 key 过期）→ 分布式锁重建
public Object getWithLock(String key) {
    Object value = cache.getIfPresent(key);
    if (value != null) return value;
    String lockKey = "lock:" + key;
    if (redis.setnx(lockKey, "1", 10, TimeUnit.SECONDS)) {
        try {
            value = db.query(key);
            cache.put(key, value);
        } finally {
            redis.del(lockKey);
        }
    } else {
        Thread.sleep(100);
        return cache.getIfPresent(key);
    }
    return value;
}

// 3. 缓存雪崩（大批 key 同时过期）→ 随机过期时间
public void putWithRandom(String key, Object value) {
    int ttl = baseTtl + ThreadLocalRandom.current().nextInt(60);
    cache.put(key, value, ttl, TimeUnit.SECONDS);
}
```

## 九-8、Caffeine W-TinyLFU 深度解析

### CountMinSketch 近似计数原理

```text
CountMinSketch（计数最小草图）：
  用于近似估算 key 的访问频率
  空间效率极高（4-bit 计数器）

  结构：
    4 个独立的哈希函数
    4 行计数器（每行 16KB）
    通过 4 次哈希取最小值估算频率

  原理：
    hash1(key) → row1[col1]++
    hash2(key) → row2[col2]++
    hash3(key) → row3[col3]++
    hash4(key) → row4[col4]++
    频率估算 = min(row1[col1], row2[col2], row3[col3], row4[col4])

  误判率：
    误判率 ≈ 1/(2^counter_bits) × 2
    实际测试：80%+ 命中率场景下，频率估算误差 <5%

  衰减机制：
    定期将所有计数器减半
    防止历史热点永久占用计数空间
    窗口衰减 = 新鲜度保障
```

### W-TinyLFU 三层架构

```text
W-TinyLFU = Window TinyLFU（频率 + 新鲜度）

组成：
  Window Cache（1% 容量）：LRU，短期热点快速进入
  Main Cache（99% 容量）：Segmented LRU（sLRU）
    Probation（10%）：新数据进入，低频淘汰
    Protected（90%）：高频数据保护，不轻易淘汰

准入策略：
  新数据先入 Window Cache
  要进入 Main Cache → 频率 > Main 中最低频率
  → 自然淘汰低频数据，保留高频热点

对比传统算法：
  LRU：只看时间，一次性热点会污染
  LFU：只看频率，新热点进不来
  W-TinyLFU：频率+新鲜度，兼顾两者
  准确率接近 LFU，性能接近 LRU
```

## 九-9、expireAfterWrite vs expireAfterAccess 决策树

```text
选择决策树：
  
  数据会频繁更新吗？
    ├─ 是 → expireAfterWrite（写入后过期）
    │    └─ 更新频率决定过期时间
    │        快速变化 → 短过期（10-60s）
    │        缓慢变化 → 长过期（5-30min）
    └─ 否 → expireAfterAccess（访问后过期）
         └─ 访问频率决定过期时间
             高频访问 → 长过期（5-30min）
             低频访问 → 短过期（1-5min）

组合使用：
  expireAfterWrite(5min) + expireAfterAccess(30min)
  → 最长 5 分钟过期，热点可续命
```

| 策略 | 行为 | 适用场景 |
|------|------|----------|
| expireAfterWrite | 写入后固定时间过期 | 防脏数据（如配置/缓存 DB 结果） |
| expireAfterAccess | 访问后重置过期时间 | 防热点被清（如用户 Session） |
| 两者组合 | 可叠加（取较短时间） | 热点数据 + 最大容忍时间 |

## 九-10、Guava Cache removalListener 异步通知

```java
// Guava Cache removalListener
LoadingCache<String, Object> cache = CacheBuilder.newBuilder()
    .maximumSize(10_000)
    .removalListener(notification -> {
        // cause: SIZE/EVICTED/EXPIRED/REPLACED/EXPLICIT/INVALIDATION
        log.info("Removed: key={}, cause={}", 
            notification.getKey(), notification.getCause());
    })
    .build(key -> loadFromDb(key));

// 注意：
// 1. removalListener 在删除时同步执行（会阻塞）
// 2. 需要异步 → 用 AsyncLoadingCache + 异步 listener
// 3. 批量异步通知用 ListeningExecutorService

// 批量异步通知（更高效）
ListeningExecutorService executor = MoreExecutors.newFixedThreadPool(4);
CacheBuilder.newBuilder()
    .removalListenerWithExecutor(executor, notification -> {
        asyncHandleEviction(notification);
    })
    .build();
```

## 九-11、本地缓存分布式一致性

### 延迟双删方案

```
延迟双删 = 保证 Redis 与 DB 最终一致

流程：
  1. 写入 DB（更新数据）
  2. 删除本地缓存（Caffeine）
  3. 删除 Redis 缓存
  4. 延迟 N 毫秒（如 500ms）
  5. 再次删除 Redis 缓存（防止并发读写脏数据）

为什么延迟双删：
  并发场景：线程 A 写 DB → 线程 B 读 Redis（旧值）→ 写本地缓存
  → 线程 A 删 Redis → 线程 B 的本地缓存已是旧值
  → 延迟后再删一次，确保最终一致
```

### Canal 订阅方案

```
Canal 订阅 DB binlog → 广播失效本地缓存

流程：
  1. MySQL binlog → Canal
  2. Canal 解析变更事件
  3. 广播失效本地缓存（MQ/Redis Pub/Sub）
  4. 本地缓存 TTL 兜底

优势：
  - 无代码侵入
  - 最终一致（延迟秒级）
  - 跨语言/跨服务
```

## 九-12、Redis 与本地缓存双写一致性

### 最终一致 vs 强一致

```text
最终一致方案（推荐）：
  写入流程：DB → 删除 Redis → 删除本地缓存
  读取流程：本地缓存 → Redis → DB
  一致性保证：通过延迟删除 + TTL 兜底

强一致方案（复杂）：
  写入流程：DB → 删除 Redis → 广播删除本地缓存
  读取流程：本地缓存 → Redis → DB
  一致性保证：通过消息广播 + 版本号

实现对比：
  最终一致：延迟双删 + Canal 监听 + TTL 兜底
  强一致：Redis 订阅 + 本地缓存版本号 + CAS 更新
```

## 九-13、缓存穿透击穿雪崩三件套代码

```java
// 1. 缓存穿透（查不存在的 key）→ 布隆过滤器 + 空值缓存
public Object getWithBloom(String key) {
    if (!bloomFilter.mightContain(key)) return null;  // 布隆过滤器拦截
    Object value = cache.getIfPresent(key);
    if (value == null) {
        value = db.query(key);
        if (value == null) {
            cache.put(key, NULL_VALUE);  // 空值缓存（短 TTL）
        } else {
            cache.put(key, value);
        }
    }
    return value;
}

// 2. 缓存击穿（热点 key 过期）→ 分布式锁重建
public Object getWithLock(String key) {
    Object value = cache.getIfPresent(key);
    if (value != null) return value;
    String lockKey = "lock:" + key;
    if (redis.setnx(lockKey, "1", 10, TimeUnit.SECONDS)) {
        try {
            value = db.query(key);
            cache.put(key, value);
        } finally {
            redis.del(lockKey);
        }
    } else {
        Thread.sleep(100);
        return cache.getIfPresent(key);
    }
    return value;
}

// 3. 缓存雪崩（大批 key 同时过期）→ 随机过期时间
public void putWithRandom(String key, Object value) {
    int ttl = baseTtl + ThreadLocalRandom.current().nextInt(60);
    cache.put(key, value, ttl, TimeUnit.SECONDS);
}
```

## 九-14、布隆过滤器误判率公式

```
布隆过滤器误判率公式：
  P ≈ (1 - e^(-kn/m))^k
  
  其中：
    m = 位数组大小（bit）
    n = 元素数量
    k = 哈希函数个数
  
  最优 k 值：
    k = (m/n) × ln(2)
  
  示例：
    预期 100 万元素，误判率 1%
    m = 100万 × 10 × ln(2) ≈ 693万 bit ≈ 866KB
    k = 7

  Guava 实现：
    BloomFilter.create(
      Funnels.stringFunnel(Charset.defaultCharset()),
      1000000,  // 预期元素数
      0.01      // 误判率
    )
```

## 九-15、一致性哈希虚拟节点

```
一致性哈希环（客户端实现）：

Key 哈希 → 环上位置 → 顺时针找最近节点
  增删节点只影响相邻 key（~1/N 数据迁移）

虚拟节点：
  每个真实节点 → M 个虚拟节点（均匀分布）
  默认 100-200 个虚拟节点/节点
  
  解决问题：
  ├── 物理节点少时数据倾斜
  ├── 异构硬件性能差异
  └── 增删节点影响范围更小

负载均衡因子：
  虚拟节点数越多，分布越均匀
  但内存开销增加（每个虚拟节点需维护路由表）
  
  推荐：100-200 个虚拟节点/物理节点
```

## Caffeine W-TinyLFU 深度解析

### 三层缓存架构

```
W-TinyLFU 三层架构：
  1. Window Cache（窗口缓存）：1% 容量，LRU 策略
     - 最近访问的数据进入 Window
     - 淘汰时进入 Probation

  2. Probation（试用区）：1% 容量，LFU 策略
     - 新数据在此试用
     - 命中后晋升到 Protected

  3. Protected（保护区）：98% 容量，LFU 策略
     - 高频数据在此存放
     - 淘汰时降级到 Probation

CountMinSketch 机制：
  - 4 个独立的哈希函数
  - 4 行计数器（每行 16KB）
  - 通过 4 次哈希取最小值估算频率
  - 支持增量更新和周期性衰减
```

### CountMinSketch 实现

```java
// CountMinSketch 频率估算
public class CountMinSketch {
    private final int width;
    private final int depth;
    private final int[][] table;
    private final HashFunction[] hashes;

    public void add(String item) {
        for (int i = 0; i < depth; i++) {
            int hash = hashes[i].hash(item);
            table[i][hash % width]++;
        }
    }

    public int estimate(String item) {
        int min = Integer.MAX_VALUE;
        for (int i = 0; i < depth; i++) {
            int hash = hashes[i].hash(item);
            min = Math.min(min, table[i][hash % width]);
        }
        return min;
    }
}
```

## expireAfterWrite vs Access 决策树

```mermaid
flowchart TD
    START[缓存过期策略选择] --> Q1{数据会频繁更新?}
    Q1 -->|是| Q2{更新频率?}
    Q1 -->|否| Q3{访问频率?}
    
    Q2 -->|快速变化| WRITE_SHORT[expireAfterWrite 10-60s]
    Q2 -->|缓慢变化| WRITE_LONG[expireAfterWrite 5-30min]
    
    Q3 -->|高频访问| ACCESS_LONG[expireAfterAccess 5-30min]
    Q3 -->|低频访问| ACCESS_SHORT[expireAfterAccess 1-5min]
    
    WRITE_SHORT -->|配置/热点商品| SCENE1[配置信息/热点商品]
    WRITE_LONG -->|用户信息| SCENE2[用户信息]
    ACCESS_LONG -->|会话/浏览记录| SCENE3[用户会话/浏览记录]
    ACCESS_SHORT -->|临时数据| SCENE4[临时数据]
```

### 过期策略对比

| 策略 | 说明 | 适用场景 | 优点 | 缺点 |
|------|------|---------|------|------|
| expireAfterWrite | 写入后过期 | 数据会更新 | 保证数据新鲜 | 可能过期过快 |
| expireAfterAccess | 访问后过期 | 数据不常更新 | 节省内存 | 可能数据过旧 |

## Guava removalListener 异步通知

```java
// 异步通知配置
CacheBuilder.newBuilder()
    .removalListener(notification -> {
        // 异步通知，不影响主逻辑
        log.info("key={} evicted, cause={}",
            notification.getKey(),
            notification.getCause());
        // 发送告警/统计
        metricsService.recordEviction(notification.getCause().name());
    })
    .build();

// 批量异步通知（更高效）
ListeningExecutorService executor = MoreExecutors.newFixedThreadPool(4);
CacheBuilder.newBuilder()
    .removalListenerWithExecutor(executor, notification -> {
        asyncHandleEviction(notification);
    })
    .build();
```

### removalListener 配置建议

```
removalListener 最佳实践：
  1. 使用异步执行器，避免阻塞主逻辑
  2. 设置队列大小限制，防止内存溢出
  3. 添加监控指标，统计淘汰原因
  4. 考虑使用 RemovalCause 枚举判断淘汰类型
```

## Redis 与本地缓存双写一致性

### 延迟双删 + Canal 监听

```java
// 延迟双删示例
public void updateWithDoubleDelete(String key, Object value) {
    cache.delete(key);           // 1. 先删缓存
    db.update(value);            // 2. 更新数据库
    Thread.sleep(500);           // 3. 延迟（等待读请求完成）
    cache.delete(key);           // 4. 再删缓存（兜底）
}

// Canal 监听配置
@CanalListener
public class CanalHandler {
    @UpdateListenPoint(schema = "mydb", table = "users")
    public void onUpdate(CanalEntry.RowData rowData) {
        String key = extractKey(rowData);
        cache.delete("user:" + key);
    }
}
```

### 一致性方案对比

| 方案 | 一致性 | 复杂度 | 性能 | 适用场景 |
|------|--------|--------|------|---------|
| TTL 收敛 | 弱一致 | 低 | 高 | 弱一致场景 |
| 消息失效 | 中一致 | 中 | 中 | 多实例场景 |
| Canal 订阅 | 强一致 | 中 | 中 | 数据库变更 |
| 版本号 | 强一致 | 高 | 中 | 强一致场景 |

## 缓存穿透/击穿/雪崩代码实现

```java
// 1. 布隆过滤器防穿透
BloomFilter<String> bloomFilter = BloomFilter.create(
    Funnels.stringFunnel(Charset.defaultCharset()),
    1000000,  // 预期元素数
    0.01      // 误判率
);

public Object getDataWithBloomFilter(String key) {
    if (!bloomFilter.mightContain(key)) {
        return null;  // 一定不存在
    }
    Object value = cache.getIfPresent(key);
    if (value != null) {
        return value;
    }
    value = db.query(key);
    if (value == null) {
        cache.put(key, NULL_VALUE);  // 空值缓存（短 TTL）
    } else {
        bloomFilter.put(key);        // 动态添加
        cache.put(key, value);
    }
    return value;
}

// 2. 互斥锁防击穿
public Object getDataWithMutex(String key) {
    Object value = cache.getIfPresent(key);
    if (value != null) {
        return value;
    }
    String lockKey = "lock:" + key;
    try {
        if (redis.setnx(lockKey, "1", 10, TimeUnit.SECONDS)) {
            value = db.query(key);
            cache.put(key, value);
            redis.del(lockKey);
            return value;
        } else {
            Thread.sleep(100);  // 等待
            return cache.getIfPresent(key);
        }
    } finally {
        redis.del(lockKey);
    }
}

// 3. 随机过期防雪崩
public void setWithRandomExpire(String key, Object value) {
    int baseExpire = 300;  // 5 分钟基础过期
    int randomExpire = ThreadLocalRandom.current().nextInt(0, 60);
    cache.policy().expireAfterWrite().put(key, value,
        baseExpire + randomExpire, TimeUnit.SECONDS);
}
```

### 三件套选型

```
缓存问题选型：
  穿透（查不存在）→ 布隆过滤器 + 空值缓存
  击穿（热点过期）→ 互斥锁 + 永不过期
  雪崩（批量过期）→ 随机过期 + 多级缓存
  数据不一致 → 延迟双删 + Canal 监听
```

## 缓存预热策略

### 预热时机与方式

| 预热方式 | 触发时机 | 适用场景 | 实现复杂度 |
|---------|---------|---------|-----------|
| 启动加载 | 应用启动 | 配置数据、字典表 | 低 |
| 定时刷新 | Cron 触发 | 准实时数据（分钟级） | 低 |
| 懒加载 + 空值缓存 | 首次访问 | 大部分场景 | 中 |
| 消息驱动 | MQ 通知 | 实时性要求高 | 高 |
| 预测性预热 | 基于历史流量模型 | 电商大促、秒杀 | 高 |

```java
// 启动预热示例
@PostConstruct
public void warmUp() {
    log.info("开始本地缓存预热...");
    long start = System.currentTimeMillis();
    
    // 加载热点数据
    List<String> hotKeys = redis.zrevrange("hot_keys", 0, 999);
    Map<String, Object> batchValues = redis.mget(hotKeys);
    
    batchValues.forEach((key, value) -> {
        if (value != null) {
            localCache.put(key, value);
        }
    });
    
    log.info("预热完成，加载 {} 条数据，耗时 {}ms",
        batchValues.size(), System.currentTimeMillis() - start);
}
```

## 缓存降级与容错

### 降级策略

```text
缓存降级优先级：
  L0：本地缓存命中 → 直接返回
  L1：Redis 命中 → 写入本地缓存 → 返回
  L2：Redis 失败 → 本地缓存旧值 → 返回（标记降级）
  L3：全部失败 → 返回默认值 / 熔断拒绝

触发条件：
  Redis 连续失败 N 次 → 自动切换到 L2
  Redis 超时率 > 阈值 → 本地缓存延长过期
  系统负载 > 阈值 → 关闭非核心缓存刷新
```

### 降级代码实现

```java
// 缓存降级处理器
public class CacheFallbackHandler<K, V> {
    private final Cache<K, V> localCache;
    private final RedisClient redis;
    private final AtomicBoolean degraded = new AtomicBoolean(false);
    private volatile long degradeStartTime;

    public V getWithFallback(K key, Function<K, V> dbLoader) {
        // L0: 本地缓存
        V value = localCache.getIfPresent(key);
        if (value != null) return value;

        // L1: Redis（降级期间跳过）
        if (!degraded.get()) {
            try {
                value = redis.get(key);
                if (value != null) {
                    localCache.put(key, value);
                    return value;
                }
            } catch (Exception e) {
                if (isCircuitBreakerTriggered(e)) {
                    triggerDegradation();
                }
            }
        }

        // L2: DB + 降级标记
        value = dbLoader.apply(key);
        if (value != null) {
            long ttl = degraded.get() ? 600 : 300; // 降级时延长本地缓存
            localCache.policy().expireAfterWrite().put(key, value,
                ttl, TimeUnit.SECONDS);
        }
        return value;
    }

    private void triggerDegradation() {
        if (degraded.compareAndSet(false, true)) {
            degradeStartTime = System.currentTimeMillis();
            // 30秒后自动尝试恢复
            scheduledExecutor.schedule(this::tryRecover, 30, TimeUnit.SECONDS);
        }
    }
}
```

## 缓存监控指标

### Prometheus 指标导出

```java
// Prometheus 指标导出
@Bean
public MeterBinder cacheMetrics(CaffeineCacheManager cacheManager) {
    return registry -> {
        cacheManager.getCacheNames().forEach(name -> {
            Cache<Object, Object> cache = cacheManager.getCache(name).getNativeCache();
            if (cache instanceof Caffeine) {
                Caffeine<Object, Object> caffeine = (Caffeine<Object, Object>) cache;
                Stats stats = caffeine.stats();

                Gauge.builder("cache_hit_rate", stats, s -> s.hitRate())
                    .tag("cache", name)
                    .register(registry);
                Gauge.builder("cache_eviction_count", stats, s -> s.evictionCount())
                    .tag("cache", name)
                    .register(registry);
                Gauge.builder("cache_load_duration_ms", stats,
                    s -> s.averageLoadPenalty() / 1_000_000)
                    .tag("cache", name)
                    .register(registry);
            }
        });
    };
}
```

### 监控指标对照表

| 指标名称 | 类型 | 说明 | 告警阈值 |
|---------|------|------|---------|
| hit_rate | Gauge | 命中率 | < 80% |
| miss_rate | Gauge | 失效率 | > 20% |
| eviction_count | Counter | 淘汰次数 | 增速过快 |
| size | Gauge | 当前缓存条目数 | 接近 maximumSize |
| load_count | Counter | 加载次数 | 异常增长 |
| average_load_penalty | Gauge | 平均加载耗时 | > 100ms |

## 与其他板块的关系

- 和「**基础知识/redis知识**」「**场景设计/多级缓存框架**」「**场景设计/缓存经典三问与一致性**」：本文是「本地 + Memcached」两翼，Redis 与多级缓存体系见那三篇。
- 和「**架构/高并发架构实战**」：本地缓存 + Redis 是秒杀/热点系统读路径的标准组合。
- 和「**技术选型/04-主流技术域选型对比**」：缓存域选型矩阵里有完整对比。

---

## 五、速查表

| 项 | 结论 |
|----|------|
| Memcached | 纯内存 KV、多线程、slab 分配器、客户端一致性哈希、无持久化 |
| Caffeine | 进程内缓存、W-TinyLFU、读无锁、异步刷新、命中率统计 |
| Guava Cache | 老牌本地缓存（LRU），新项目被 Caffeine 取代 |
| 缓存分层 | 本地（μs）→ 分布式（ms）→ DB；TTL/消息失效保一致 |
| 选型口诀 | 全局共享用 Redis/Memcached，单进程热点用 Caffeine，要快叠加多级 |
| 一句话 | 「缓存的另一半」——分布式缓存管共享，本地缓存管最快 |

---

## 六、Caffeine 高级配置

### 6.1 写入监听

```java
Cache<String, Object> cache = Caffeine.newBuilder()
    .removalListener((key, value, cause) -> {
        log.info("Key {} removed: {}", key, cause);
    })
    .build();
```

### 6.2 异步加载

```java
AsyncLoadingCache<String, Object> cache = Caffeine.newBuilder()
    .maximumSize(10_000)
    .expireAfterWrite(5, TimeUnit.MINUTES)
    .buildAsync(key -> loadFromDb(key));
```

### 6.3 权重淘汰

```java
Cache<String, Object> cache = Caffeine.newBuilder()
    .maximumWeight(100_000)
    .weigher((key, value) -> value.size())
    .build();
```

---

## 七、Memcached 运维命令

```bash
# 查看状态
echo "stats" | nc localhost 11211

# 查看所有 key
echo "stats cachedump 1 100" | nc localhost 11211

# 删除 key
echo "delete mykey" | nc localhost 11211

# 清空所有
echo "flush_all" | nc localhost 11211
```

### 7.1 多级缓存配置示例

```java
// Spring Boot 多级缓存
@Bean
public CacheManager cacheManager() {
    CaffeineCacheManager caffeineManager = new CaffeineCacheManager();
    caffeineManager.setCaffeine(Caffeine.newBuilder()
        .maximumSize(1000)
        .expireAfterWrite(5, TimeUnit.MINUTES));
    return caffeineManager;
}
```

---

## 八、缓存选型决策树

```
需要缓存？
  ├── 数据量小/单机热点 → Caffeine（本地）
  ├── 需要全局共享 → Redis（分布式）
  ├── 纯 KV 大缓存 → Memcached
  └── 混合场景 → 多级缓存（Caffeine + Redis）
```

---

## 九、缓存一致性方案

| 方案 | 说明 | 适用 |
|------|------|------|
| TTL 收敛 | 各层设合理 TTL | 弱一致 |
| 消息失效 | MQ 广播删除本地缓存 | 中一致 |
| Canal 订阅 | DB binlog → 删除缓存 | 强一致 |
| 版本号 | 缓存带版本号，不匹配则回源 | 强一致 |

---

## 十、多级缓存架构设计

```
请求 → 本地缓存（Caffeine）
  ├── 命中 → 返回（μs 级）
  └── miss → 分布式缓存（Redis）
    ├── 命中 → 回填本地缓存 → 返回（ms 级）
    └── miss → DB
      ├── 返回 → 回填 Redis + 本地缓存
      └── 写操作 → 更新 DB → 删除 Redis → 广播失效本地缓存
```

### 10.1 本地缓存配置建议

| 配置 | Caffeine | 说明 |
|------|----------|------|
| maximumSize | 1000-10000 | 按数据量调整 |
| expireAfterWrite | 5min | 写后过期 |
| refreshAfterWrite | 4min | 异步刷新 |
| recordStats | true | 命中率统计 |

### 10.2 分布式缓存配置建议

| 配置 | Redis | 说明 |
|------|-------|------|
| maxmemory | 60% 物理内存 | 预留系统内存 |
| maxmemory-policy | allkeys-lru | LRU 淘汰 |
| timeout | 3s | 连接超时 |
| tcp-keepalive | 60s | 保活 |

---

## 十一、缓存性能监控

| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| 命中率 | hit / (hit + miss) | <80% |
| 淘汰数 | evictions | 突增 |
| 连接数 | connected clients | >80% max |
| 内存使用 | used_memory | >80% maxmemory |
| 延迟 | latency | >1ms |

---

## 十二、缓存常见问题与解决

| 问题 | 原因 | 解决 |
|------|------|------|
| 缓存穿透 | 查不存在的 key | 布隆过滤器/空值缓存 |
| 缓存击穿 | 热点 key 过期 | 互斥锁/永不过期 |
| 缓存雪崩 | 大批 key 同时过期 | 随机过期时间 |

## Caffeine W-TinyLFU 与 LFU 近似算法详解

### CountMinSketch 近似计数

```text
W-TinyLFU 三层架构：
  1. Window Cache（窗口缓存）：1% 容量，LRU 策略
  2. Small LFU：1% 容量，LFU 策略
  3. Main Cache（主缓存）：98% 容量，LRU 策略

CountMinSketch 机制：
  - 4 个独立的哈希函数
  - 4 行计数器（每行 16KB）
  - 通过 4 次哈希取最小值估算频率
  - 支持增量更新和周期性衰减

近似精度：
  误判率 ≈ 1/(2^counter_bits) × 2
  实际测试：80%+ 命中率场景下，频率估算误差 <5%
```

```java
// Caffeine W-TinyLFU 配置
Cache<String, Object> cache = Caffeine.newBuilder()
    .maximumSize(10_000)
    .recordStats()  // 启用统计
    .build();

// 查看命中率
cache.stats().hitRate();     // 命中率
cache.stats().evictionCount(); // 淘汰次数
```

## expireAfterWrite vs expireAfterAccess 选择决策树

```text
选择决策树：
  
  数据会频繁更新吗？
    ├─ 是 → expireAfterWrite（写入后过期）
    │    └─ 更新频率决定过期时间
    │        快速变化 → 短过期（10-60s）
    │        缓慢变化 → 长过期（5-30min）
    └─ 否 → expireAfterAccess（访问后过期）
         └─ 访问频率决定过期时间
             高频访问 → 长过期（5-30min）
             低频访问 → 短过期（1-5min）

典型场景：
  expireAfterWrite：
    - 配置信息（5min 过期）
    - 用户信息（10min 过期）
    - 热点商品（30s 过期）
  
  expireAfterAccess：
    - 用户会话（30min 过期）
    - 浏览记录（1h 过期）
    - 购物车（2h 过期）
```

## Guava Cache removalListener 异步通知配置

```java
// 异步通知配置
CacheBuilder.newBuilder()
    .removalListener(notification -> {
        // 异步通知，不影响主逻辑
        log.info("key={} evicted, cause={}",
            notification.getKey(),
            notification.getCause());
        // 发送告警/统计
        metricsService.recordEviction(notification.getCause().name());
    })
    .build();

// 批量异步通知（更高效）
ListeningExecutorService executor = MoreExecutors.newFixedThreadPool(4);
CacheBuilder.newBuilder()
    .removalListenerWithExecutor(executor, notification -> {
        asyncHandleEviction(notification);
    })
    .build();
```

## 本地缓存热点 Key 识别与治理

### 热点 Key 检测方案

```text
热点 Key 识别流程：
  1. 客户端采样：记录每个 Key 的访问频次（LocalHashMap + 滑动窗口）
  2. Proxy 层聚合：汇总各节点采样数据，识别 Top-K 热点
  3. 实时告警：超过阈值（如 10万次/秒）触发告警
  4. 自动处理：本地缓存优先承载，回源加随机延迟
```

| 检测层级 | 实现方式 | 优点 | 缺点 |
|---------|---------|------|------|
| 客户端 | Guava StatisticsCounter | 无额外组件 | 仅本节点视角 |
| 代理层 | Twemproxy/Codis 统计 | 全局视角 | 增加代理开销 |
| Redis 监控 | MONITOR + 离线分析 | 精确 | 生产禁用 |
| 应用 APM | SkyWalking/Jaeger 采样 | 集成度高 | 采样率影响精度 |

### 热点 Key 治理策略

```java
// 本地缓存热点 Key 自动检测 + 随机过期防雪崩
public class HotKeyDetector<K, V> {
    private final Cache<K, V> localCache;
    private final AtomicLongMap<K> accessCount = AtomicLongMap.create();
    private final long hotThreshold = 10000; // 1万次/秒

    public V get(K key, Function<K, V> loader) {
        long count = accessCount.incrementAndGet(key);
        V value = localCache.getIfPresent(key);
        if (value != null) {
            return value;
        }
        // 热点 Key 加随机过期防雪崩
        long expireSeconds = count > hotThreshold
            ? 30 + ThreadLocalRandom.current().nextInt(60) // 30-90秒
            : 300; // 正常5分钟
        value = loader.apply(key);
        localCache.policy().expireAfterWrite().put(key, value,
            expireSeconds, TimeUnit.SECONDS);
        return value;
    }

    // 定期清零计数器（每分钟）
    @Scheduled(fixedRate = 60000)
    public void resetCounts() {
        accessCount.asMap().clear();
    }
}
```

## 本地缓存预热策略

### 预热时机与方式

```mermaid
flowchart TD
    A[应用启动] --> B{预热策略}
    B -->|启动时全量加载| C[适合小数据量 <10K]
    B -->|定时增量加载| D[适合中等数据量 <100K]
    B -->|访问时懒加载+TTL| E[适合大数据量]
    B -->|消息驱动预热| F[适合热点数据]
    C --> G[启动耗时增加]
    D --> H[定时任务开销]
    E --> I[首次访问延迟]
    F --> J[依赖消息中间件]
```

| 预热方式 | 触发时机 | 适用场景 | 实现复杂度 |
|---------|---------|---------|-----------|
| 启动加载 | 应用启动 | 配置数据、字典表 | 低 |
| 定时刷新 | Cron 触发 | 准实时数据（分钟级） | 低 |
| 懒加载 + 空值缓存 | 首次访问 | 大部分场景 | 中 |
| 消息驱动 | MQ 通知 | 实时性要求高 | 高 |
| 预测性预热 | 基于历史流量模型 | 电商大促、秒杀 | 高 |

```java
// 启动预热示例
@PostConstruct
public void warmUp() {
    log.info("开始本地缓存预热...");
    long start = System.currentTimeMillis();
    
    // 加载热点数据
    List<String> hotKeys = redis.zrevrange("hot_keys", 0, 999);
    Map<String, Object> batchValues = redis.mget(hotKeys);
    
    batchValues.forEach((key, value) -> {
        if (value != null) {
            localCache.put(key, value);
        }
    });
    
    log.info("预热完成，加载 {} 条数据，耗时 {}ms",
        batchValues.size(), System.currentTimeMillis() - start);
}
```

## 本地缓存降级与容错

### 降级策略

```text
缓存降级优先级：
  L0：本地缓存命中 → 直接返回
  L1：Redis 命中 → 写入本地缓存 → 返回
  L2：Redis 失败 → 本地缓存旧值 → 返回（标记降级）
  L3：全部失败 → 返回默认值 / 熔断拒绝

触发条件：
  Redis 连续失败 N 次 → 自动切换到 L2
  Redis 超时率 > 阈值 → 本地缓存延长过期
  系统负载 > 阈值 → 关闭非核心缓存刷新
```

| 降级级别 | 触发条件 | 数据来源 | 用户感知 |
|---------|---------|---------|---------|
| 正常 | 无故障 | 本地 → Redis → DB | 无 |
| 轻度 | Redis 偶发超时 | 本地 → 旧值 | 数据略有延迟 |
| 中度 | Redis 不可用 | 本地 → 默认值 | 数据明显滞后 |
| 重度 | DB 也不可用 | 默认值 / 拒绝服务 | 功能受限 |

```java
// 缓存降级处理器
public class CacheFallbackHandler<K, V> {
    private final Cache<K, V> localCache;
    private final RedisClient redis;
    private final AtomicBoolean degraded = new AtomicBoolean(false);
    private volatile long degradeStartTime;

    public V getWithFallback(K key, Function<K, V> dbLoader) {
        // L0: 本地缓存
        V value = localCache.getIfPresent(key);
        if (value != null) return value;

        // L1: Redis（降级期间跳过）
        if (!degraded.get()) {
            try {
                value = redis.get(key);
                if (value != null) {
                    localCache.put(key, value);
                    return value;
                }
            } catch (Exception e) {
                if (isCircuitBreakerTriggered(e)) {
                    triggerDegradation();
                }
            }
        }

        // L2: DB + 降级标记
        value = dbLoader.apply(key);
        if (value != null) {
            long ttl = degraded.get() ? 600 : 300; // 降级时延长本地缓存
            localCache.policy().expireAfterWrite().put(key, value,
                ttl, TimeUnit.SECONDS);
        }
        return value;
    }

    private void triggerDegradation() {
        if (degraded.compareAndSet(false, true)) {
            degradeStartTime = System.currentTimeMillis();
            // 30秒后自动尝试恢复
            scheduledExecutor.schedule(this::tryRecover, 30, TimeUnit.SECONDS);
        }
    }
}
```

## 本地缓存监控指标

### 核心监控指标

| 指标名称 | 类型 | 说明 | 告警阈值 |
|---------|------|------|---------|
| hit_rate | Gauge | 命中率 | < 80% |
| miss_rate | Gauge | 失效率 | > 20% |
| eviction_count | Counter | 淘汰次数 | 增速过快 |
| size | Gauge | 当前缓存条目数 | 接近 maximumSize |
| load_count | Counter | 加载次数 | 异常增长 |
| average_load_penalty | Gauge | 平均加载耗时 | > 100ms |
| eviction_weight | Gauge | 淘汰权重 | 异常波动 |

```java
// Prometheus 指标导出
@Bean
public MeterBinder cacheMetrics(CaffeineCacheManager cacheManager) {
    return registry -> {
        cacheManager.getCacheNames().forEach(name -> {
            Cache<Object, Object> cache = cacheManager.getCache(name).getNativeCache();
            if (cache instanceof Caffeine) {
                Caffeine<Object, Object> caffeine = (Caffeine<Object, Object>) cache;
                Stats stats = caffeine.stats();

                Gauge.builder("cache_hit_rate", stats, s -> s.hitRate())
                    .tag("cache", name)
                    .register(registry);
                Gauge.builder("cache_eviction_count", stats, s -> s.evictionCount())
                    .tag("cache", name)
                    .register(registry);
                Gauge.builder("cache_load_duration_ms", stats,
                    s -> s.averageLoadPenalty() / 1_000_000)
                    .tag("cache", name)
                    .register(registry);
            }
        });
    };
}
```

## 本地缓存分布式一致性问题

### 缓存更新策略对比

| 策略 | 实现 | 一致性 | 复杂度 | 适用场景 |
|------|------|--------|--------|----------|
| 延迟双删 | 删除→更新→延迟删除 | 最终一致 | 低 | 简单场景 |
| Canal 监听 | 监听 binlog 删除 | 最终一致 | 中 | 数据库变更 |
| MQ 广播 | 更新后发 MQ 删除 | 最终一致 | 中 | 多实例 |
| Redis Pub/Sub | 更新后广播删除 | 最终一致 | 低 | 轻量级 |

```java
// 延迟双删示例
public void updateWithDoubleDelete(String key, Object value) {
    cache.delete(key);           // 1. 先删缓存
    db.update(value);            // 2. 更新数据库
    Thread.sleep(500);           // 3. 延迟（等待读请求完成）
    cache.delete(key);           // 4. 再删缓存（兜底）
}
```

## Redis 与本地缓存双写一致性方案

### 最终一致 vs 强一致

```text
最终一致方案（推荐）：
  写入流程：DB → 删除 Redis → 删除本地缓存
  读取流程：本地缓存 → Redis → DB
  一致性保证：通过延迟删除 + TTL 兜底

强一致方案（复杂）：
  写入流程：DB → 删除 Redis → 广播删除本地缓存
  读取流程：本地缓存 → Redis → DB
  一致性保证：通过消息广播 + 版本号

实现对比：
  最终一致：延迟双删 + Canal 监听 + TTL 兜底
  强一致：Redis 订阅 + 本地缓存版本号 + CAS 更新
```

## 缓存穿透/击穿/雪崩三件套完整代码

```java
// 1. 布隆过滤器防穿透
BloomFilter<String> bloomFilter = BloomFilter.create(
    Funnels.stringFunnel(Charset.defaultCharset()),
    1000000,  // 预期元素数
    0.01      // 误判率
);

public Object getDataWithBloomFilter(String key) {
    if (!bloomFilter.mightContain(key)) {
        return null;  // 一定不存在
    }
    Object value = cache.getIfPresent(key);
    if (value != null) {
        return value;
    }
    value = db.query(key);
    if (value == null) {
        cache.put(key, NULL_VALUE);  // 空值缓存（短 TTL）
    } else {
        bloomFilter.put(key);        // 动态添加
        cache.put(key, value);
    }
    return value;
}

// 2. 互斥锁防击穿
public Object getDataWithMutex(String key) {
    Object value = cache.getIfPresent(key);
    if (value != null) {
        return value;
    }
    String lockKey = "lock:" + key;
    try {
        if (redis.setnx(lockKey, "1", 10, TimeUnit.SECONDS)) {
            value = db.query(key);
            cache.put(key, value);
            redis.del(lockKey);
            return value;
        } else {
            Thread.sleep(100);  // 等待
            return cache.getIfPresent(key);
        }
    } finally {
        redis.del(lockKey);
    }
}

// 3. 随机过期防雪崩
public void setWithRandomExpire(String key, Object value) {
    int baseExpire = 300;  // 5 分钟基础过期
    int randomExpire = ThreadLocalRandom.current().nextInt(0, 60);
    cache.policy().expireAfterWrite().put(key, value,
        baseExpire + randomExpire, TimeUnit.SECONDS);
}
```
| 数据不一致 | 缓存与 DB 不同步 | 延迟双删/Canal |

## 本地缓存生产部署与运维最佳实践

### 部署架构选型

| 架构模式 | 适用场景 | 组件配置 | 说明 |
|----------|---------|----------|------|
| 单机模式 | 开发测试 | 本地缓存 | 所有组件合一 |
| 集群模式 | 生产环境 | 多实例缓存 | 分布式缓存 |
| 多级缓存 | 高性能场景 | L1+L2+L3 | 多级缓存 |
| 云原生模式 | K8s | Operator部署 | 弹性伸缩 |

```mermaid
graph TB
    subgraph 多级缓存架构
        APP[应用] --> L1[本地缓存]
        L1 --> L2[Redis集群]
        L2 --> L3[数据库集群]
        
        subgraph 缓存组件
            CAFFEINE[Caffeine]
            GUAVA[Guava]
            REDIS[Redis]
        end
        
        L1 --> CAFFEINE
        L2 --> REDIS
    end
```

### 资源规划公式

| 资源类型 | 计算公式 | 推荐值 |
|----------|---------|--------|
| 本地缓存内存 | 热点数据量 × 2 | 按需 |
| Redis内存 | 总数据量 × 1.5 | 按需 |
| 连接池大小 | QPS / 响应时间 | 100+ |
| 缓存命中率 | 目标命中率 | >99% |
| 缓存过期时间 | 业务容忍度 | 5-30分钟 |

### 监控告警配置

```yaml
# Prometheus 告警规则
groups:
  - name: cache-alerts
    rules:
      - alert: CacheHitRateLow
        expr: cache_hit_rate < 0.95
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "缓存命中率过低"

      - alert: CacheHighMemoryUsage
        expr: cache_memory_usage > 0.8
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "缓存内存使用率过高"

      - alert: CacheHighEvictionRate
        expr: rate(cache_eviction_total[5m]) > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "缓存淘汰率过高"

      - alert: CacheRedisDown
        expr: up{job="redis"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Redis缓存宕机"
```

### 容灾备份策略

| 备份内容 | 备份方式 | 频率 | 保留期 |
|----------|---------|------|--------|
| 缓存配置 | Git版本控制 | 每次变更 | 永久 |
| 热点数据 | Redis RDB | 每日 | 7天 |
| 监控数据 | Prometheus | 15天 | 15天 |
| 日志数据 | 文件归档 | 每日 | 30天 |

### 故障恢复演练

| 演练场景 | 演练步骤 | 预期结果 | RTO |
|----------|---------|----------|-----|
| 本地缓存故障 | 模拟故障 | 降级到Redis | <10s |
| Redis故障 | 模拟Redis故障 | 降级到数据库 | <1min |
| 缓存雪崩 | 模拟大量Key过期 | 随机过期+互斥锁 | <5min |
| 缓存穿透 | 模拟不存在Key | 布隆过滤器+空值缓存 | <10s |

### 多租户资源隔离

```yaml
# 租户级缓存配置
tenants:
  - name: "tenant-a"
    cache:
      local:
        max-size: 10000
        expire-after-write: 300s
      redis:
        key-prefix: "tenant-a:"
        max-memory: 1GB

  - name: "tenant-b"
    cache:
      local:
        max-size: 20000
        expire-after-write: 600s
      redis:
        key-prefix: "tenant-b:"
        max-memory: 2GB
```

### 与微服务生态集成

```yaml
# Spring Cache配置
spring:
  cache:
    type: composite
    composite:
      caches:
        - name: localCache
          target: caffeine
          caffeine:
            maximum-size: 10000
            expire-after-write: 300s
        - name: distributedCache
          target: redis
          redis:
            time-to-live: 600000
            cache-null-values: false

# 缓存配置
cache:
  config:
    caffeine:
      spec: maximumSize=10000,expireAfterWrite=5m
    redis:
      time-to-live: 600000
      use-key-prefix: true
      key-prefix: "cache:"
```
