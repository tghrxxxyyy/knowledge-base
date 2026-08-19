# RocksDB / LevelDB 深入（Column Family / Write Batch / 事务 / Merge Operator / 调优）

> RocksDB 是**嵌入式 KV 存储的事实标准**。本篇深入拆解：Column Family、Write Batch、事务模型、Merge Operator、生产调优参数。

---

## 一、核心原理

### 1.1 LSM-Tree 写入路径

```
1. 写 WAL（预写日志，顺序写磁盘）→ 防宕机丢数据
2. 写入内存表 MemTable（跳表 SkipList，有序）
3. MemTable 满 → 冻结 → 刷成 SSTable（有序文件）到 L0
4. L0 文件多 → 后台合并（Compaction）→ L1 → L2 → ...
```

### 1.2 LSM-Tree 读取路径

```
1. 查 MemTable（最新）→ 未中
2. 查 Memtable（Immutable）→ 未中
3. 查布隆过滤器（每 SSTable 一个）→ 有才查
4. 从上到下逐层查 SSTable → 合并返回最新版本
```

### 1.3 三放大权衡

| 放大 | 含义 | 优化 |
|------|------|------|
| 读放大 | 一个 key 可能查多层多个文件 | 布隆过滤器 + 层级合并 |
| 写放大 | Compaction 反复重写数据 | Tiered 压缩 + 调大目标层大小 |
| 空间放大 | 未合并的 SSTable 占用额外空间 | Leveled 压缩 + 及时 Compaction |

---

## 二、Column Family（列族）

### 2.1 概念

```
Column Family = 逻辑分组（类似数据库的表）
  → 每个 CF 有独立的 MemTable 和 SSTable
  → 不同 CF 的数据可以有不同的 Compaction 策略
  → 共享 WAL（写入时所有 CF 共用一个 WAL）

用途：
  1. TiKV 用不同 CF 存不同数据（default/lock/write）
  2. Kafka 事务状态用独立 CF
  3. Flink 状态后端用 CF 隔离不同算子状态
```

### 2.2 配置

```cpp
// 创建 Column Family
ColumnFamilyOptions cf_options;
cf_options.comparator = BytewiseComparator();
cf_options.compression = kLZ4Compression;

ColumnFamilyHandle* cf;
db->CreateColumnFamily(cf_options, "my_cf", &cf);

// 写入指定 CF
WriteOptions write_options;
db->Put(write_options, cf, "key", "value");
```

---

## 三、Write Batch（批量写入）

### 3.1 概念

```
Write Batch = 原子写入多个 key-value
  → 所有操作要么全部成功，要么全部失败
  → 一次磁盘写入（WAL 只写一条）

原子性保证：
  WriteBatch batch;
  batch.Put(cf1, "key1", "value1");
  batch.Put(cf2, "key2", "value2");
  db->Write(write_options, &batch);  // 原子写入
```

### 3.2 适用场景

| 场景 | 说明 |
|------|------|
| 跨 CF 原子写 | 两个 CF 的数据必须一致 |
| 批量导入 | 多条数据一次性写入，减少 WAL 写次数 |
| 事务实现 | Write Batch 是事务的基础 |

---

## 四、事务模型

### 4.1 Pessimistic Transaction

```
悲观事务 = 先加锁再操作
  → WriteBatchWithIndex + 锁管理
  → 适合冲突频繁的场景

TransactionOptions txn_options;
txn_options.set_write_batch_with_index(true);

Transaction* txn = db->BeginTransaction(write_options, txn_options);
txn->Put("key1", "value1");
txn->Put("key2", "value2");
txn->Commit();  // 原子提交
```

### 4.2 Optimistic Transaction

```
乐观事务 = 先操作，提交时才检查冲突
  → 冲突少时性能更好
  → 冲突多时重试成本高

TransactionOptions txn_options;
txn_options.set_optimistic(true);

Transaction* txn = db->BeginTransaction(write_options, txn_options);
txn->Put("key1", "value1");
Status s = txn->Commit();  // 冲突时返回 Status::TxnConflict()
```

### 4.3 事务 vs Write Batch

| 特性 | Write Batch | Transaction |
|------|-------------|-------------|
| 原子性 | ✅ | ✅ |
| 冲突检测 | ❌ | ✅（悲观/乐观） |
| 跨 WriteBatch | ❌ | ✅ |
| 性能 | 极高 | 高（有锁/检测开销） |

---

## 五、Merge Operator

### 5.1 概念

```
Merge Operator = 自定义合并逻辑
  → 写入时不直接覆盖，而是标记为 Merge
  → 读取时才执行合并（延迟计算）

典型应用：
  计数器：Put(10) + Merge(5) → Get() = 15
  列表：Put([a,b]) + Merge([c]) → Get() = [a,b,c]
  集合：Put({1,2}) + Merge({3}) → Get() = {1,2,3}
```

### 5.2 实现

```cpp
class CounterMergeOperator : public MergeOperator {
 public:
  virtual bool FullMergeV2(...) {
    // 合并逻辑：将所有值相加
    int64_t sum = 0;
    for (auto& operand : operands) {
      sum += DecodeFixed64(operand.data());
    }
    *new_value = EncodeFixed64(sum);
    return true;
  }
};

// 写入
db->Merge(write_options, "counter", EncodeFixed64(10));
db->Merge(write_options, "counter", EncodeFixed64(5));

// 读取：返回合并后的值
db->Get(read_options, "counter", &value);  // value = 15
```

---

## 六、Compaction 策略

| 策略 | 原理 | 适用 |
|------|------|------|
| Leveled | 每层大小指数增长，相邻层合并 | 读密集、低空间放大 |
| Tiered（Universal） | 同层多文件堆叠，满 N 个再合并 | 写密集、低写放大 |
| FIFO | 只管时间窗口，老文件直接删 | 日志类短期数据 |

---

## 七、生产调优

### 7.1 关键参数

| 参数 | 说明 | 建议 |
|------|------|------|
| `write_buffer_size` | MemTable 大小 | 64MB（写密集可调大） |
| `max_write_buffer_number` | MemTable 数量 | 3~4 |
| `level0_file_num_compaction_trigger` | L0 文件触发 Compaction | 4 |
| `max_bytes_for_level_base` | L1 大小 | 256MB |
| `max_bytes_for_level_multiplier` | 层级倍数 | 10 |
| `target_file_size_base` | SSTable 大小 | 64MB |
| `max_background_compactions` | 后台 Compaction 线程 | 4~8 |
| `max_background_flushes` | 后台 Flush 线程 | 2 |
| `bloom_bits_per_key` | 布隆过滤器 | 10（读密集可调大） |
| `block_cache_size` | 块缓存 | 8GB~数据量 10% |

### 7.2 读优化

```
布隆过滤器：
  bits_per_key = 10（0.98 命中率）
  bits_per_key = 15（0.99 命中率）

Block Cache：
  cache_size = 数据量 × 10%~20%
  使用 LRU Cache

压缩：
  读密集：LZ4（平衡压缩率和速度）
  写密集：Snappy（压缩快）
  冷数据：ZSTD（压缩率高）
```

### 7.3 写优化

```
Write Buffer：
  write_buffer_size = 128MB~256MB（写密集）
  max_write_buffer_number = 4

WAL：
  WAL 日志压缩（减少磁盘空间）
  关闭 WAL（丢数据风险，仅测试用）

Batch：
  批量写入减少 WAL 写次数
```

---

## 八、常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 写放大高 | Compaction 重写数据 | Tiered 压缩 + 调大目标层大小 |
| 读延迟高 | 多层查询 | 布隆过滤器 + Block Cache |
| 空间放大 | SSTable 未及时合并 | Leveled 压缩 |
| OOM | MemTable + Block Cache 过大 | 调整 write_buffer_size + cache_size |
| Compaction 积压 | 写入太快 | 增加 Compaction 线程 + 调大 MemTable |

---

## 九、与其他板块的关系

- TiDB 原理见「[TiDB 与 NewSQL](./TiDB与NewSQL.md)」；
- Kafka 事务见「[Kafka](./Kafka.md)」；
- Flink 状态后端见「[Apache Flink 流处理](./ApacheFlink流处理.md)」；
- 与 B+Tree（MySQL InnoDB）对照理解两种存储世界观。

> 一句话：**RocksDB = LSM 顺序写让写吞吐拉满，Column Family 逻辑隔离，Write Batch 原子写，事务模型支持悲观/乐观——生产调优三板斧：布隆过滤器 + Block Cache + Compaction 策略**。
