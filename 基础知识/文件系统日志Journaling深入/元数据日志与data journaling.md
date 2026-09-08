> 对应 Tanenbaum《Modern Operating Systems》「Journaling File Systems」与 Linux 内核 ext4 文档。

## 一、背景与挑战
日志可保护「元数据」也可保护「文件数据」。全日志最安全但写放大严重；只日志元数据更快但文件内容可能部分丢失。挑战是选择合适的日志语义，平衡安全与吞吐。

## 二、核心原理
ext4 提供三种日志模式（mount 选项）：
- writeback：仅日志元数据，数据写盘顺序不保证，崩溃可能读到旧/新混合内容。
- ordered（默认）：日志元数据，但保证「数据先落盘、元数据提交在后」，避免读到未写的数据块。
- data=journal：数据与元数据都进日志，最安全、写放大最大。

## 三、形式化与数学基础
设一次写操作的额外写量为 Δ。各模式写放大近似：
```
writeback  : Δ ≈ size(metadata)
ordered    : Δ ≈ size(metadata)            // 数据写一次到主区
journal    : Δ ≈ size(metadata) + size(data)  // 数据写两次（日志+主区）
```
持久化顺序约束（ordered）要求：
```
data_written_before(metadata_commit)  // 数据先于其元数据提交落盘
```

## 四、代码实现
```c
// fs/ext4/super.c mount 选项解析（简化）
static int parse_options(char *options, struct super_block *sb)
{
    if (!strcmp(token, "data=journal")) {
        sbi->s_mount_opt |= EXT4_MOUNT_JOURNAL_DATA;
    } else if (!strcmp(token, "data=ordered")) {
        sbi->s_mount_opt |= EXT4_MOUNT_ORDERED_DATA;  // 默认
    } else if (!strcmp(token, "data=writeback")) {
        sbi->s_mount_opt |= EXT4_MOUNT_WRITEBACK_DATA;
    }
    return 0;
}
```

## 五、与其他技术对比
- data=journal：银行/数据库类强一致，代价高。
- data=ordered：通用默认，保证不读垃圾数据。
- data=writeback：高吞吐日志/消息队列等可容忍内容不一致场景。
- 关闭日志（ext2）：最快但恢复靠 fsck。

## 六、常见误区
- 误区：ordered 模式保证文件内容完整。它只保证「不会读到未写入的磁盘块」，不保证应用写的事务语义。
- 误区：journal 模式对所有负载都最好。大量小写的写放大使其反而更慢。

## 七、与开源书/权威来源对应
- Tanenbaum《Modern Operating Systems》对比 journaling 模式。
- Linux 内核 Documentation/filesystems/ext4/journal.rst 定义三种模式。
- GitHub Vonng/ddia 的「存储引擎」章节类比 WAL 与写放大。

## 八、面试题
1. ordered 模式如何保证不读到垃圾数据？
2. data=journal 写放大为何是两倍？
3. 什么业务场景适合 writeback？

## 九、演进与趋势
ext4 为 ordered 引入「延迟分配 + 校验和日志」，并在 3.x 后默认开启日志校验和（防止重放损坏事务）；同时支持「fast_commit」减少小事务日志开销。

## 十、小结
元数据与数据日志模式是安全/性能的连续谱：ordered 是通用默认，journal 用于强一致，writeback 用于可容忍内容不一致的高吞吐负载。
