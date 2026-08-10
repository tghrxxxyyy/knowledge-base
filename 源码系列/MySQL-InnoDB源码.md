# MySQL InnoDB 源码精读

## 〇、本体介绍

**InnoDB** 是 MySQL 默认存储引擎，定位「**事务安全 + 崩溃恢复 + 高并发**」的 B+ 树存储。读其源码/原理，核心是搞懂**索引为什么用 B+ 树、事务怎么靠 redo/undo 实现 ACID、Buffer Pool 怎么扛高并发、MVCC 怎么做到读写不阻塞**。

**为什么读**：索引（回表/最左前缀）、事务隔离级别、锁（行锁/间隙锁）、死锁、慢 SQL、主从复制——这些调优与面试的根都在 InnoDB。

**核心结构**：B+ 树索引、Buffer Pool、redo log（重做）、undo log（回滚）、double write、MVCC（Undo + ReadView）。

---

## 一、索引：B+ 树

- **为什么 B+ 树不是 B 树/红黑树/哈希**：树高低（千万行 3~4 层）、**叶子串成双向链表**利于范围扫描、非叶只存键省空间、查询稳定 O(log n)。哈希仅等值、红黑树高且不利于范围、B 树非叶存数据不利范围。
- **聚簇索引（Clustered）**：**主键即数据**，整行存在叶子；**二级索引**叶子存「索引键 + 主键值」，查非索引列要**回表**（用主键再查聚簇）。
- **最左前缀**：联合索引 `(a,b,c)` 按序建 B+ 树，只能从最左匹配；跳列/范围后失效。
- **页（16KB）**：索引与数据都以页为单位，B+ 树节点 = 页；页内槽(slot)二分定位行。

### 1.1 深挖：B+ 树节点的页内结构

```text
Page(16KB)
├── File Header(38B)        # 页号、上一页/下一页指针(叶子双向链表)
├── Page Header(56B)        # 记录数、页类型(B+树节点/undo/redo等)
├── Infimum + Supremum      # 伪记录(虚拟最小/最大)
├── User Records            # 实际行记录(按主键有序, 头含 next_record 指针链)
├── Page Directory          # 槽(slot): 每 4~8 条记录一个槽, 槽内二分
└── File Trailer(8B)        # 校验和, 防页半写
```

- **查找路径**：页内先按 **Page Directory 二分**定位槽 → 槽内沿 `next_record` 链表顺序找目标行——「二分 + 链表」的组合。
- **分裂**：页满插入 → B+ 树节点分裂（新页 + 父节点插键），顺序主键插入只在最右页分裂，**这就是自增主键快的源码原因**。

---

## 二、Buffer Pool（缓冲池）

- **核心**：把磁盘页缓存在内存，读命中免 IO、写先改缓冲后刷盘；是 InnoDB 性能命脉。
- **LRU 改进**：InnoDB LRU 分 **young/old 两区**（old 占 37%），新页先进 old 区，停留超 `innodb_old_blocks_time` 才升 young——**防全表扫描把热点冲掉**（普通 LRU 的缺陷）。
- **刷脏**：后台线程按 LRU/flush list 异步刷盘；redo 保证脏页未刷也能恢复。

### 2.1 深挖：三链表 + 刷盘线程（读源码的地图）

| 链表 | 作用 |
|------|------|
| **free list** | 空闲页（可分配） |
| **LRU list** | 命中/新读的页（含 young/old 两区） |
| **flush list** | 脏页（按 oldest modification LSN 排序，保证 redo 顺序刷） |

```mermaid
flowchart LR
    A[读请求] -->|free list 取页| B[读磁盘到 buffer]
    B --> C[LRU list 头部加入 old 区]
    C -->|innodb_old_blocks_time 到期| D[升入 young 区]
    D -->|被修改| E[挂入 flush list]
    E -->|后台线程 异步刷盘| F[落盘后移出 flush list]
    F -->|页不再引用| G[回到 free list]
```

- **后台线程**：`page_cleaner`（刷脏，动态调速）、`purge`（清 undo）、`io_read/io_write` 线程；刷盘节流避免「刷脏跟不上写入」导致 `InnoDB: page_cleaner 1000ms 超时` 告警。
- **预读**：`innodb_read_ahead_threshold` 触发线性预读（相邻页一起读），`random read ahead` 可关。

---

## 三、事务与日志（ACID）

- **redo log（重做）**：**物理逻辑日志**，记录「页的哪改了啥」，用于**崩溃恢复**（保证 D 持久性）。**WAL（先写日志）**：事务提交前 redo 落盘，脏页可延后刷。
- **undo log（回滚）**：记录**反向操作**，用于**回滚（A 原子性）**与 **MVCC 旧版本**（见下）。
- **binlog（归档/复制）**：Server 层逻辑日志，用于**主从复制与点位恢复**（与 redo 不同层）。
- **两阶段提交（2PC）**：`redo prepare → binlog 写 → redo commit`，保证 redo 与 binlog 一致，故障恢复时据 binlog 决定 redo 是否提交——这是主从不丢数据的关键。

### 3.1 深挖：redo 的组提交与 LSN（写入路径）

```text
1. 事务修改页 → 生成 redo 记录 → 写入 log buffer（内存）
2. 提交时：log_flusher 把 log buffer 刷到 redo log file
3. 组提交(Group Commit)：多个事务的 fsync 合并成一次 → 高并发下提交吞吐关键
4. LSN(Log Sequence Number)：日志单调递增序号，页上有 page LSN，redo 记录有目标 LSN
   恢复时：从 checkpoint LSN 开始重放 redo，跳到各页对应 LSN
```

- **checkpoint**：记录「已刷盘的 LSN 位置」；崩溃恢复从 checkpoint 之后重放，缩短恢复时间。
- **`innodb_flush_log_at_trx_commit`**：1（每次提交 fsync，最稳）/ 2（每次提交写 OS 缓存，每秒刷盘）/ 0（每秒刷一次，最快易丢）——**性能和可靠性的核心旋钮**。
- **redo 文件循环写**（`ib_logfile0/1`）：写满触发 checkpoint 推进；redo 文件太小会频繁 checkpoint 拖慢写入（`innodb_log_file_size` 调大的意义）。

### 3.2 深挖：undo 链与 purge

- undo 类型：**insert undo**（事务回滚用，用完即清）、**update undo**（MVCC 用，含旧值 + 修改前的 trx_id）。
- **purge 线程**：回收「没有任何活跃事务可见」的旧版本（无读视图引用它）；**长事务/未提交事务会阻塞 purge** → undo 膨胀 → 磁盘涨、回滚段压力大——「为什么长事务要不得」的源码答案。
- `innodb_purge_threads` 与 `innodb_max_purge_lag` 控制 purge 速度。

---

## 四、MVCC（多版本并发控制）

- **原理**：每行有隐藏列 `trx_id`（最后修改事务）、`roll_pointer`（指向 undo 旧版本）；**undo 链**串起历史版本。
- **ReadView**：读时生成「当前活跃事务快照」，按规则（已提交可见、未提交不可见）沿 undo 链找「对我可见的版本」。
- **隔离级别**：
  - **RC（读已提交）**：每次读生成新 ReadView → 只看已提交。
  - **RR（可重复读）**：事务内首次读生成 ReadView 复用 → 可重复读，且靠 **Next-Key Lock** 防幻读。
  - RU（读未提交，看最新）/ Serializable（加锁串行）。

### 4.1 深挖：ReadView 可见性判定（源码视角）

ReadView 生成时记录四个关键量：

| 字段 | 含义 |
|------|------|
| `m_ids` | 生成时刻所有**活跃事务**列表 |
| `m_low_limit_id` | 下一个将被分配的事务 id（最大） |
| `m_up_limit_id` | m_ids 中最小的活跃事务 id |
| `m_creator_trx_id` | 创建者自己的事务 id |

**可见性判断**（对某版本 trx_id = X）：

```text
if X == 当前事务(自己)          → 可见（自己的修改）
else if X < m_up_limit_id      → 已提交（在快照前就存在）→ 可见
else if X >= m_low_limit_id    → 快照之后才创建 → 不可见
else                           → 在 m_ids 里则活跃(不可见)/否则已提交(可见)
```

不可见就沿 `roll_pointer` 找上一版本，重复判定直到可见或到头（NULL = 已删除）。

> **这就是「读不加锁也能看到一致快照」的完整实现**：普通 SELECT 不取任何锁，只做可见性判断——读写互不阻塞的根本。

---

## 五、锁

- **行锁**：`Record Lock`（锁索引记录）。
- **间隙锁（Gap Lock）+ Next-Key Lock**：锁「记录+前面的间隙」，RR 下**防幻读**（范围查询锁住间隙，别的事务插不进）。
- **意向锁（IS/IX）**：表级，快速判断表内是否有行锁，避免逐行检查。
- **死锁**：两个事务互相等待对方锁；InnoDB 检测并回滚「代价小」的一方；`innodb_lock_wait_timeout` 超时回滚。

### 5.1 深挖：锁结构与加锁流程

- 锁对象 `lock_t`：包含 `lock_mode`（S/X/IS/IX）、`lock_type`（TABLE/RECORD）、`index`（在哪个索引上）、`space+page+heap_no`（定位记录）。
- **加锁路径**：`lock_rec_lock` → 先查锁表（`lock_sys` 哈希表，按 space+page 组织）→ 无冲突直接加（`lock_table` 是内存哈希）→ 冲突则进 **锁等待队列**（`lock_wait`），等待事件触发唤醒。
- **锁是加在索引记录上**：**没有索引 → 全表记录加锁**（或退化为表锁/next-key 锁全表）——「update 不带 where 或没走索引」锁全表的源码原因。
- **死锁检测**：`lock_wait` 图用「等待-持有」关系构建**有向图**，后台线程 DFS 检测环，回滚 undo 量最小的事务；检测成本高可 `innodb_deadlock_detect=OFF`（高并发短事务场景慎用）。

---

## 六、其他

- **double write**：先写 doublewrite buffer（顺序）再写数据页，防「页写一半崩溃」的半页问题（部分写失效）。
- **change buffer**：对非唯一二级索引的写，缓冲 merge，减随机 IO（唯一索引因要查重不能用）。
- **自适应哈希索引（AHI）**：对热点等值查询建哈希加速。

---

## 七、生产实践：从源码看常见坑

1. **长事务阻塞 purge**：开启事务长时间不提交 → undo 膨胀 → 磁盘涨、历史版本堆叠、回滚段压力；监控 `information_schema.innodb_trx` 找长事务。
2. **慢查询导致锁等待**：慢更新持有行锁久 → 其他事务 `LOCK WAIT`；`performance_schema.data_lock_waits` 查阻塞链。
3. **redo 太小频繁 checkpoint**：`log file` 写满被迫提前刷脏 → 写吞吐下降；监控 `log_waits` 状态变量，调 `innodb_log_file_size`。
4. **buffer pool 命中率低**：`show engine innodb status` 的 `Buffer pool hit rate` < 99% → 加 `innodb_buffer_pool_size` 或优化查询。
5. **页分裂碎片**：随机主键（UUID）插入 → 页频繁分裂、碎片多 → 用自增/雪花主键（见「分布式ID」）。
6. **delete 不物理删**：删除只是标记 + 后续 purge 清理，表空间不立即缩小 → 大表 delete 后 `optimize table` 或改分区表。
7. **二级索引回表慢**：覆盖索引不足 → 频繁回表；用 `explain` 看 `Using index`（覆盖）/ `Using where`（回表）。

---

## 八、与其他板块的关系

- **基础知识 / mysql知识**：SQL/索引/慢查询的落地层；本篇是原理深潜。
- **分布式系统理论**：2PC、MVCC 与隔离级别、redo/undo 与一致性。
- **场景设计 / 缓存一致性**：binlog 常用于 Canal 同步（见 中间件/数据同步CDC-Canal.md）。
- **并发编程**：Buffer Pool、锁与 MVCC 的并发控制思想。
- **分库分表 / 数据迁移**：binlog 位点、主从复制是迁移双写的基础。

---

## 九、速查表

| 机制 | 作用 |
|------|------|
| B+ 树 | 低树高、范围友好 |
| Buffer Pool | 内存缓存、LRU 改进 |
| 三链表 | free/LRU/flush 管理页 |
| redo | 崩溃恢复（持久性） |
| undo | 回滚 + MVCC |
| 2PC | redo 与 binlog 一致 |
| MVCC | 读写不阻塞 |
| ReadView | 可见性判定 |
| Next-Key Lock | RR 防幻读 |

---

## 面试高频问题（30+ 条）

1. **为什么 InnoDB 用 B+ 树？** 树高低、叶子链表利范围、非叶省空间、查询稳定 O(log n)。
2. **聚簇 vs 二级索引？** 聚簇主键即数据；二级存键+主键，需回表。
3. **什么是回表？** 二级索引查到主键后再查聚簇拿整行；覆盖索引可避免。
4. **覆盖索引？** 查询列都在索引里，不必回表，快。
5. **最左前缀原则？** 联合索引按序匹配，跳列/范围后失效。
6. **为什么索引用 16KB 页？** 与磁盘块对齐，减少 IO；页内槽二分定位。
7. **页内查找怎么做的？** Page Directory 槽二分 + 记录链表顺序扫描。
8. **为什么自增主键快？** 顺序插入只在最右页分裂，免随机页分裂与碎片。
9. **Buffer Pool 作用？** 缓存磁盘页，命中免 IO、写缓冲后刷。
10. **InnoDB LRU 怎么改？** 分 young/old 两区，防全表扫描冲热点。
11. **free/LRU/flush 链表？** free 空闲页、LRU 缓存页、flush 脏页（按 LSN 排序刷盘）。
12. **redo log 是什么、为什么需要？** 物理日志，崩溃恢复保持久性；WAL 先写日志。
13. **组提交是什么？** 多个事务的 fsync 合并一次，提升提交吞吐。
14. **LSN 与 checkpoint？** LSN 日志序号；checkpoint 记已刷位置，恢复从其后重放。
15. **innodb_flush_log_at_trx_commit 三个值？** 1 每次 fsync(稳)/2 每秒刷(OS缓存)/0 每秒(最快)。
16. **undo log 作用？** 回滚（原子性）+ 提供 MVCC 旧版本。
17. **purge 是干什么的？** 回收无活跃事务引用的旧版本；长事务阻塞 purge → undo 膨胀。
18. **binlog 和 redo 区别？** binlog Server 层逻辑日志（复制/恢复）；redo 引擎层物理日志（崩溃恢复）。
19. **两阶段提交？** redo prepare→binlog→redo commit，保 redo/binlog 一致，主从不丢。
20. **MVCC 原理？** 行隐藏 trx_id/roll_pointer + undo 链；ReadView 判可见版本。
21. **ReadView 怎么判可见？** 四量（m_ids/up_limit/low_limit/creator），按 trx_id 比较 + 沿 undo 链回溯。
22. **RC 和 RR 区别？** RC 每次读新 ReadView（读已提交）；RR 复用首读 ReadView（可重复读）。
23. **RR 怎么防幻读？** Next-Key Lock 锁间隙，插入被挡。
24. **Next-Key Lock 是什么？** 记录锁+间隙锁，锁区间防幻读。
25. **行锁有哪些？** Record Lock、Gap Lock、Next-Key Lock、意向锁。
26. **锁加在哪里？** 索引记录上；没走索引 → 锁全表记录。
27. **死锁怎么处理？** InnoDB 检测回滚代价小的一方；超时回滚。
28. **double write 解决什么？** 防页写一半崩溃（半页问题），先写顺序 buffer 再写数据页。
29. **change buffer？** 缓存非唯一二级索引写，减随机 IO；唯一索引不能用。
30. **为什么唯一索引不能用 change buffer？** 写入要查重，必读页，缓冲无意义。
31. **长事务有什么危害？** 阻塞 purge、undo 膨胀、锁持久、主从延迟——监控 innodb_trx。
32. **redo 文件太小会怎样？** checkpoint 频繁 → 刷盘跟不上 → 写慢；调大 innodb_log_file_size。
