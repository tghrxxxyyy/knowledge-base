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
