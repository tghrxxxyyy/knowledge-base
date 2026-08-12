# RocksDB / LevelDB 与嵌入式 KV 存储（LSM 底座）

> 你以为的「中间件」里，有一大半底层的存储引擎是 RocksDB：TiKV（TiDB）、Kafka（事务状态）、Flink（状态后端）、ClickHouse（部分索引）、很多图数据库。它是 **LSM-Tree 思想的最佳实践**。本篇讲「解决的问题 → LSM 原理 → 写入/读放大 → 应用盘点 → 面试必答」。

---

## 一、解决的问题与定位

**解决的问题**：嵌入式、高性能、可持久化的 KV 存储（key → value），要支撑**海量写入 + 随机读写均衡 + 磁盘友好**，能像库一样嵌进任何进程（不单独部署服务）。

**LevelDB**（Google 2011）：LSM-Tree 启蒙实现，单写线程；
**RocksDB**（Facebook 2013）：LevelDB 优化版——多线程压缩/写、列族（Column Family）、布隆过滤器、事务/快照、丰富调优参数。**当前嵌入式 KV 事实标准。**

**与 Redis/MongoDB 的本质区别**：

| 维度 | Redis | RocksDB/LevelDB |
|------|-------|-----------------|
| 定位 | 独立服务（内存） | **嵌入式引擎（库）**，被别的系统内置 |
| 存储 | 内存为主 | **磁盘持久化**（LSM） |
| 数据量 | GB~百 GB 级 | TB 级（磁盘为主） |
| 使用者 | 应用直连 | **TiDB/Kafka/Flink 等中间件内部** |

---

## 二、LSM-Tree 原理（核心面试点）

### 2.1 为什么不能直接随机写磁盘

- B+Tree（MySQL InnoDB）：随机写，每次更新都要写索引页 → 磁盘随机 IO 慢；
- **LSM 思路：把随机写转成顺序写**——写内存 + 批量刷盘。

### 2.2 写入路径（Write Path）

```
1. 写 WAL(预写日志, 顺序写磁盘) → 防宕机丢数据
2. 写入内存表 MemTable (跳表 SkipList, 有序)
3. MemTable 满 → 冻结 → 刷成 SSTable(有序文件) 到 L0
4. L0 文件多 → 后台合并(Compaction) → L1 → L2 → ... 每层越来越大
```

### 2.3 读取路径（Read Path）

```
1. 查 MemTable(最新) → 未中
2. 查布隆过滤器(每 SSTable 一个, 快速判断"文件里有没有这个 key") → 有才查
3. 从上到下逐层查 SSTable(每层内二分/跳表) → 合并返回最新版本
```

- **读放大**：一个 key 可能要查多层多个文件——布隆过滤器 + 层级合并把读成本压下来；
- **写放大**：一个 key 的更新被 Compaction 反复重写——用 Leveled 压缩（层数/大小配比）平衡。

> 一句话原理：**LSM = 内存写快 + 顺序刷盘 + 后台合并；用「读放大/写放大/空间放大」三个指标换「写吞吐极致」。**

---

## 三、Compaction 策略（生产调优关键）

| 策略 | 做法 | 特点 |
|------|------|------|
| Leveled | 每层大小指数增长，相邻层合并 | 读放大低、空间小；写放大中 |
| Tiered（Universal） | 同层多文件堆叠，满 N 个再合并 | 写放大低（写友好）；读放大高 |
| FIFO | 只管时间窗口，老文件直接删 | 适合日志类短期数据 |

**调优关注**：写密集 → Tiered 降写放大；读密集 → Leveled + 大布隆过滤器；内存给 MemTable 越大写越快但恢复慢。

---

## 四、谁在用 RocksDB（生态盘点，面试加分）

| 系统 | 用它做什么 |
|------|-----------|
| **TiKV/TiDB** | 底层存储引擎：Raft 多副本 + RocksDB 落盘 |
| **Kafka** | 事务状态（txn 状态存 RocksDB）+ 部分 KSQL |
| **Flink** | 增量状态后端（RocksDBStateBackend），大状态必备 |
| **CockroachDB** | Pebble（Go 重写的 RocksDB 风格 LSM） |
| **MyRocks** | MySQL 官方生态 RocksDB 存储引擎（写放大场景替代 InnoDB） |
| **图/向量库** | 部分图库（JanusGraph 等）与 Hudi/Iceberg 表服务 |

> 面试点：**「Flink 为什么用 RocksDB 做状态后端？」——大状态不落内存、增量 checkpoint、磁盘持久化、重启恢复快。**

---

## 五、面试高频追问

1. Q：LSM 为什么写快？ A：随机写转顺序写（WAL + 批量刷盘），无原地更新索引。
2. Q：读为什么慢？怎么优化？ A：多层级查询读放大——布隆过滤器拦截、层级压缩、缓存热块。
3. Q：RocksDB 和 LevelDB 区别？ A：RocksDB 多线程压缩/列族/布隆/事务/性能调优，工程化更全。
4. Q：为什么中间件爱用 RocksDB？ A：嵌入式（随进程部署）、TB 级磁盘持久化、写吞吐高、生态验证充分。
5. Q：什么是写放大？怎么降？ A：Compaction 反复重写数据；用 Tiered 压缩或调大目标层大小。

---

## 六、速查表

| 主题 | 一句话 |
|------|--------|
| 定位 | 嵌入式磁盘 KV 引擎（LSM-Tree 实践） |
| 写入 | WAL + MemTable + 刷 SSTable + 后台 Compaction |
| 读取 | MemTable → 布隆过滤 → 逐层 SSTable |
| 三放大 | 读/写/空间放大是 LSM 核心权衡 |
| 应用 | TiKV/Kafka/Flink/CockroachDB 的底座 |

---

## 七、与其他板块的关系

- TiDB 原理见「[TiDB 与 NewSQL](./TiDB与NewSQL.md)」；Kafka 事务见「[Kafka](./Kafka.md)」；
- Flink 状态后端见「[Apache Flink 流处理](./ApacheFlink流处理.md)」；
- 与「基础知识/mysql知识」（B+Tree 行存）对照理解两种存储世界观。

> 一句话：**RocksDB = 中间件里的「地基砖」：LSM 顺序写让写吞吐拉满，布隆+合并让读可控，嵌入式让 TiDB/Kafka/Flink 拿它当存储心脏——面试问 LSM，从写路径、三放大、生态三大块答。**