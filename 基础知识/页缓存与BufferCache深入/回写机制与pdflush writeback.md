> 对应 Kleppmann《DDIA》「Storage and Retrieval」与 Linux 内核 Documentation（admin-guide/mm/）。

## 一、背景与挑战
写文件先入页缓存（脏页），若不及时落盘，崩溃会丢数据且缓存被脏页占满。挑战是「延迟写」以聚合 IO、提升吞吐，同时「按时回写」以限制丢失窗口与脏页比例。

## 二、核心原理
脏页通过回写（writeback）刷到磁盘。早期用 pdflush 线程池；现代由每文件系统/每设备的工作队列（writeback worker，bdi_writeback）负责。触发条件包括：脏页超过 dirty_ratio/dirty_bytes、超过 dirty_background_ratio 后台启动、定时周期（dirty_expire_centisecs）、以及显式 sync/fsync。回写按 inode 的脏页链表批量写，聚合相邻位。

## 三、形式化与数学基础
设系统可写内存 M，脏页 d。阈值：
```
dirty_background_ratio * M  -> 启动后台回写（不阻塞应用）
dirty_ratio * M             -> 应用写路径被 throttle（阻塞直到回写降下来）
```
回写带宽须满足：
```
write_bandwidth_app <= disk_write_bandwidth   （长期）
否则脏页单调增，最终触发 throttle
```

## 四、代码实现
```c
// mm/page-writeback.c（简化）
static void balance_dirty_pages(struct address_space *mapping, ...)
{
    if (dirty_pages > background_thresh)
        wakeup_flusher_threads(bdi);          // 后台回写
    if (dirty_pages > throttle_thresh) {
        // 阻塞当前写者，直到回写使其回落
        io_schedule_timeout(pause);
    }
}
// 回写 worker
static long wb_writeback(struct bdi_writeback *wb, ...)
{
    // 遍历脏 inode，调用 a_ops->writepage 批量落盘
    while ((inode = wb_inode_busy(wb)))
        writeback_sb_inodes(wb, inode, &work);
}
```

## 五、与其他技术对比
- 直写（write-through）：每次写都落盘，安全但慢。
- 写回（write-back，默认）：先缓存后批量回写，快但需脏页管理。
- pdflush（旧）：全局线程池；现代 bdi 每设备 worker 更可扩展。
- fsync：强制同步特定文件，绕过周期阈值。

## 六、常见误区
- 误区：写返回即落盘。默认写回模式只入缓存，由回写异步刷盘。
- 误区：脏页比例只影响性能。超 dirty_ratio 会直接阻塞写者。

## 七、与开源书/权威来源对应
- Kleppmann《DDIA》第 3 章讨论「日志结构」「写缓冲」的 IO 聚合思想。
- Linux 内核 Documentation/admin-guide/mm/writeback.rst 描述阈值。
- GitHub Vonng/ddia 的存储引擎笔记类比 write-back。

## 八、面试题
1. dirty_background_ratio 与 dirty_ratio 的区别？
2. 写回为什么比直写快？
3. 什么会触发应用写被阻塞？

## 九、演进与趋势
pdflush 演进为 per-bdi writeback（2.6.32），支持 cgroup 级回写（memcg writeback）限制容器脏页，避免单容器污染整机。

## 十、小结
回写机制以「延迟写 + 阈值触发」聚合磁盘 IO，dirty_background/dirty_ratio 在性能与数据安全间划分边界，是写回缓存的核心治理。
