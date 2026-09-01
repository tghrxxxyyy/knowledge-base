# Redis 核心数据结构源码要点

> Redis 以"高性能 KV + 丰富数据结构"著称。其精髓在于：**统一的对象系统（redisObject）+ 底层多种编码按需切换 + 内存友好的结构（SDS/dict/skiplist/quicklist）**。

## 1. 对象系统：redisObject

所有键值对的值都是 `redisObject`，含类型、编码、引用计数、LRU 时钟：

```
type: string / list / hash / set / zset
encoding: raw / int / ht / ziplist / linkedlist / skiplist / intset / quicklist / listpack
refcount: 引用计数（共享/回收）
```

同一 `type` 可有多种 `encoding`，Redis 在内存与性能间权衡自动选择（如小 Hash 用 listpack，大了转 hashtable）。

## 2. SDS：安全字符串

相比 C 字符串（`\0` 结尾、二进制不安全、O(n) 长度）：

| 维度 | C string | SDS |
|------|----------|-----|
| 长度获取 | O(n) | O(1)（存了 len） |
| 二进制安全 | 否（遇\0截断） | 是 |
| 缓冲区溢出 | 易 | 预分配+惰性空间 |
| 修改开销 | 频繁 alloc | 空间预分配/惰性释放 |

SDS 结构：`len`（已用）、`alloc`（总分配）、`flags`、`buf[]`。扩容采用**小于 1MB 翻倍、大于 1MB 加 1MB** 策略。

## 3. 字典 dict：渐进式 rehash

Hash 类型底层之一，类似 Java HashMap 但**扩容不一次性完成**：

- 两个哈希表 `ht[0]`、`ht[1]`。
- 扩容触发（`load factor >= 1`，或 `>=5` 强制）：分配 `ht[1]` 为 `ht[0]` 两倍。
- **渐进式 rehash**：每次增删改查顺手搬运一个 bucket，避免卡顿；`rehashidx` 记录进度。
- 期间读会查两张表，写只写 `ht[1]`，保证最终收敛。

## 4. 跳表 zskiplist：有序集合核心

ZSet 在元素多时用 `skiplist + dict`：

- 多层有序链表，平均 O(log n) 查找/插入/删除。
- 节点随机层数（幂次分布，约 1/4 上升一层），期望层数 1/(1-p)。
- `dict` 存 `member→score` 便于 O(1) 查分；`skiplist` 支持按分范围遍历与排名。
- 范围查询（`ZRANGEBYSCORE`）靠跳表正向扫描，性能远胜树遍历。

## 5. 压缩列表 listpack 与 quicklist

- **ziplist（旧）**：连续内存紧凑存储，省内存但修改需整体重分配，大列表性能差。
- **listpack（新，7.0+ 取代 ziplist）**：解决 ziplist 级联更新问题，元素自包含长度，无前驱依赖。
- **quicklist**：List 类型的底层，将 ziplist/listpack 以**双向链表**串联，兼顾连续存储与增减效率，可配置 `list-max-listpack-size`。

## 6. 过期删除策略

Redis 采用**惰性删除 + 定期删除**组合：

- **惰性删除**：访问 key 时若过期则删（省 CPU，但可能堆积）。
- **定期删除**：`activeExpireCycle` 周期性随机抽 20 个带过期 key，删除过期者，超过 25% 过期则继续本轮（限制 CPU 上限 `hz`）。
- 内存淘汰（maxmemory-policy）：`noeviction`/`allkeys-lru`/`volatile-lru`/`allkeys-lfu`/`volatile-ttl` 等。

## 7. 持久化：RDB 与 AOF

- **RDB**：某时刻全量快照，`fork` 子进程写，体积小、恢复快，但可能丢最后一次快照后数据。
- **AOF**：追加写命令日志，`appendfsync` 控制刷盘（`always`/`everysec`/`no`）；`rewrite` 压缩（BGREWRITEAOF 生成最小命令集）。
- **混合持久化**（4.0+）：AOF 重写时先写 RDB 头再追加增量 AOF，兼顾速度与数据安全。

## 8. 常见坑与误区

1. **大 Key**：单个 Hash/List 存百万元素，删除/迁移阻塞主线程 → 用 `UNLINK` 异步删、拆小。
2. **热 Key**：某 key 访问集中打满单分片 → 本地缓存/多副本/分片打散。
3. **keys \***：阻塞式全量扫描，生产用 `SCAN` 游标迭代。
4. **过期时间被覆盖**：`SET` 会清除原 TTL，需 `SET ... KEEPTTL`（Redis 6.0+）。
5. **Lua 脚本超时**：`EVAL` 长脚本阻塞，设 `lua-time-limit` 并避免长事务。
6. **缓存与 DB 一致性**：先更新 DB 再删缓存（Cache-Aside），配合延时双删。
7. **内存碎片**：`INFO memory` 看 `mem_fragmentation_ratio`，过高可 `activedefrag`。

## 9. 面试高频点

- 为什么 ZSet 用跳表而非红黑树？范围查询友好、实现简单、内存可控。
- 渐进式 rehash 解决的问题？避免一次性搬迁阻塞服务。
- 缓存穿透/击穿/雪崩？空值缓存/互斥锁/随机过期 + 多级缓存。
- RDB 与 AOF 取舍？RDB 快恢复小，AOF 更安全，混合最佳。
