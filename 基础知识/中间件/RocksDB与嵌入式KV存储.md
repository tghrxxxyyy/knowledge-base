# RocksDB 与嵌入式 KV 存储

> **核心认知**：RocksDB 是 Facebook 开源的高性能嵌入式 KV 存储引擎，基于 Google LevelDB 架构优化。它不是独立的数据库服务，而是作为库嵌入到应用程序中，为 TiKV、CockroachDB、Kafka Streams 等分布式系统提供本地存储能力。理解 LSM-Tree 架构是理解 RocksDB 性能特性的关键。

## 要解决的问题

| 问题 | 传统 B-Tree 的痛点 | RocksDB/LSM-Tree 的解法 |
|------|-------------------|-------------------------|
| 写入性能 | 随机写磁盘，性能差 | 顺序写 WAL + MemTable |
| 写放大 | 页分裂产生额外写入 | 后台 Compaction 合并 |
| 存储效率 | 页填充浪费空间 | 变长 KV，紧凑存储 |
| 压缩 | 页级压缩粒度粗 | Block 级压缩，粒度细 |
| 高并发写 | 锁竞争严重 | 无锁 MemTable + ConcurrentMemTable |

## LSM-Tree 架构

### 核心数据结构

```
RocksDB 写入路径：
  1. 写入 WAL（Write-Ahead Log）→ 持久化
  2. 写入 MemTable（内存）→ 无锁跳表
  3. MemTable 满 → 转换为 Immutable MemTable
  4. Immutable MemTable → Flush 到 SST 文件（L0）
  5. 后台 Compaction → 合并到更高级别（L1-L6）

  L0: [SST] [SST] [SST]  ← Flush 产生，可能有重叠
  L1: [  SST  ][  SST  ][  SST  ]  ← 无重叠
  L2: [    SST    ][    SST    ][    SST    ][    SST    ]
  L3: ...
  L6: [           SST            ][           SST            ]  ← 最大级别
```

### Compaction 策略

| 策略 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| Leveled | L1 到 L6 逐级合并 | 读放大低 | 写放大高 |
| Universal | 全局合并 | 写放大低 | 读放大高 |
| FIFO | 按时间淘汰 | 简单 | 不支持更新 |

### Leveled Compaction 详解

```
L0 → L1 Compaction：
  L0 文件与 L1 文件有重叠 → 合并

L1 → L2 Compaction：
  选择一个 L1 文件 → 找到所有重叠的 L2 文件 → 合并

关键参数：
  max_bytes_for_level_base: L1 大小限制（默认 256MB）
  max_bytes_for_level_multiplier: 层级倍数（默认 10）
  target_file_size_base: 单个 SST 文件大小（默认 64MB）
  max_background_compactions: 并发 Compaction 线程数
```

## 核心特性

### 1. MemTable 类型

| 类型 | 数据结构 | 适用场景 |
|------|----------|----------|
| SkipList | 跳表 | 通用场景（默认） |
| HashSkipList | 哈希 + 跳表 | 前缀查询 |
| Vector | 数组 | 只追加，不可更新 |
| FixLength | 定长数组 | 定长 KV |
| HashLinkList | 哈希 + 链表 | 低内存场景 |

### 2. Column Family

```
Column Family（列族）：
  ├── 独立的 MemTable 和 SST 文件
  ├── 共享 WAL 文件
  ├── 独立的 Compaction 配置
  └── 独立的统计信息

应用场景：
  ├── 不同业务数据隔离
  ├── 不同访问模式优化
  └── 独立的压缩策略
```

### 3. 前缀迭代

```
# 前缀 Bloom Filter + 前缀迭代器
options.prefix_extractor = SliceTransform::CreateFixedPrefix(4);

# 只扫描前缀匹配的 KV，避免全表扫描
for (auto it = db->NewIterator(); it->Seek(prefix); it->Valid(); it->Next()) {
    if (!it->key().starts_with(prefix)) break;
    // 处理 KV
}
```

### 4. 事务支持

```
# 乐观事务
Transaction* txn = db->BeginTransaction(write_options);
txn->Put("key1", "value1");
txn->Put("key2", "value2");
Status s = txn->Commit();  // 原子提交

# 悲观事务（支持冲突检测）
TransactionOptions txn_options;
txn_options.lock_timeout = 100;  // 锁等待超时
Transaction* txn = db->BeginTransaction(write_options, txn_options);
```

## 嵌入式 KV 存储生态

| 存储引擎 | 语言 | 架构 | 适用场景 |
|----------|------|------|----------|
| RocksDB | C++ | LSM-Tree | 通用高性能存储 |
| LevelDB | C++ | LSM-Tree | 简单 KV 场景 |
| Pebble | Go | LSM-Tree | Go 生态 |
| BoltDB | Go | B+Tree | 小数据量、单机 |
| BadgerDB | Go | LSM-Tree | Go 高性能 KV |
| SQLite | C | B-Tree | 嵌入式关系型 |
| LMDB | C | B+Tree | 读密集场景 |
| WiredTiger | C++ | B-Tree/LSM | MongoDB 存储引擎 |

## RocksDB 作为存储引擎的应用

```
分布式数据库：
  ├── TiKV：RocksDB 存储每个 Region 的数据
  ├── CockroachDB：RocksDB 存储每个 Range 的数据
  ├── YugabyteDB：RocksDB 存储 DocDB
  └── OceanBase：自研存储引擎（类 LSM-Tree）

消息系统：
  ├── Kafka：日志段存储（传统方案）
  ├── RocksDB：Kafka Streams 状态存储
  └── Pulsar：BookKeeper 存储

缓存系统：
  ├── MyRocks：MySQL 存储引擎（替代 InnoDB）
  └── Dgraph：RQL 查询结果存储
```

## 性能调优

### 关键配置参数

| 参数 | 默认值 | 说明 | 调优建议 |
|------|--------|------|----------|
| write_buffer_size | 64MB | MemTable 大小 | 写密集调大 |
| max_write_buffer_number | 2 | MemTable 数量 | 并发写调大 |
| level0_file_num_compaction_trigger | 4 | L0 文件数触发 Compaction | 根据写入量调整 |
| max_bytes_for_level_base | 256MB | L1 大小 | 根据数据量调整 |
| target_file_size_base | 64MB | SST 文件大小 | 根据数据量调整 |
| compression | Snappy | 压缩算法 | 通用 Snappy，冷数据 LZ4/ZSTD |

### 写优化

```
写密集场景优化：
  1. write_buffer_size 调大（减少 Flush 频率）
  2. max_write_buffer_number 调大（并发写）
  3. level0_file_num_compaction_trigger 调大（减少 Compaction）
  4. 使用 AdaptiveMutex（减少锁竞争）
  5. 开启 periodic Compaction（避免数据过期）
```

### 读优化

```
读密集场景优化：
  1. bloom_bits_per_key 调大（减少无效查找）
  2. block_cache 调大（缓存热数据块）
  3. cache_index_and_filter_blocks 开启（索引缓存）
  4. max_open_files 调大（减少文件打开）
  5. 使用 Prefix Bloom（前缀查询）
```

## 常见陷阱

| 陷阱 | 后果 | 正确做法 |
|------|------|----------|
| Compaction 跟不上写入 | L0 文件堆积，读性能下降 | 增加 Compaction 线程 |
| 不设 Block Cache | 频繁磁盘 IO | 根据内存设置合适的缓存 |
| 不做压缩 | 存储空间浪费 | 启用 Snappy/LZ4 压缩 |
| 随机读太多 | LSM-Tree 性能差 | 使用前缀查询优化 |
| 不监控 Compaction | 磁盘空间不足 | 监控 L0 文件数和磁盘使用 |


## RocksDB Write Buffer Manager

```
Write Buffer Manager (WBM) 作用：
  控制 MemTable 占用的总内存，防止 OOM

  工作原理：
    1. 所有 CF 的 MemTable 共享一个内存预算
    2. 当总内存超过预算时，触发 MemTable Flush
    3. 避免单个 CF 独占过多内存

  配置方式：
    write_buffer_manager = new WriteBufferManager(
        budget_bytes,          // 内存预算（如 256MB）
        cache,                 // 可选，共享 BlockCache
        allow_stall             // 内存超限时是否阻塞写入
    )
```

```cpp
// Write Buffer Manager 配置示例
#include "rocksdb/write_buffer_manager.h"

// 创建 256MB 的 Write Buffer Manager
auto wbm = std::make_shared<WriteBufferManager>(256 * 1024 * 1024);

// 应用到所有 Column Family
options.write_buffer_manager = wbm;

// 每个 CF 的 MemTable 不再独立控制
// 而是共享 256MB 内存预算

// 关键行为：
//   当总 MemTable 内存 > 256MB 时：
//     1. 触发最大的 MemTable Flush
//     2. 如果 allow_stall=true，阻塞写入直到内存释放
//     3. 如果 allow_stall=false，继续写入但可能 OOM
```

```
WBM 参数调优：
  ├── budget 大小：设为总可用内存的 25-50%
  ├── allow_stall：生产环境建议 true（防止 OOM）
  ├── 与 BlockCache 共享：减少总内存占用
  └── 监控指标：write_buffer_manager->memory_usage()
```

## RocksDB Block Cache 调优

```
Block Cache 作用：
  缓存 SST 文件中的数据块（Data Block），减少磁盘 IO

  配置参数：
    block_cache_size: Block Cache 大小（推荐总内存的 30-50%）
    num_shard_bits: 分片数量（推荐 6，即 64 个分片）
    cache_index_and_filter_blocks: 是否缓存索引和布隆过滤器块
    high_pri_pool_ratio: 高优先级池比例（默认 0）

  分片策略：
    ┌──────────────────────────────────────┐
    │           Block Cache                │
    │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐   │
    │  │Shard│ │Shard│ │Shard│ │Shard│   │
    │  │  0  │ │  1  │ │  2  │ │  3  │   │
    │  └─────┘ └─────┘ └─────┘ └─────┘   │
    │  每个 Shard 独立 LRU，减少锁竞争      │
    └──────────────────────────────────────┘
```

```cpp
// Block Cache 高级配置
BlockBasedTableOptions table_options;

// 1. 基础配置
table_options.block_cache = NewLRUCache(4ULL * 1024 * 1024 * 1024);  // 4GB
table_options.block_cache->SetCapacity(4ULL * 1024 * 1024 * 1024);

// 2. 缓存索引和布隆过滤器（减少 IO）
table_options.cache_index_and_filter_blocks = true;
table_options.cache_index_and_filter_blocks_with_high_priority = true;
table_options.pin_l0_filter_and_index_blocks_in_cache = true;

// 3. 预留空间（防止 Cache 满了后频繁淘汰）
table_options.block_cache->SetHighPriorityPoolRatio(0.4);  // 40% 高优先级

// 4. 监控 Cache 使用
size_t usage = table_options.block_cache->GetUsage();
size_t capacity = table_options.block_cache->GetCapacity();
double hit_rate = table_options.block_cache->GetHitRate();

// 关键指标：
//   hit_rate > 0.9：Cache 命中率高，配置合理
//   hit_rate < 0.7：需要增大 Cache 或优化访问模式
```

```
Block Cache 调优建议：
  读密集场景：
    ├── 增大 block_cache_size（50%+ 内存）
    ├── 开启 cache_index_and_filter_blocks
    ├── 开启 pin_l0_filter_and_index_blocks_in_cache
    └── high_pri_pool_ratio = 0.4

  写密集场景：
    ├── 减小 block_cache_size（20-30% 内存）
    ├── 关闭 cache_index_and_filter_blocks（减少写放大）
    └── 优先保证 Write Buffer 空间
```

## RocksDB Compaction 优先级

```
Compaction 优先级控制：
  level_compaction_dynamic_level_size：
    ├── 动态调整每层大小
    ├── 从 L6 开始向上填充
    └── 减少不必要的 Compaction

  Compaction 优先级配置：
    kMinOverlappingRatio: 选择重叠比例最小的文件
    kRoundRobin: 轮询选择
    kByCompensatedSize: 选择补偿大小最大的文件
    kOldestLargestSeqFirst: 选择最老最大的文件
    kOldestSmallestSeqFirst: 选择最老最小的文件
```

```cpp
// Compaction 配置示例
options.level_compaction_dynamic_level_size = true;
options.num_levels = 7;

// Compaction 触发条件
options.level0_file_num_compaction_trigger = 4;   // L0 文件数触发
options.level0_slowdown_writes_trigger = 20;       // L0 文件数减速
options.level0_stop_writes_trigger = 36;           // L0 文件数停止写入

// 每层大小控制
options.max_bytes_for_level_base = 256 * 1024 * 1024;  // L1: 256MB
options.max_bytes_for_level_multiplier = 10;             // 层级倍数

// Compaction 线程
options.max_background_compactions = 4;    // Compaction 线程数
options.max_background_flushes = 2;        // Flush 线程数
options.env->SetBackgroundThreads(4, Env::Priority::LOW);
```

```
Compaction 优先级策略选择：
  kMinOverlappingRatio（推荐）：
    ├── 选择与下层重叠最少的文件
    ├── 减少 Compaction 数据量
    └── 适合读写混合场景

  kRoundRobin：
    ├── 轮询选择文件 Compaction
    ├── 公平性好
    └── 适合均匀写入场景

  kByCompensatedSize：
    ├── 选择删除标记最多的文件
    ├── 优先回收空间
    └── 适合删除密集场景
```

## RocksDB Blob 存储（BlobDB）

```
BlobDB 作用：
  将大 Value 从 LSM-Tree 中分离，存储到独立的 Blob 文件

  优势：
    ├── 减少 LSM-Tree 大小
    ├── 减少 Compaction 数据量
    ├── 提升写入性能
    └── 适合大 Value 场景（>1KB）

  架构：
    LSM-Tree（小 Value 内联） + Blob 文件（大 Value 外置）
    ┌─────────────────┐
    │   LSM-Tree       │  ← Key + Blob Reference
    │  (Meta + Index)  │
    └────────┬────────┘
             │
    ┌────────▼────────┐
    │   Blob Files     │  ← 实际大 Value
    │  (blob_001.log)  │
    │  (blob_002.log)  │
    └─────────────────┘
```

```cpp
// BlobDB 配置
options.enable_blob_files = true;           // 启用 BlobDB
options.min_blob_size = 1024;               // 大于 1KB 的 Value 存入 Blob
options.blob_file_size = 256 * 1024 * 1024; // 每个 Blob 文件 256MB
options.blob_compression_type = kLZ4Compression;  // Blob 压缩算法
options.enable_blob_garbage_collection = true;     // 启用垃圾回收
options.blob_garbage_collection_age_cutoff = 0.25; // 回收最老的 25%
options.blob_garbage_collection_force_threshold = 0.75;  // 垃圾超过 75% 强制回收
```

```
BlobDB 使用场景：
  ├── 对象存储：图片/视频元数据
  ├── 日志存储：大段日志内容
  ├── 文档存储：大文本字段
  └── 缓存系统：大 Value 缓存

  不适合场景：
    ├── 小 Value（<256B）：直接内联在 LSM-Tree 中
    ├── 频繁更新的大 Value：Blob 不支持原地更新
    └── 范围查询：Blob Value 不支持范围扫描
```

## RocksDB 事务支持

### 乐观事务 vs 悲观事务

```
乐观事务（Optimistic Transactions）：
  ├── 假设没有冲突，不加锁
  ├── 提交时检测冲突
  ├── 冲突则回滚
  └── 适合低冲突场景

  流程：
    1. 开始事务
    2. 读写操作记录到 WriteBatch
    3. 提交时：检测 Read-Write / Write-Write 冲突
    4. 无冲突：原子提交
    5. 有冲突：回滚，返回错误

悲观事务（Pessimistic Transactions）：
  ├── 预先加锁，防止冲突
  ├── 读操作加读锁
  ├── 写操作加写锁
  └── 适合高冲突场景

  流程：
    1. 开始事务
    2. 读操作：加 Read Set 锁
    3. 写操作：加 Write Set 锁
    4. 提交：释放锁，原子提交
    5. 锁等待超时：返回错误
```

```cpp
// 乐观事务示例
TransactionOptions txn_options;
txn_options.use_only_the_last_commit_time_batch_for_recovery = true;

WriteOptions write_options;
write_options.sync = true;

Transaction* txn = db->BeginTransaction(write_options, txn_options);

// 写操作
txn->Put("key1", "value1");
txn->Put("key2", "value2");

// 读操作（自动记录到 Read Set）
std::string value;
txn->Get(read_options, "key3", &value);

// 提交（检测冲突）
Status s = txn->Commit();
if (s.ok()) {
    // 提交成功
} else if (s.IsBusy()) {
    // 冲突，需要重试
}

// 悲观事务
TransactionOptions pess_options;
pess_options.lock_timeout = 1000;  // 锁等待超时 1s
pess_options.deadlock_detect = true;  // 死锁检测

Transaction* pess_txn = db->BeginTransaction(write_options, pess_options);
pess_txn->Put("key1", "value1");
pess_txn->Commit();
```

## RocksDB 在 TiKV 架构中的角色

```
TiKV 架构：
  ┌─────────────────────────────────────────────┐
  │                  TiKV                       │
  │  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
  │  │ Region1 │  │ Region2 │  │ Region3 │    │
  │  │(Raft Group)│ │(Raft Group)│ │(Raft Group)│  │
  │  └────┬────┘  └────┬────┘  └────┬────┘    │
  │       │            │            │          │
  │  ┌────▼────────────▼────────────▼────┐    │
  │  │         RocksDB Engine            │    │
  │  │  ┌─────────┐  ┌─────────┐        │    │
  │  │  │ raft db │  │  kv db  │        │    │
  │  │  │(Raft日志)│  │(KV数据) │        │    │
  │  │  └─────────┘  └─────────┘        │    │
  │  └───────────────────────────────────┘    │
  └─────────────────────────────────────────────┘

  raft db：存储 Raft 日志，写密集
  kv db：存储实际 KV 数据，读写混合

  RocksDB 在 TiKV 中的关键配置：
    write_buffer_size: 64MB（raft）/ 128MB（kv）
    max_write_buffer_number: 3
    level0_file_num_compaction_trigger: 4
    max_bytes_for_level_base: 512MB
    target_file_size_base: 64MB
    compression: LZ4（L0-L3）/ ZSTD（L4-L6）
```

```
TiKV + RocksDB 优化：
  ├── Raft Log：使用单独的 Column Family，减少干扰
  ├── Write Column Family：写入密集，调大 MemTable
  ├── Default Column Family：存储大 Value，启用 BlobDB
  ├── Lock Column Family：存储锁信息，小数据量
  └── 监控 RocksDB 指标：Compaction 压力、L0 文件数
```

## RocksDB 在 Kafka Streams 中的状态存储

```
Kafka Streams 状态存储架构：

  Stream Task：
    ├── 输入：Kafka Topic 分区
    ├── 处理：业务逻辑
    ├── 输出：Kafka Topic
    └── 状态：RocksDB（本地状态存储）

  状态存储用途：
    ├── Windowed Aggregation：窗口聚合状态
    ├── Joins：两个流的连接状态
    ├── KTable：物化视图状态
    └── Deduplication：去重状态

  RocksDB 配置（Kafka Streams 默认）：
    write_buffer_size: 32MB
    max_write_buffer_number: 2
    block_cache_size: 10MB
    compaction_style: UNIVERSAL（减少写放大）
    compression: LZ4
```

```
Kafka Streams + RocksDB 优化：
  1. 增大 block_cache_size（状态频繁访问）
  2. 启用 prefix_extractor（前缀查询优化）
  3. 调整 max_write_buffer_number（并发写入）
  4. 使用 CompressionType.LZ4（压缩平衡）
  5. 配置 state.dir 指向 SSD 盘
  6. 启用(rocksdb.metrics) 监控状态存储健康
```

## RocksDB vs 其他嵌入式 KV 存储

| 特性 | RocksDB | LevelDB | Pebble | BoltDB | BadgerDB |
|------|---------|---------|--------|--------|----------|
| 语言 | C++ | C++ | Go | Go | Go |
| 架构 | LSM-Tree | LSM-Tree | LSM-Tree | B+Tree | LSM-Tree |
| 写入性能 | 极高 | 高 | 高 | 低 | 高 |
| 读取性能 | 高 | 高 | 高 | 高 | 中 |
| 事务支持 | 乐观/悲观 | 无 | 无 | 读写事务 | 事务 |
| 压缩 | 多种算法 | Snappy | 多种 | 无 | 多种 |
| 并发 | 高 | 低 | 中 | 低 | 中 |
| 适用场景 | 通用高性能 | 简单 KV | Go 生态 | 小数据 | Go 高性能 |

```
选型建议：
  ├── 通用高性能：RocksDB（最成熟、生态最好）
  ├── Go 生态简单场景：Pebble（与 Go 标准库兼容）
  ├── Go 小数据量：BoltDB（简单可靠）
  ├── Go 高性能 KV：BadgerDB（类似 RocksDB 设计）
  └── 嵌入式关系型：SQLite（需要 SQL 查询能力）
```

## RocksDB 故障排查

```
常见问题排查：

  1. Compaction 跟不上写入
     症状：L0 文件数持续增长，读性能下降
     排查：rocksdb.num-files-at-level0 持续增长
     解决：增加 max_background_compactions

  2. 磁盘空间不足
     症状：Compaction 失败，无法写入
     排查：rocksdb.total-sst-files-size 持续增长
     解决：清理过期数据，增大磁盘空间

  3. 读性能下降
     症状：Get/Put 延迟增加
     排查：rocksdb.block_cache_hit_rate 下降
     解决：增大 block_cache_size

  4. 内存溢出
     症状：进程 OOM
     排查：MemTable 内存 + BlockCache 内存 > 可用内存
     解决：配置 WriteBufferManager 控制内存

  5. 写入停滞
     症状：写入超时或阻塞
     排查：L0 文件数达到 stop_writes_trigger
     解决：增大 level0_stop_writes_trigger
```

```bash
# RocksDB 统计信息输出
options.statistics = CreateDBStatistics();

# 关键监控指标
db->GetProperty("rocksdb.num-files-at-level0", &val);  // L0 文件数
db->GetProperty("rocksdb.stats", &stats);              // 完整统计
db->GetProperty("rocksdb.block-cache-usage", &val);    // Cache 使用量
db->GetProperty("rocksdb.estimate-live-data-size", &val); // 活跃数据大小
db->GetProperty("rocksdb.compaction-pending", &val);   // 待 Compaction
db->GetProperty("rocksdb.num-running-compactions", &val); // 运行中 Compaction
```

## RocksDB 在 TiKV 中的调优实践

### TiKV RocksDB 配置详解

```
TiKV 双 RocksDB 实例配置：

  Raft Engine（Raft 日志）：
    ├── write_buffer_size: 128MB（写密集，调大）
    ├── max_write_buffer_number: 4（并发写入）
    ├── level0_file_num_compaction_trigger: 4
    ├── max_bytes_for_level_base: 512MB
    ├── target_file_size_base: 64MB
    ├── compression: LZ4（L0-L3）/ ZSTD（L4-L6）
    └── max_background_compactions: 4

  Kv Engine（KV 数据）：
    ├── write_buffer_size: 64MB
    ├── max_write_buffer_number: 3
    ├── level0_file_num_compaction_trigger: 4
    ├── max_bytes_for_level_base: 256MB
    ├── target_file_size_base: 64MB
    ├── compression: LZ4（L0-L3）/ ZSTD（L4-L6）
    ├── blob_file_size: 256MB（大 Value 外置）
    └── enable_blob_garbage_collection: true

  TiKV + RocksDB 优化要点：
    ├── Raft Log 使用独立 Column Family
    ├── Write CF 调大 MemTable（写入密集）
    ├── Default CF 启用 BlobDB（大 Value 外置）
    ├── Lock CF 小数据量，不需要优化
    └── 监控 Compaction 压力和 L0 文件数
```

```toml
# TiKV 配置示例（tikv.toml）
[rocksdb]
max-background-compactions = 4
max-background-flushes = 2
max-open-files = 10000
stats-level = "kAll"

[rocksdb.writecf]
compression-per-level = ["no", "lz4", "lz4", "lz4", "zstd", "zstd", "zstd"]
write-buffer-size = "64MB"
max-write-buffer-number = 3
min-write-buffer-number-to-merge = 1
level0-slowdown-writes-trigger = 20
level0-stop-writes-trigger = 36
target-file-size-base = "64MB"
max-bytes-for-level-base = "256MB"
level-compaction-dynamic-level-size = true

[rocksdb.lockcf]
write-buffer-size = "16MB"
max-write-buffer-number = 2
target-file-size-base = "16MB"
max-bytes-for-level-base = "64MB"

[rocksdb.raftcf]
write-buffer-size = "128MB"
max-write-buffer-number = 4
target-file-size-base = "64MB"
max-bytes-for-level-base = "512MB"
compression-per-level = ["no", "lz4", "lz4", "lz4", "zstd", "zstd", "zstd"]
```

### TiKV RocksDB 监控指标

| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| rocksdb.num-files-at-level0 | L0 文件数 | > 20 |
| rocksdb.compaction-pending | 待 Compaction 数 | > 10 |
| rocksdb.num-running-compactions | 运行中 Compaction | > 8 |
| rocksdb.estimate-pending-compaction-bytes | 待 Compaction 数据量 | > 10GB |
| rocksdb.block-cache-hit-rate | Block Cache 命中率 | < 0.8 |
| rocksdb.mem-table-size | MemTable 大小 | > 256MB |
| rocksdb.total-sst-files-size | SST 文件总大小 | 磁盘 80% |
| rocksdb.estimate-live-data-size | 活跃数据大小 | 根据数据量 |

## RocksDB 写放大优化

### 写放大减少技术

```
写放大（Write Amplification）：
  定义：实际写入磁盘的数据量 / 用户写入的数据量
  目标：将写放大控制在 10x 以内

  写放大来源：
    ├── WAL 写入：1x（不可避免）
    ├── MemTable Flush：~1x
    ├── Compaction：L0→L1→...→L6 每级 ~10x
    └── 总计：~100x（未优化时）

  优化技术：
    ├── Leveled Compaction 优化
    ├── Universal Compaction
    ├── BlobDB 大 Value 分离
    ├── 压缩算法选择
    └── Compaction 调度优化
```

```
Leveled Compaction 写放大分析：
  L0→L1：写放大 = 1（L0 文件重叠）
  L1→L2：写放大 ≈ max_bytes_for_level_multiplier（默认10）
  L2→L3：写放大 ≈ 10
  ...
  L5→L6：写放大 ≈ 10

  优化手段：
    1. 增大 max_bytes_for_level_base
       ├── 增大 L1 大小，减少 L0→L1 Compaction 频率
       └── 推荐：max_bytes_for_level_base = write_buffer_size * min_write_buffer_number_to_merge * 4

    2. 启用 level_compaction_dynamic_level_size
       ├── 动态调整每层大小
       ├── 从 L6 开始向上填充
       └── 减少不必要的 Compaction

    3. 调整 target_file_size_base
       ├── 增大 SST 文件大小
       ├── 减少文件数量
       └── 减少 Compaction 开销
```

```cpp
// 写放大优化配置
options.level_compaction_dynamic_level_size = true;
options.num_levels = 7;

// 增大 L1 大小（减少 L0→L1 Compaction）
options.max_bytes_for_level_base = 1ULL * 1024 * 1024 * 1024;  // 1GB

// 增大 SST 文件大小
options.target_file_size_base = 128 * 1024 * 1024;  // 128MB

// 调整层级倍数
options.max_bytes_for_level_multiplier = 10;

// Compaction 并发
options.max_background_compactions = 8;
options.max_background_flushes = 4;

// 使用 Universal Compaction（写放大更低）
// options.compaction_style = kCompactionStyleUniversal;
// options.compaction_options_universal.size_ratio = 1;  // 相邻文件大小比
// options.compaction_options_universal.min_merge_width = 2;  // 最小合并数
// options.compaction_options_universal.max_merge_width = UINT_MAX;  // 最大合并数
```

## RocksDB 在 MyRocks 中的应用

### MyRocks 架构与优化

```
MyRocks 架构：
  MySQL Server
      │
  MyRocks 存储引擎
      │
  RocksDB
      │
  本地磁盘

  MyRocks vs InnoDB：
    ├── 空间效率：MyRocks 比 InnoDB 节省 50-75% 存储空间
    ├── 写入性能：MyRocks 写入性能优于 InnoDB
    ├── 读取性能：点查询接近，范围查询 InnoDB 更优
    ├── 压缩：MyRocks 支持多种压缩算法
    └── 事务：MyRocks 支持事务（RocksDB 事务）

  适用场景：
    ├── 写密集型应用：日志、时序数据
    ├── 存储空间受限：嵌入式、边缘设备
    ├── 大数据量：需要高效压缩
    └── 无需范围查询：KV 查询为主
```

```sql
-- MyRocks 表创建
CREATE TABLE logs (
    id BIGINT UNSIGNED AUTO_INCREMENT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    level VARCHAR(10),
    message TEXT,
    PRIMARY KEY (id),
    KEY idx_created_at (created_at),
    KEY idx_level (level)
) ENGINE=RocksDB;

-- MyRocks 配置优化
SET GLOBAL rocksdb_block_cache_size = 4294967296;  -- 4GB
SET GLOBAL rocksdb_max_open_files = 10000;
SET GLOBAL rocksdb_write_buffer_size = 67108864;   -- 64MB
SET GLOBAL rocksdb_max_write_buffer_number = 3;
SET GLOBAL rocksdb_target_file_size_base = 67108864;  -- 64MB
SET GLOBAL rocksdb_compression_type = 'lz4';

-- MyRocks vs InnoDB 空间对比
-- InnoDB：约 100GB
-- MyRocks：约 30-40GB（3x 压缩）
```

## RocksDB Compaction Filter 过期数据处理

### TTL 数据自动清理

```cpp
// Compaction Filter 实现 TTL 自动清理
class TTLCompactionFilter : public CompactionFilter {
public:
    TTLCompactionFilter(uint64_t ttl_seconds) : ttl_seconds_(ttl_seconds) {}

    virtual Decision FilterV2(int level, const Slice& key,
                               ValueType value_type, const Slice& value,
                               std::string* new_value,
                               std::string* skip_until) const override {
        if (value_type != ValueType::kValue) {
            return Decision::kKeep;
        }

        // 解析时间戳（假设 value 前 8 字节是时间戳）
        if (value.size() < 8) {
            return Decision::kKeep;
        }

        uint64_t timestamp = DecodeFixed64(value.data());
        uint64_t now = static_cast<uint64_t>(
            std::chrono::duration_cast<std::chrono::seconds>(
                std::chrono::system_clock::now().time_since_epoch()
            ).count()
        );

        if (now - timestamp > ttl_seconds_) {
            return Decision::kRemove;  // 超过 TTL，删除
        }

        return Decision::kKeep;
    }

    virtual const char* Name() const override {
        return "TTLCompactionFilter";
    }

private:
    uint64_t ttl_seconds_;
};

// 注册 Compaction Filter
class TTLCompactionFilterFactory : public CompactionFilterFactory {
public:
    virtual std::unique_ptr<CompactionFilter> CreateCompactionFilter(
        const CompactionFilter::Context& context) override {
        return std::unique_ptr<CompactionFilter>(
            new TTLCompactionFilter(ttl_seconds_)
        );
    }

    virtual const char* Name() const override {
        return "TTLCompactionFilterFactory";
    }

private:
    uint64_t ttl_seconds_ = 86400 * 7;  // 默认 7 天
};

// 配置
options.compaction_filter_factory = std::make_shared<TTLCompactionFilterFactory>();
```

```
TTL 数据清理场景：
  ├── 日志数据：保留 30 天后自动清理
  ├── 会话数据：保留 7 天后自动清理
  ├── 缓存数据：保留 24 小时后自动清理
  └── 临时数据：保留 1 小时后自动清理

  Compaction Filter 优势：
    ├── 自动清理：无需定时任务
    ├── 零额外 IO：在 Compaction 时顺便清理
    ├── 灵活策略：可自定义清理逻辑
    └── 低延迟：不影响写入性能
```

## RocksDB 备份与 Checkpoint 机制

### 备份策略

```
RocksDB 备份方式：
  1. Checkpoint（快照）
     ├── 创建一致性快照
     ├── 不影响读写性能
     ├── 快速创建（秒级）
     └── 适合频繁备份

  2. BackupEngine（备份引擎）
     ├── 增量备份
     ├── 备份元数据管理
     ├── 备份验证
     └── 适合长期存储

  3. 物理拷贝
     ├── 直接拷贝数据目录
     ├── 需要停服或冻结
     └── 适合初始迁移
```

```cpp
// Checkpoint 示例
Status CreateCheckpoint(DB* db, const std::string& checkpoint_dir) {
    Checkpoint* checkpoint;
    Status s = Checkpoint::Create(db, &checkpoint);

    if (s.ok()) {
        s = checkpoint->CreateCheckpoint(checkpoint_dir);
        delete checkpoint;
    }

    return s;
}

// BackupEngine 示例
Status BackupDatabase(DB* db, const std::string& backup_dir) {
    BackupEngine* backup_engine;
    Status s = BackupEngine::Open(
        Env::Default(),
        backup_dir,
        &backup_engine
    );

    if (s.ok()) {
        // 全量备份
        s = backup_engine->CreateNewBackup(db);
        if (s.ok()) {
            s = backup_engine->PurgeOldBackups(5);  // 保留最近 5 个备份
        }
        delete backup_engine;
    }

    return s;
}

// 恢复备份
Status RestoreDatabase(const std::string& backup_dir, const std::string& db_dir) {
    BackupEngine* backup_engine;
    Status s = BackupEngine::Open(
        Env::Default(),
        backup_dir,
        &backup_engine
    );

    if (s.ok()) {
        s = backup_engine->RestoreDBFromLatestBackup(db_dir, db_dir);
        delete backup_engine;
    }

    return s;
}
```

### 备份策略配置

```
生产环境备份策略：
  ├── Checkpoint 备份：
  │     频率：每小时
  │     保留：24 个（24 小时）
  │     存储：本地 SSD
  │     时间：秒级
  │
  ├── BackupEngine 备份：
  │     频率：每天
  │     保留：7 个（7 天）
  │     存储：S3/OSS
  │     时间：分钟级
  │
  └── 物理拷贝：
        频率：每周
        保留：4 个（4 周）
        存储：冷存储
        时间：小时级

  恢复策略：
    ├── 小故障：从 Checkpoint 恢复（< 1分钟）
    ├── 中故障：从 BackupEngine 恢复（< 30分钟）
    └── 大故障：从物理拷贝恢复（< 2小时）
```

## RocksDB vs LMDB vs BoltDB 对比矩阵

| 特性 | RocksDB | LMDB | BoltDB | Pebble | BadgerDB |
|------|---------|------|--------|--------|----------|
| 语言 | C++ | C | Go | Go | Go |
| 架构 | LSM-Tree | B+Tree | B+Tree | LSM-Tree | LSM-Tree |
| 写入性能 | 极高（100K+ ops/s） | 中（10K ops/s） | 低（5K ops/s） | 高（50K ops/s） | 高（50K ops/s） |
| 读取性能 | 高（100K+ ops/s） | 极高（200K+ ops/s） | 高（50K ops/s） | 高（50K ops/s） | 中（30K ops/s） |
| 空间效率 | 高（压缩支持） | 中 | 低 | 高 | 中 |
| 内存使用 | 高（BlockCache） | 低 | 低 | 高 | 中 |
| 并发支持 | 高（无锁读） | 中（MVCC） | 低（读写锁） | 高 | 中 |
| 事务支持 | 乐观/悲观 | 读写事务 | 读写事务 | 无 | 事务 |
| 压缩 | Snappy/LZ4/ZSTD | 无 | 无 | Snappy/LZ4/ZSTD | Snappy |
| 适用场景 | 通用高性能 | 读密集 | 小数据量 | Go 生态 | Go 高性能 |

```
选型决策树：
  写入密集？
    ├── 是 → 数据量大？
    │     ├── 是 → RocksDB（最佳选择）
    │     └── 否 → Pebble/BadgerDB（Go 生态）
    └── 否 → 读密集？
          ├── 是 → 数据量小？
          │     ├── 是 → BoltDB（简单可靠）
          │     └── 否 → LMDB（读性能最优）
          └── 否 → 通用场景 → RocksDB
```

## RocksDB 内存追踪与故障排查

### 内存使用分析

```
RocksDB 内存组成：
  ├── MemTable：write_buffer_size * max_write_buffer_number
  │     默认：64MB * 2 = 128MB
  │
  ├── BlockCache：block_cache_size
  │     默认：8MB（需调大）
  │
  ├── 索引和布隆过滤器：cache_index_and_filter_blocks
  │     如果开启：约占 10-20% 数据量
  │
  ├── 后台线程：每个 Compaction 线程约 1MB 栈空间
  │
  └── 其他开销：约 10-20%

  总内存估算：
    小规模（< 10GB 数据）：2-4GB
    中规模（10-100GB 数据）：8-16GB
    大规模（> 100GB 数据）：32-64GB
```

```cpp
// 内存使用追踪
void TrackMemoryUsage(DB* db) {
    std::string val;

    // MemTable 大小
    db->GetProperty("rocksdb.cur-size-all-mem-tables", &val);
    std::cout << "MemTable 大小: " << val << std::endl;

    // BlockCache 使用量
    db->GetProperty("rocksdb.block-cache-usage", &val);
    std::cout << "BlockCache 使用: " << val << std::endl;

    // 索引和布隆过滤器大小
    db->GetProperty("rocksdb.estimate-table-readers-mem", &val);
    std::cout << "索引/布隆过滤器: " << val << std::endl;

    // 总活跃数据大小
    db->GetProperty("rocksdb.estimate-live-data-size", &val);
    std::cout << "活跃数据大小: " << val << std::endl;

    // SST 文件总大小
    db->GetProperty("rocksdb.total-sst-files-size", &val);
    std::cout << "SST 文件总大小: " << val << std::endl;
}

// 内存泄漏检测
void DetectMemoryLeak(DB* db) {
    std::string val;

    // 检查 MemTable 数量
    db->GetProperty("rocksdb.num-immutable-mem-table", &val);
    int immutable_memtables = std::stoi(val);
    if (immutable_memtables > 5) {
        std::cerr << "警告：Immutable MemTable 数量过多: "
                  << immutable_memtables << std::endl;
    }

    // 检查 Compaction 堆积
    db->GetProperty("rocksdb.compaction-pending", &val);
    int pending_compactions = std::stoi(val);
    if (pending_compactions > 10) {
        std::cerr << "警告：待 Compaction 数量过多: "
                  << pending_compactions << std::endl;
    }

    // 检查 L0 文件数
    db->GetProperty("rocksdb.num-files-at-level0", &val);
    int l0_files = std::stoi(val);
    if (l0_files > 20) {
        std::cerr << "警告：L0 文件数过多: " << l0_files << std::endl;
    }
}
```

### 故障排查清单

| 问题 | 症状 | 排查方法 | 解决方案 |
|------|------|----------|----------|
| OOM | 进程被 Kill | 检查 MemTable + BlockCache 内存 | 配置 WriteBufferManager |
| Compaction 堆积 | L0 文件数增长 | rocksdb.num-files-at-level0 | 增加 Compaction 线程 |
| 写入停滞 | 写入超时 | L0 文件数达 stop_writes_trigger | 增大触发阈值 |
| 读性能下降 | Get 延迟增加 | rocksdb.block_cache_hit_rate | 增大 BlockCache |
| 磁盘空间不足 | Compaction 失败 | rocksdb.total-sst-files-size | 清理过期数据 |
| 写放大过高 | 磁盘 IO 高 | 计算写放大比例 | 优化 Compaction 策略 |

## RocksDB 在 Flink 状态后端中的应用

### Flink + RocksDB 状态后端

```
Flink RocksDB 状态后端架构：
  Flink TaskManager
      │
  Flink Runtime
      │
  RocksDB 状态后端
      │
  本地磁盘（SSD）

  状态存储方式：
    ├── Keyed State：按 Key 分片存储
    ├── Operator State：算子状态
    ├── Window State：窗口状态
    └── Broadcast State：广播状态

  配置参数：
    ├── state.backend: rocksdb
    ├── state.backend.rocksdb.memory.managed: true
    ├── state.backend.rocksdb.memory.fixed-per-slot: 256mb
    ├── state.backend.rocksdb.memory.high-priority: 0.4
    ├── state.backend.rocksdb.block.cache-size: 256mb
    ├── state.backend.rocksdb.writebuffer.count: 4
    ├── state.backend.rocksdb.writebuffer.size: 64mb
    └── state.backend.rocksdb.compaction.style: level
```

```java
// Flink + RocksDB 状态后端配置
StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

// 配置 RocksDB 状态后端
RocksDBStateBackend rocksDBBackend = new RocksDBStateBackend(
    "hdfs://flink-cluster/checkpoints",
    true  // 启用增量 Checkpoint
);
rocksDBBackend.setPredefinedOptions(PredefinedOptions.SPINNING_DISK_OPTIMIZED_HIGH_MEM);
rocksDBBackend.setNumberOfTransferThreads(4);

env.setStateBackend(rocksDBBackend);

// 配置 Checkpoint
env.enableCheckpointing(60000);  // 60 秒
env.getCheckpointConfig().setCheckpointingMode(CheckpointingMode.EXACTLY_ONCE);
env.getCheckpointConfig().setMinPauseBetweenCheckpoints(30000);
env.getCheckpointConfig().setCheckpointTimeout(120000);
env.getCheckpointConfig().setMaxConcurrentCheckpoints(1);
env.getCheckpointConfig().enableExternalizedCheckpoints(
    ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION
);

// RocksDB 调优
Configuration config = new Configuration();
config.setString("state.backend.rocksdb.memory.managed", "true");
config.setString("state.backend.rocksdb.memory.fixed-per-slot", "256mb");
config.setString("state.backend.rocksdb.writebuffer.count", "4");
config.setString("state.backend.rocksdb.writebuffer.size", "64mb");
config.setString("state.backend.rocksdb.compaction.style", "level");
config.setString("state.backend.rocksdb.use-bloom-filter", "true");
config.setInteger("state.backend.rocksdb.bloom-filter-blocks", 10);
env.configure(config);
```

```
Flink + RocksDB 性能优化：
  1. 内存管理：
     ├── 开启 managed memory：Flink 统一管理内存
     ├── fixed-per-slot：每个 Slot 固定内存
     └── high-priority：BlockCache 高优先级比例

  2. 写入优化：
     ├── writebuffer.count：增加 MemTable 数量
     ├── writebuffer.size：增大 MemTable 大小
     └── compression：L0-L3 使用 LZ4，L4+ 使用 ZSTD

  3. 读取优化：
     ├── use-bloom-filter：启用布隆过滤器
     ├── block_cache_size：增大 BlockCache
     └── cache_index_and_filter_blocks：缓存索引

  4. Checkpoint 优化：
     ├── incremental checkpoint：增量 Checkpoint
     ├── 只同步 RocksDB 文件：减少 Checkpoint 时间
     └── 异步 Checkpoint：不阻塞主流程
```

## RocksDB 压缩策略（LZ4/Snappy/Zstd 级别选择）

### 压缩策略对比

| 算法 | 压缩比 | 压缩速度 | 解压速度 | 适用场景 |
|------|--------|----------|----------|----------|
| LZ4 | 低 | 极快 | 极快 | 热数据（L0-L3） |
| Snappy | 低 | 快 | 快 | 热数据 |
| ZSTD | 高 | 中 | 快 | 冷数据（L4+） |
| 无压缩 | 无 | 无 | 无 | 临时数据 |

### 压缩级别配置

```
LZ4 压缩级别：
  level 1: 默认（推荐）
  level 2-3: 更高压缩比，更慢

ZSTD 压缩级别：
  level 1-3: 快速压缩
  level 4-6: 平衡（推荐）
  level 7-9: 高压缩比

推荐配置：
  L0-L3: LZ4（热数据，快速压缩）
  L4+: ZSTD level 6（冷数据，高压缩比）
```

### 配置示例

```cpp
// RocksDB 压缩配置
options.compression_per_level = {
    kLZ4Compression,    // Level 0
    kLZ4Compression,    // Level 1
    kLZ4Compression,    // Level 2
    kLZ4Compression,    // Level 3
    kZSTD,              // Level 4
    kZSTD,              // Level 5
    kZSTD               // Level 6
};

// ZSTD 压缩选项
options.bottommost_compression = kZSTD;
options.compression_opts_max_dict_bytes = 16 * 1024;  // 16KB 字典
```

## RocksDB MemTable（SkipList/HashSkipList/Vector）

### MemTable 类型对比

| 类型 | 查找复杂度 | 插入复杂度 | 内存开销 | 适用场景 |
|------|------------|------------|----------|----------|
| SkipList | O(log n) | O(log n) | 中 | 通用（默认） |
| HashSkipList | O(1) 平均 | O(1) 平均 | 高 | 等值查询 |
| Vector | O(n) | O(1) | 低 | 只追加写入 |
| CuckooHash | O(1) 平均 | O(1) 平均 | 高 | 等值查询 |

### 配置示例

```cpp
// SkipList（默认）
options.mem_table_factory.reset(new SkipListFactory());

// HashSkipList
options.mem_table_factory.reset(new HashSkipListFactory(
    10000,           // bucket count
    8,               // height
    4                // bucket count for hash table
));

// Vector MemTable
options.mem_table_factory.reset(new VectorRepFactory());
```

## RocksDB Block Cache 配置（LRU Cache/Sharded Cache）

### Block Cache 类型

| 类型 | 说明 | 适用场景 |
|------|------|----------|
| LRU Cache | 最近最少使用 | 通用 |
| HyperClockCache | 时钟算法，更高并发 | 高并发场景 |
| FixedHyperClockCache | 固定大小时钟缓存 | 内存受限 |

### 配置示例

```cpp
// LRU Cache
BlockBasedTableOptions table_options;
table_options.block_cache = NewLRUCache(8ULL * 1024 * 1024 * 1024);  // 8GB

// HyperClockCache（更高并发）
table_options.block_cache = NewHyperClockCache(
    8ULL * 1024 * 1024 * 1024,  // 8GB
    8                             // cache 倍数
);

// 缓存配置优化
table_options.cache_index_and_filter_blocks = true;
table_options.cache_index_and_filter_blocks_with_high_priority = true;
table_options.pin_l0_filter_and_index_blocks_in_cache = true;
```

## RocksDB Compaction 策略（Level/Universal/FIFO 适用场景）

### Compaction 策略对比

| 策略 | 说明 | 优点 | 缺点 | 适用场景 |
|------|------|------|------|----------|
| Level | 分层合并 | 空间放大小 | 写放大大 | 通用（默认） |
| Universal | 全量合并 | 写放大小 | 空间放大 | 写密集 |
| FIFO | 先进先出 | 写放大极小 | 不保证一致性 | 时序数据 |

### 配置示例

```cpp
// Level Compaction（默认）
options.compaction_style = kCompactionStyleLevel;

// Universal Compaction
options.compaction_style = kCompactionStyleUniversal;
options.compaction_options_universal.max_size_amplification_percent = 200;

// FIFO Compaction
options.compaction_style = kCompactionStyleFIFO;
options.compaction_options_fifo.max_table_files_size = 1ULL * 1024 * 1024 * 1024;  // 1GB
```

## RocksDB 在 Kafka/Flink/LSM-tree 中的调优

### Kafka Streams 调优

```
Kafka Streams + RocksDB 调优：
  state.dir: RocksDB 状态存储目录
  rocksdb.block.cache.size: Block Cache 大小
  rocksdb.write.buffer.size: MemTable 大小
  rocksdb.max.write.buffer.number: MemTable 数量
  rocksdb.compaction.style: Compaction 策略
```

### Flink 状态后端调优

```
Flink RocksDB State Backend 调优：
  state.backend.rocksdb.block.cache-size: Block Cache
  state.backend.rocksdb.writebuffer.size: MemTable
  state.backend.rocksdb.writebuffer.count: MemTable 数量
  state.backend.rocksdb.compaction.style: Compaction 策略
```

## RocksDB 事务（TransactionDB/Optimistic TransactionDB）

### 事务类型对比

| 类型 | 锁机制 | 并发性 | 适用场景 |
|------|--------|--------|----------|
| TransactionDB | 悲观锁 | 低 | 写冲突多 |
| Optimistic TransactionDB | 乐观锁 | 高 | 写冲突少 |

### 事务配置

```cpp
// TransactionDB（悲观锁）
TransactionDB* txn_db;
TransactionDBOptions txn_db_options;
txn_db_options.write_policy = TxnDBWritePolicy::WRITE_COMMITTED;
TransactionDB::Open(options, txn_db_options, "db_path", &txn_db);

// Optimistic TransactionDB（乐观锁）
OptimisticTransactionDB* opt_txn_db;
OptimisticTransactionDB::Open(options, "db_path", &opt_txn_db);

// 事务操作
Transaction* txn = txn_db->BeginTransaction(write_options);
txn->Put("key1", "value1");
txn->Put("key2", "value2");
Status s = txn->Commit();
delete txn;
```

## RocksDB 深度调优实战

### Write Buffer Manager 实战

```cpp
// 场景：多Column Family共享内存限制
// 防止单个CF独占内存导致OOM

class MemoryBoundedDB {
public:
    MemoryBoundedDB(size_t total_memory_budget) {
        // 1. 创建Write Buffer Manager，限制总MemTable内存
        write_buffer_manager_ = std::make_shared<WriteBufferManager>(
            total_memory_budget * 0.4  // 40%给MemTable
        );
        
        // 2. 创建Block Cache，共享剩余内存
        block_cache_ = NewLRUCache(total_memory_budget * 0.6);  // 60%给BlockCache
        
        // 3. 配置每个CF
        ColumnFamilyOptions cf_options;
        cf_options.write_buffer_manager = write_buffer_manager_;
        
        BlockBasedTableOptions table_options;
        table_options.block_cache = block_cache_;
        table_options.cache_index_and_filter_blocks = true;
        cf_options.table_factory.reset(NewBlockBasedTableFactory(table_options));
        
        // 4. 创建多个CF
        std::vector<ColumnFamilyDescriptor> cf_descriptors = {
            {"default", cf_options},
            {"metadata", cf_options},
            {"logs", cf_options}
        };
    }
    
    void MonitorMemory() {
        // 监控内存使用
        size_t memtable_usage = write_buffer_manager_->memory_usage();
        size_t block_cache_usage = block_cache_->GetUsage();
        
        std::cout << "MemTable 使用: " << memtable_usage / 1024 / 1024 << "MB" << std::endl;
        std::cout << "BlockCache 使用: " << block_cache_usage / 1024 / 1024 << "MB" << std::endl;
        
        // 检查是否接近限制
        if (memtable_usage > write_buffer_manager_->buffer_limit() * 0.9) {
            std::cerr << "警告：MemTable 使用率超过 90%" << std::endl;
        }
    }

private:
    std::shared_ptr<WriteBufferManager> write_buffer_manager_;
    std::shared_ptr<Cache> block_cache_;
};
```

### Compaction 策略深度对比

```text
Leveled vs Universal vs FIFO 选型决策：

┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ 场景            │ 推荐策略        │ 原因            │ 关键参数        │
├─────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ 通用OLTP        │ Leveled         │ 读放大低        │ L1=256MB        │
│ 写密集日志      │ Universal       │ 写放大低        │ size_ratio=1    │
│ 时序数据        │ FIFO            │ 简单高效        │ max_table=1GB   │
│ 大Value存储     │ Leveled+BlobDB  │ 减少写放大      │ min_blob=1KB    │
│ 读写均衡        │ Leveled         │ 综合最优        │ 动态层级        │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

```cpp
// Universal Compaction 优化配置（写密集场景）
options.compaction_style = kCompactionStyleUniversal;

// 关键参数调优
options.compaction_options_universal.size_ratio = 1;        // 相邻文件大小比阈值
options.compaction_options_universal.min_merge_width = 2;   // 最小合并文件数
options.compaction_options_universal.max_merge_width = UINT_MAX;  // 最大合并文件数
options.compaction_options_universal.max_size_amplification_percent = 200;  // 空间放大上限

// 启用 incremental compaction（减少写放大）
options.compaction_options_universal.allow_trivial_move = true;
```

### FIFO Compaction 实战

```cpp
// FIFO Compaction：时序数据最佳选择
options.compaction_style = kCompactionStyleFIFO;

// 配置：只保留最近的数据
options.compaction_options_fifo.max_table_files_size = 10ULL * 1024 * 1024 * 1024;  // 10GB
options.compaction_options_fifo.allow_compaction = false;  // 不做合并，只删除最老文件

// 适用场景：
// - IoT传感器数据
// - 日志存储
// - 监控指标
// - 任何只追加、不需要更新的时序数据

// 优势：
// - 写放大接近 1x（几乎无Compaction）
// - 空间放大接近 1x（无冗余）
// - 写入性能极高
```

### TTL数据自动清理实现

```cpp
// 完整的TTL自动清理实现
class TTLCompactionFilter : public CompactionFilter {
public:
    TTLCompactionFilter(uint64_t ttl_seconds, const std::string& ts_field)
        : ttl_seconds_(ttl_seconds), ts_field_(ts_field) {}

    Decision FilterV2(int level, const Slice& key,
                      ValueType value_type, const Slice& value,
                      std::string* new_value,
                      std::string* skip_until) override {
        if (value_type != ValueType::kValue) {
            return Decision::kKeep;
        }

        // 解析JSON value，获取时间戳字段
        std::string json_str(value.data(), value.size());
        // 假设value是JSON格式，包含时间戳字段
        // 实际项目中需要使用JSON解析库
        
        // 简化示例：假设前8字节是时间戳
        if (value.size() < 8) {
            return Decision::kKeep;
        }

        uint64_t timestamp = DecodeFixed64(value.data());
        uint64_t now = GetCurrentTimestamp();

        if (now - timestamp > ttl_seconds_) {
            return Decision::kRemove;  // 超过TTL，删除
        }

        // 可选：返回修改后的value（如移除过期字段）
        if (new_value) {
            new_value->assign(value.data(), value.size());
        }
        return Decision::kKeep;
    }

    const char* Name() const override {
        return "TTLCompactionFilter";
    }

private:
    uint64_t ttl_seconds_;
    std::string ts_field_;
    
    uint64_t GetCurrentTimestamp() {
        return std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch()
        ).count();
    }
};

// 注册Filter
class TTLCompactionFilterFactory : public CompactionFilterFactory {
public:
    TTLCompactionFilterFactory(uint64_t default_ttl, const std::string& ts_field)
        : default_ttl_(default_ttl), ts_field_(ts_field) {}

    std::unique_ptr<CompactionFilter> CreateCompactionFilter(
        const CompactionFilter::Context& context) override {
        return std::unique_ptr<CompactionFilter>(
            new TTLCompactionFilter(default_ttl_, ts_field_)
        );
    }

    const char* Name() const override {
        return "TTLCompactionFilterFactory";
    }

private:
    uint64_t default_ttl_;
    std::string ts_field_;
};

// 配置使用
options.compaction_filter_factory = std::make_shared<TTLCompactionFilterFactory>(
    86400 * 7,  // 默认7天TTL
    "created_at"  // 时间戳字段名
);
```

### RocksDB监控与告警

```yaml
# Prometheus监控RocksDB指标
groups:
  - name: rocksdb_alerts
    rules:
      # L0文件数过多告警
      - alert: RocksDB_L0FilesHigh
        expr: rocksdb_num_files_at_level0 > 20
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "RocksDB L0文件数过多"
          description: "L0文件数: {{ $value }}，可能导致写入停滞"
      
      # Compaction堆积告警
      - alert: RocksDB_CompactionPending
        expr: rocksdb_compaction_pending > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "RocksDB Compaction堆积"
          description: "待Compaction数: {{ $value }}"
      
      # BlockCache命中率低
      - alert: RocksDB_CacheHitRateLow
        expr: rocksdb_block_cache_hit_rate < 0.8
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "RocksDB BlockCache命中率低"
          description: "命中率: {{ $value }}，建议增大BlockCache"
      
      # 写放大过高
      - alert: RocksDB_WriteAmplificationHigh
        expr: rocksdb_write_amplification > 20
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "RocksDB写放大过高"
          description: "写放大: {{ $value }}x，建议优化Compaction策略"
      
      # 磁盘空间不足
      - alert: RocksDB_DiskSpaceLow
        expr: rocksdb_total_sst_files_size / node_filesystem_size_bytes > 0.8
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "RocksDB磁盘空间不足"
          description: "磁盘使用率: {{ $value | humanizePercentage }}"
```

### RocksDB备份与恢复最佳实践

```bash
#!/bin/bash
# RocksDB备份脚本

DB_PATH="/data/rocksdb"
BACKUP_PATH="/backup/rocksdb"
RETENTION_DAYS=7

# 1. 创建Checkpoint（秒级）
create_checkpoint() {
    local checkpoint_dir="${BACKUP_PATH}/checkpoint_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$checkpoint_dir"
    
    # 使用RocksDB工具创建Checkpoint
    ./rocksdb_checkpoint --checkpoint_dir="$checkpoint_dir" --db_path="$DB_PATH"
    
    echo "Checkpoint创建成功: $checkpoint_dir"
}

# 2. 增量备份到S3
backup_to_s3() {
    local checkpoint_dir=$1
    local s3_bucket="s3://my-rocksdb-backup"
    
    # 使用AWS CLI上传
    aws s3 sync "$checkpoint_dir" "${s3_bucket}/$(basename $checkpoint_dir)" \
        --storage-class STANDARD_IA \
        --sse AES256
    
    echo "备份上传到S3: ${s3_bucket}/$(basename $checkpoint_dir)"
}

# 3. 清理过期备份
cleanup_old_backups() {
    find "$BACKUP_PATH" -name "checkpoint_*" -mtime +$RETENTION_DAYS -exec rm -rf {} \;
    echo "清理${RETENTION_DAYS}天前的备份"
}

# 4. 验证备份完整性
verify_backup() {
    local backup_dir=$1
    
    # 检查关键文件是否存在
    if [ -f "${backup_dir}/CURRENT" ] && [ -f "${backup_dir}/MANIFEST-000001" ]; then
        echo "备份验证通过"
        return 0
    else
        echo "备份验证失败"
        return 1
    fi
}

# 主流程
main() {
    echo "开始RocksDB备份..."
    
    # 创建Checkpoint
    checkpoint_dir=$(create_checkpoint)
    
    # 验证备份
    if verify_backup "$checkpoint_dir"; then
        # 上传到S3
        backup_to_s3 "$checkpoint_dir"
        
        # 清理旧备份
        cleanup_old_backups
        
        echo "备份完成"
    else
        echo "备份失败"
        exit 1
    fi
}

main
```

### RocksDB性能基准测试

```cpp
// RocksDB基准测试工具
#include "include/rocksdb/db.h"
#include "include/rocksdb/write_batch.h"
#include <chrono>
#include <random>
#include <iostream>

class RocksDBBenchmark {
public:
    RocksDBBenchmark(const std::string& db_path) {
        rocksdb::Options options;
        options.create_if_not_found = true;
        options.compression = rocksdb::kLZ4Compression;
        options.write_buffer_size = 64 * 1024 * 1024;  // 64MB
        options.max_write_buffer_number = 3;
        options.level0_file_num_compaction_trigger = 4;
        options.max_bytes_for_level_base = 256 * 1024 * 1024;  // 256MB
        options.target_file_size_base = 64 * 1024 * 1024;  // 64MB
        
        rocksdb::DB* db;
        rocksdb::DB::Open(options, db_path, &db);
        db_.reset(db);
    }
    
    void BenchmarkRandomWrite(int num_keys, int value_size) {
        std::cout << "=== 随机写入基准测试 ===" << std::endl;
        std::cout << "键数量: " << num_keys << std::endl;
        std::cout << "Value大小: " << value_size << " bytes" << std::endl;
        
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_int_distribution<> dis(0, num_keys - 1);
        
        std::string value(value_size, 'v');
        
        auto start = std::chrono::high_resolution_clock::now();
        
        for (int i = 0; i < num_keys; i++) {
            std::string key = "key_" + std::to_string(dis(gen));
            db_->Put(rocksdb::WriteOptions(), key, value);
        }
        
        auto end = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
        
        double ops_per_sec = num_keys * 1000.0 / duration.count();
        std::cout << "耗时: " << duration.count() << "ms" << std::endl;
        std::cout << "吞吐: " << ops_per_sec << " ops/sec" << std::endl;
        std::cout << std::endl;
    }
    
    void BenchmarkRandomRead(int num_keys, int read_count) {
        std::cout << "=== 随机读取基准测试 ===" << std::endl;
        std::cout << "键数量: " << num_keys << std::endl;
        std::cout << "读取次数: " << read_count << std::endl;
        
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_int_distribution<> dis(0, num_keys - 1);
        
        auto start = std::chrono::high_resolution_clock::now();
        
        for (int i = 0; i < read_count; i++) {
            std::string key = "key_" + std::to_string(dis(gen));
            std::string value;
            db_->Get(rocksdb::ReadOptions(), key, &value);
        }
        
        auto end = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
        
        double ops_per_sec = read_count * 1000.0 / duration.count();
        std::cout << "耗时: " << duration.count() << "ms" << std::endl;
        std::cout << "吞吐: " << ops_per_sec << " ops/sec" << std::endl;
        std::cout << std::endl;
    }
    
    void BenchmarkScan(int num_keys, int scan_count) {
        std::cout << "=== 范围扫描基准测试 ===" << std::endl;
        std::cout << "键数量: " << num_keys << std::endl;
        std::cout << "扫描次数: " << scan_count << std::endl;
        
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_int_distribution<> dis(0, num_keys - 100);
        
        auto start = std::chrono::high_resolution_clock::now();
        
        for (int i = 0; i < scan_count; i++) {
            std::string start_key = "key_" + std::to_string(dis(gen));
            std::string end_key = "key_" + std::to_string(dis(gen) + 100);
            
            auto it = db_->NewIterator(rocksdb::ReadOptions());
            it->Seek(start_key);
            
            int count = 0;
            while (it->Valid() && it->key().ToString() <= end_key) {
                count++;
                it->Next();
            }
            delete it;
        }
        
        auto end = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
        
        double ops_per_sec = scan_count * 1000.0 / duration.count();
        std::cout << "耗时: " << duration.count() << "ms" << std::endl;
        std::cout << "吞吐: " << ops_per_sec << " scans/sec" << std::endl;
        std::cout << std::endl;
    }

private:
    std::unique_ptr<rocksdb::DB> db_;
};

// 使用示例
int main() {
    RocksDBBenchmark benchmark("/tmp/rocksdb_benchmark");
    
    // 写入测试
    benchmark.BenchmarkRandomWrite(1000000, 100);  // 100万次写入，100字节Value
    
    // 读取测试
    benchmark.BenchmarkRandomRead(1000000, 1000000);  // 100万次读取
    
    // 扫描测试
    benchmark.BenchmarkScan(1000000, 10000);  // 1万次范围扫描
    
    return 0;
}
```

### LSM-Tree架构详解

```text
写入流程：
  Write → MemTable → WAL → 返回成功
  MemTable满 → Flush到SSTable（L0）
  L0 SSTable满 → Compaction到L1
  L1 SSTable满 → Compaction到L2
  ...

Compaction策略：
  Level Compaction：每层大小递增10倍
  Tiered Compaction：同层多文件合并
  FIFO Compaction：按时间删除旧文件
```

### 写放大优化

| 策略 | 写放大 | 读放大 | 空间放大 |
|------|--------|--------|----------|
| Leveled | 高（10-30x） | 低（1-2x） | 低（1.1x） |
| Tiered | 低（2-5x） | 高（10-100x） | 高（2x） |
| Universal | 低 | 中 | 中 |

### Prefix Seek/范围查询

```cpp
// 前缀查询优化
ReadOptions options;
options.prefix_same_as_forward = true;
options.total_order_seek = false;

// 范围查询
Iterator* it = db_->NewIterator(options);
for (it->Seek(start_key); it->Valid() && it->key() < end_key; it->Next()) {
    // 处理数据
}
```

### TTL配置

```cpp
// 列族TTL
ColumnFamilyOptions cf_options;
cf_options.ttl = 3600;  // 1小时过期
cf_options.periodic_compaction_seconds = 86400;

// 写入带TTL
WriteOptions write_options;
write_options.timestamp = &now;
```

### RocksDB调优

| 参数 | 默认值 | 推荐值 | 说明 |
|------|--------|--------|------|
| BlockCache | 8MB | 128-512MB | 缓存大小 |
| WriteBuffer | 64MB | 128-256MB | 写缓冲区 |
| Compaction线程 | 1 | 4-8 | 并行Compaction |
| MaxOpenFiles | -1 | 1000 | 文件句柄数 |

### 嵌入式KV对比

| 特性 | RocksDB | BoltDB | LevelDB | BadgerDB |
|------|---------|--------|---------|----------|
| 架构 | LSM | B+树 | LSM | LSM |
| 写入性能 | 极高 | 低 | 高 | 高 |
| 读取性能 | 高 | 高 | 高 | 高 |
| 事务 | 支持 | 支持 | 不支持 | 支持 |
| 适用场景 | 通用 | 小数据 | 简单KV | Go应用 |

### RocksDB在Kafka中的应用

```text
Log存储：
  消息存储在RocksDB中
  支持高效顺序读写

索引存储：
  消息偏移量索引
  时间戳索引
```

### RocksDB在MyRocks中的应用

```text
MyRocks：
  MySQL存储引擎
  基于RocksDB
  优势：
    1. 写入性能高
    2. 存储效率高（压缩）
    3. 事务支持
```

### 监控

```cpp
// 获取统计信息
std::string stats;
db_->GetProperty("rocksdb.stats", &stats);

// 获取压缩统计
std::string compaction_stats;
db_->GetProperty("rocksdb.cfstats", &compaction_stats);

// 性能上下文
perf_context.Reset();
// 执行操作
uint64_t elapsed = perf_context.user_key_comparison_count;
```

### 备份恢复

```cpp
// 快照备份
Snapshot* snapshot = db_->GetSnapshot();
ReadOptions options;
options.snapshot = snapshot;
// 读取数据...

// CheckPoint备份
Checkpoint* checkpoint;
Checkpoint::Create(db_, &checkpoint);
checkpoint->CreateCheckpoint("/backup/path");
```

### RocksDB最佳实践

| 实践 | 说明 | 优先级 |
|------|------|--------|
| 写优化 | 调整WriteBuffer | 高 |
| 读优化 | 调整BlockCache | 高 |
| 内存管理 | 限制内存使用 | 高 |
| Compaction调优 | 调整线程数 | 中 |

### RocksDB生产问题排查

| 问题 | 排查步骤 | 解决方案 |
|------|----------|----------|
| 写放大 | 检查Compaction统计 | 调整策略 |
| 空间放大 | 检查压缩比 | 启用压缩 |
| Compaction堆积 | 检查线程数 | 增加线程 |
| 读性能 | 检查缓存命中率 | 增加BlockCache |

## 与其他板块的关系

| 关联板块 | 关系描述 |
|----------|----------|
| **分布式数据库** | RocksDB 是 TiKV/CockroachDB 等的存储引擎 |
| **消息系统** | Kafka Streams 用 RocksDB 做状态存储 |
| **存储引擎** | 理解 LSM-Tree 有助于选择合适的存储方案 |
| **性能优化** | RocksDB 调优是高性能存储系统的关键 |
| **数据持久化** | RocksDB 提供可靠的本地持久化能力 |

## 一句话总结

RocksDB 是基于 LSM-Tree 架构的高性能嵌入式 KV 存储引擎，通过顺序写入 + Compaction 实现极高的写入吞吐，是分布式数据库和消息系统的底层存储基石。

---

## 参考资料

- [RocksDB 官方文档](https://github.com/facebook/rocksdb/wiki)
- [RocksDB Wiki](https://github.com/facebook/rocksdb/wiki)
- [LSM-Tree 论文](https://www.cs.umb.edu/~poneil/lsmtree.pdf)
- [RocksDB Tuning Guide](https://github.com/facebook/rocksdb/wiki/RocksDB-Tuning-Guide)
- [TiKV 架构](https://tikv.org/deep-dive/)
