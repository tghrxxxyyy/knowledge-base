> 对应 Linux 内核 Documentation（filesystems/ext4/journal.rst）与 Silberschatz《Operating System Concepts》。

## 一、背景与挑战
JBD2（Journaling Block Device 2）是 ext4 的日志层。它必须把多个并发元数据更新聚合成一个可原子提交的事务，并在提交后安全地「检查点」到主文件系统，最终回收日志空间。挑战是高并发下既保证原子又保证吞吐。

## 二、核心原理
JBD2 把时间划分为一系列事务（running → committing → checkpointed）。新修改进入当前 running 事务；事务达到体积/时间阈值后进入 committing，依次写描述块、数据块、提交块（带序列号与校验和）；提交后再由 checkpoint 线程把已提交内容写到主结构并释放日志槽。handle 与 transaction 的绑定保证同一原子操作的若干修改同属一事。

## 三、形式化与数学基础
事务提交正确性靠顺序与持久性：
```
write(descriptor)
write(data_blocks)
write(commit_block with checksum C, seq S)
barrier()                              // 防止重排
=> 只有 commit_block 持久后，才算提交成功
```
检查点回收条件：事务 T 的所有元数据已写回主区且 fsync 完成，则释放其日志槽位，使环形日志可复用。

## 四、代码实现
```c
// fs/jbd2/commit.c（简化）
void jbd2_journal_commit_transaction(journal_t *journal)
{
    // 1. 收集 running 事务的缓冲区
    while (commit_transaction->t_buffers) {
        jbd2_journal_write_metadata_buffer(...);
    }
    // 2. 写提交块
    jbd2_write_commit_record(commit_transaction);
    // 3. 屏障保证顺序
    blkdev_issue_flush(journal->j_dev);
    // 4. 标记 checkpoint，后续回收
    journal->j_checkpoint_transactions = commit_transaction;
}
```

## 五、与其他技术对比
- JBD（ext3）：单事务串行，扩展性差。
- JBD2（ext4）：支持 64 位、校验和、多事务并行提交，性能更好。
- 用户态 WAL（如 SQLite）：同样「提交块+fsync」思想，但运行在应用层。

## 六、常见误区
- 误区：日志写完后元数据就立即可用。需 commit 块落盘且（有序模式下）数据先落盘。
- 误区：JBD2 与文件系统绑定。它是通用块设备日志层，可被其他文件系统复用思路。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/filesystems/ext4/journal.rst 详细记录 JBD2 结构。
- Silberschatz《Operating System Concepts》讨论事务提交与检查点。
- GitHub Vonng/ddia 的「日志结构」章节类比提交语义。

## 八、面试题
1. JBD2 中 running 与 committing 事务的区别？
2. 为什么提交块需要校验和？
3. 检查点的作用是什么，何时释放日志槽？

## 九、演进与趋势
JBD2 加入日志校验和抵御「重放损坏块」；ext4 fast_commit 绕过完整事务机制，直接记录 inode 变更以加速小文件场景。

## 十、小结
JBD2 用事务聚合 + 提交块 + 检查点把并发元数据更新变成可原子恢复的单位，是 ext4 崩溃安全的核心引擎。
