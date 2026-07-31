# Redis 源码精读

## 〇、本体介绍

**Redis** 是单线程事件驱动的内存 KV 数据库（网络 IO + 命令执行单线程，6.0 后网络 IO 多线程）。源码以**极致性能与内存节约**为设计目标：自定义字符串、压缩结构、跳表、IO 多路复用。

**为什么读源码**：理解「为什么快」「为什么是近似 LRU」「过期键怎么删」「持久化如何不阻塞」——这些面试与调优都绕不开。

**核心对象**：`redisObject`（类型+编码+LRU+引用计数）、`SDS`（简单动态字符串）、`ziplist/listpack`、`skiplist`、`dict`（哈希表）、`intset`、`quicklist`。

---

## 一、redisObject 与编码

每个 Value 都是 `redisObject`：
- `type`：string/list/hash/set/zset。
- `encoding`：底层编码（如 string 可是 int / embstr / raw；hash 可是 ziplist/listpack / hashtable）。
- `refcount`：引用计数（共享对象、0 表示待回收）。
- `lru`：`lru` 时钟或 `lfu` 计数，用于淘汰。

> **编码随数据规模升级/降级**：小 hash 用 listpack（省内存），超阈值转 hashtable。这是 Redis「省内存」的关键。

---

## 二、SDS（Simple Dynamic String）

- 结构：`len`（已用）、`alloc`（容量）、`flags`（类型）、`buf[]`。
- 相比 C 字符串：**O(1) 取长度**、**二进制安全**（不靠 `\0`）、**预分配/惰性释放**减少重分配。
- `embstr`：≤44 字节时与 redisObject 连续分配，一次 malloc，省一次寻址。

---

## 三、跳表（Skiplist，zset 底层）

- zset 同时用 **dict（按 member 查 score O(1)）** + **skiplist（按 score 范围/排名 O(log n)）** 两份结构，共享对象。
- 跳表每层随机层数（幂次概率），平均 O(log n) 查找/插入/删除，实现比红黑树简单，且**范围遍历友好**。
- 面试常问：为什么 zset 用跳表不用红黑树？答：范围查询方便、实现简单、内存可控、缓存局部性尚可。

---

## 四、过期删除策略（三种配合）

1. **惰性删除**：访问 key 时才检查过期（`expireIfNeeded`），过期则删——对 CPU 友好但对内存不友好。
2. **定期删除**：`activeExpireCycle` 每 100ms 抽样部分带过期 key 的 db，删掉过期的，控制时长（25% CPU 上限）防阻塞。
3. **内存淘汰（maxmemory-policy）**：内存到上限时按策略淘汰：noeviction（拒写）、allkeys-lru / volatile-lru（近似 LRU）、allkeys-lfu / volatile-lfu、allkeys-random、volatile-ttl。近似 LRU 用 `lru` 时钟随机采样，非全局精确。

---

## 五、持久化：RDB 与 AOF

- **RDB**（快照）：`fork()` 子进程写二进制快照（COW 写时复制省内存），恢复快、体积小，但可能丢最近数据；`bgsave` 不阻塞主线程。
- **AOF**（追加日志）：每条写命令追加，可 `always/everysec/no` 落盘；重写（BGREWRITEAOF）压缩日志。
- **混合持久化**（4.0+）：AOF 重写时先写 RDB 再追增量，兼顾恢复速度与少丢数据。

---

## 六、事件驱动与 IO 多路复用

- 主线程基于 **Reactor**：`aeApi`（Linux 用 epoll）监听文件事件 + 时间事件。
- 命令执行**单线程**，避免锁竞争；6.0 引入 **IO 多线程**（仅网络读写多线程，命令执行仍单线程），提升大值吞吐。

---

## 七、其他高频结构

- **dict（哈希表）**：两个表 + rehash（渐进式，每次增删改顺带迁移，防一次性阻塞）；负载因子 >1 且可扩 / >5 必扩。
- **quicklist**：list 底层 = ziplist 串成的双向链表，平衡连续内存与拆分。
- **bloom / hyperloglog / bitmap / GEO**：基于位数组与 geohash 的紧凑结构。

---

## 八、与其他板块的关系

- **中间件 / Redis 知识**（基础知识）：命令/场景层。
- **算法 / 跳表、位运算**：zset 跳表、hyperloglog 位运算。
- **并发编程**：单线程无锁模型 vs 多线程；IO 多路复用思想。

---

## 九、速查表

| 结构 | 底层 | 用途 |
|------|------|------|
| string | int/embstr/raw(SDS) | KV、计数、缓存 |
| hash | listpack→hashtable | 对象 |
| list | quicklist | 队列 |
| set | intset→dict | 去重 |
| zset | dict+skiplist | 排行榜 |
| 过期 | 惰性+定期+淘汰 | 内存管理 |

---

## 面试高频问题（20+ 条）

1. **Redis 为什么快？** 内存操作、单线程无锁、IO 多路复用(epoll)、高效结构(SDS/跳表)。
2. **为什么单线程还不够慢？** 瓶颈在内存与网络而非 CPU；单线程免锁、免上下文切换。
3. **6.0 多线程改了什么？** 网络 IO 多线程（读写），命令执行仍单线程。
4. **redisObject 含哪些字段？** type/encoding/refcount/lru(lfu)。
5. **为什么用 SDS 不用 C 字符串？** O(1)长度、二进制安全、预分配惰性释放。
6. **embstr 是什么？** ≤44B 时对象与 SDS 一次分配，省寻址。
7. **zset 为什么用跳表？** 范围查询方便、实现简单、内存可控；配合 dict 查 score。
8. **为什么不用红黑树做 zset？** 跳表范围遍历更简单、缓存友好、实现成本低。
9. **过期键怎么删？** 惰性（访问时删）+ 定期（抽样删）+ 内存淘汰兜底。
10. **定期删除会阻塞吗？** 控制单次时长（~25% CPU），渐进不阻塞。
11. **近似 LRU 是什么？** 用 lru 时钟随机采样淘汰，非全局精确，省内存。
12. **maxmemory-policy 有哪些？** noeviction/lru/lfu/random/ttl，配 allkeys/volatile。
13. **RDB 原理？** fork 子进程写快照(COW)，恢复快、体积小、可能丢最近。
14. **AOF 原理？** 追加写命令，always/everysec/no；重写压缩。
15. **混合持久化？** AOF 重写先 RDB 再追增量，兼顾速度少丢。
16. **fork 的 COW 是什么？** 写时复制，父子共享页，写才拷贝，省内存。
17. **dict 怎么扩容/rehash？** 负载因子>1 扩、>5 必扩；渐进式 rehash 防阻塞。
18. **Redis 是线程安全吗？** 命令执行单线程，天然无并发问题；多键操作需事务/lua 保原子。
19. **IO 多路复用是什么？** 单线程用 epoll 同时管多连接，非阻塞。
20. **bigkey 危害？** 删除/遍历阻塞、网络拥塞；应拆分。
21. **quicklist 是什么？** list 底层，ziplist 串双向链表，平衡内存与拆分。
22. **缓存与 Redis 源码关系？** 见 Redis 知识；过期/淘汰策略直接决定缓存命中与内存。
