> 对应 Bryant & O'Hallaron《CSAPP》「I/O」章节与 Linux 内核 Documentation（block/barrier.txt 旧文档，现 writeback 文档）。

## 一、背景与挑战
应用调用 fsync 想确保数据已持久。但块层、磁盘控制器、磁盘自身都有易失缓存，若乱序或缓存未落盘即上报完成，崩溃仍会丢数据。挑战是让「完成」语义真正等于「已落盘」，同时不过度牺牲性能。

## 二、核心原理
fsync(fd) 把该文件相关的脏页与元数据强制刷到稳定存储并返回。为阻止「日志提交块先于数据块落盘」这类重排，内核/设备需要写屏障（barrier / flush+REQ_FUA）。现代设备用「队列排空 + 写命令带 FUA（Force Unit Access）或显式 flush」保证顺序持久。

## 三、形式化与数学基础
持久化顺序约束（WAL 必备）：
```
data_write  --flush-->  journal_commit_write  --flush-->  return
```
用 REQ_PREFLUSH | REQ_FUA 语义：
```
REQ_PREFLUSH : 该请求前所有写先落盘
REQ_FUA      : 该请求本身落盘后才返回完成
```
若设备声称「writeback cache 已禁用或带掉电保护」，可省略屏障而不破坏持久性。

## 四、代码实现
```c
// fs/ext4/fsync.c（简化）
int ext4_sync_file(struct file *file, loff_t start, loff_t end, int datasync)
{
    struct inode *inode = file->f_mapping->host;
    err = filemap_write_and_wait_range(inode->i_mapping, start, end);
    if (datasync && !(inode->i_state & I_DIRTY_DATASYNC))
        goto out;                         // 仅数据已同步
    err = jbd2_complete_transaction(journal, commit_tid);  // 等事务提交+落盘
    // blkdev_issue_flush 触发 REQ_PREFLUSH
out:
    return err;
}
```

## 五、与其他技术对比
- 无 fsync + 无屏障：快但不持久，易丢。
- fsync + 屏障：正确持久，代价为 flush 延迟。
- O_DIRECT：绕过页缓存，但仍需屏障保证顺序。
- 带掉电保护缓存的设备：可省屏障，性能更好。

## 六、常见误区
- 误区：write 返回即落盘。实际仅进入页缓存。
- 误区：fsync 只刷数据。它也确保相关元数据（如大小、时间戳）提交。

## 七、与开源书/权威来源对应
- Bryant & O'Hallaron《CSAPP》第 10 章解释 I/O 与持久化。
- Linux 内核 Documentation/block/writeback_cache_control.txt 讲 flush/FUA。
- GitHub Hansimov/csapp 的「系统级 I/O」笔记。

## 八、面试题
1. write 返回是否代表数据已落盘？
2. 为什么日志提交块前需要写屏障？
3. REQ_FUA 与 REQ_PREFLUSH 的区别？

## 九、演进与趋势
老式「barrier」标志被更细的 flush/FUA 语义取代；多队列块层（blk-mq）让屏障表达更精确，NVMe 的原子写与掉电保护进一步改变权衡。

## 十、小结
fsync 把脏数据推到稳定存储，屏障/flush/FUA 保证提交顺序真正持久，是数据库与日志系统正确性的基石。
