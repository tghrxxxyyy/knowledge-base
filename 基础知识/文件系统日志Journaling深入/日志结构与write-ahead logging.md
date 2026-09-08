> 对应 Silberschatz《Operating System Concepts》「Recovery」与 Tanenbaum《Modern Operating Systems》「File System Recovery」。

## 一、背景与挑战
突发断电会使元数据更新（如位图、inode）处于「写了一半」的不一致状态，fsck 全盘扫描代价高昂。挑战是在不牺牲太多性能的前提下，让崩溃后能快速重放或撤销未完成事务，恢复一致。

## 二、核心原理
日志（journal/log）是一段环形保留区。写元数据前先把「意图记录」以事务形式追加到日志（write-ahead），并标记提交；崩溃后只需扫描日志重放已提交事务或丢弃未提交事务，而非检查整个文件系统。典型事务含：描述块（哪个元数据、哪个磁盘块）、更新数据块、提交块。

## 三、形式化与数学基础
事务 T 满足原子性：要么完全生效，要么完全不生效。日志提交用「先写日志、后写数据」的 WAL 顺序保证：
```
1. write(log_record(T))   // 持久
2. fsync(log)             // 确保落盘
3. apply(T) to real blocks
4. (可选) checkpoint 后回收日志槽
```
崩溃恢复时：若日志含 commit 记录则重放 apply；若无 commit（写 log 中途断电）则丢弃。重放幂等：因 apply 可重复执行而不破坏一致性。

## 四、代码实现
```c
// 概念性伪代码（基于 ext3/ext4 JBD2 思想）
struct journal_header {
    __u32  magic;
    __u32  blocktype;     // descriptor / commit / revoke
    __u32  sequence;
};
void journal_commit_transaction(handle_t *h)
{
    write_descriptor_blocks(h);   // 1. 描述+数据
    write_commit_block(h);        // 2. 提交块（含 checksum）
    fsync(journal_fd);            // 3. 落盘
    checkpoint(h);                // 4. 回收
}
```

## 五、与其他技术对比
- 无日志 + fsck：正确性靠扫描，恢复慢。
- 日志（metadata-only）：只保护元数据，文件数据仍可能丢（ordered/writeback 下不同）。
- 全日志（data journaling）：最安全但写放大一倍。
- COW（btrfs/ZFS）：用写时复制替代日志，思路不同。

## 六、常见误区
- 误区：开启日志就绝对不丢数据。默认 ext4 多为 ordered，只保元数据一致，文件内容可能截断。
- 误区：日志越大越安全。日志只是「飞行中事务」的暂存，过大只增写放大。

## 七、与开源书/权威来源对应
- Silberschatz《Operating System Concepts》第 7 章「Recovery」讲 WAL 与日志。
- Tanenbaum《Modern Operating Systems》讨论文件系统崩溃恢复。
- 内核 Documentation/filesystems/ext4/ 描述 JBD2。

## 八、面试题
1. 为什么必须先写日志再改真正元数据（WAL）？
2. 崩溃后日志里没有 commit 块的事务如何处理？
3. ordered 与 writeback 模式对数据安全的区别？

## 九、演进与趋势
从 ext2（无日志）到 ext3（JBD）再到 ext4（JBD2，支持 checksum、大事务）；现代 btrfs/ZFS 转向 COW+校验和，部分场景下替代传统日志。

## 十、小结
日志用 WAL 把「一致性恢复」从全文件系统扫描降为局部日志重放，是崩溃安全与性能之间成熟且高效的折中。
