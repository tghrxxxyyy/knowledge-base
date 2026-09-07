# WAL与MemTable刷盘机制

> 对应 Mohan et al. 1992, *ARIES*（WAL 原则），以及 cmu-db/15445-course 关于缓冲与日志的 lecture。

## 一、背景与挑战
内存中的 MemTable 断电即失，必须保证已提交事务不丢、未提交事务可回滚。WAL（Write-Ahead Logging）通过“先写日志再改内存/磁盘”的顺序，把随机写转为顺序日志写，并提供崩溃恢复依据。

## 二、核心原理
每次写先追加一条日志记录（含 LSN、事务 ID、redo/undo 信息）到 WAL 并 fsync，再写入 MemTable。MemTable 达到阈值后冻结，后台刷为 SSTable；刷盘完成且对应日志不再需要后才可截断 WAL。恢复时重放 WAL 重建 MemTable 状态。

## 三、形式化与数学基础
持久性条件（WAL 规则）：
$$ \text{Force } \log \text{ before } commit $$
恢复时重做已提交（redo），撤销未提交（undo）。LSN 单调递增保证顺序：
$$ LSN_1 < LSN_2 \implies \text{record}_1 \text{ 先于 record}_2 $$
刷盘安全点：SSTable 最大 LSN $L_{flush}$，可截断 $LSN < L_{flush}$ 的日志。

## 四、代码实现
```c
// WAL 追加写（仅示意）
int wal_append(WAL* w, txn_id t, const char* rec, size_t n) {
    lsn_t lsn = ++w->last_lsn;
    log_entry e = { lsn, t, rec, n };
    pwrite(w->fd, &e, sizeof(e), w->tail);   // 顺序追加
    w->tail += sizeof(e);
    fsync(w->fd);                            // 提交前刷盘
    return lsn;
}
```

## 五、与其他技术对比
WAL 与“直写（force 每页）”相比把随机写变顺序写；与 shadow paging 相比，WAL 只追加、恢复更增量。PostgreSQL/InnoDB/RocksDB 均基于 WAL/redo 思想。

## 六、常见误区
1) 认为 WAL 可不同步 fsync——不 fsync 会丢提交。
2) 误以为 MemTable 刷盘后即可删全部 WAL——仍有未下沉的已提交项。
3) 忽视 group commit 导致 fsync 次数爆炸。

## 七、与开源书/权威来源对应
- Mohan et al. 1992（ARIES, WAL）。
- cmu-db/15445-course（logging & recovery）。
- Vonng/ddia 第 3 章。

## 八、面试题
1) 为什么必须 WAL 先于数据刷盘？
2) 崩溃恢复时 redo/undo 分别处理什么？
3) group commit 解决什么问题？

## 九、演进与趋势
WAL 与 NVMe 直写、per-CPU WAL 降低锁争用、WAL 压缩、基于 io_uring 的零拷贝追加。

## 十、小结
WAL 是 LSM/事务引擎持久性的根基：顺序日志 + fsync + LSN 顺序，使内存结构可安全、可恢复。
