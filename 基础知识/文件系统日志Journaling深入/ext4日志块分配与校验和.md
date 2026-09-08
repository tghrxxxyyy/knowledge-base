> 对应 Linux 内核 Documentation（filesystems/ext4/）与 Tanenbaum《Modern Operating Systems》。

## 一、背景与挑战
日志自身也是磁盘结构，可能遭遇写入撕裂或静默损坏。若重放一段损坏的日志事务，会把错误固化进主文件系统。挑战是给日志块分配稳定空间，并用校验和检测损坏，避免「错误恢复」变「错误传播」。

## 二、核心原理
ext4 的日志位于文件系统的保留 inode（journal inode）或外部设备。日志以固定大小块（默认 4KiB，与文件系统块一致或可配置）环形写入。开启 metadata_checksum 后，每个日志描述块、提交块、revoke 块都带 crc32c 校验和；重放前校验，失败则跳过/报错，防止损坏扩散。

## 三、形式化与数学基础
设块内容为 B，校验和为 C = crc32c(seed, B)。重放验证：
```
verify: C_stored == crc32c(seed, B_read)
```
环形日志的槽位回收用序列号 seq 单调增，崩溃恢复只处理 [last_clean_seq, current_seq] 区间内的已提交事务，避免重复重放旧块。

## 四、代码实现
```c
// fs/jbd2/journal.c（简化，校验和写入）
int jbd2_journal_write_commit_record(journal_t *journal,
                                     transaction_t *commit_transaction)
{
    struct commit_header *hdr;
    hdr->h_magic = cpu_to_be32(JBD2_MAGIC_NUMBER);
    hdr->h_sequence = cpu_to_be32(commit_transaction->t_tid);
    hdr->h_chksum_type = JBD2_CRC32C_CHKSUM;
    hdr->h_chksum = cpu_to_be32(
        jbd2_chksum(journal, journal->j_csum_seed,
                    (void *)bh->b_data, bh->b_size));
    return 0;
}
```

## 五、与其他技术对比
- 无校验和日志：易因静默损坏传播错误。
- crc32c 校验日志：检测损坏但无纠错，配合重放幂等足够。
- ZFS/Btrfs 校验和+COW：更强，但架构不同。

## 六、常见误区
- 误区：日志校验和可纠错。它只检测，不修复，损坏块被跳过。
- 误区：校验和影响很大性能。crc32c 有硬件指令加速，开销可控。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/filesystems/ext4/checksums.rst 讲 metadata checksum。
- Tanenbaum《Modern Operating Systems》论及磁盘块完整性。
- GitHub Vonng/ddia 讨论校验和在存储系统中的作用。

## 八、面试题
1. 为什么日志块也需要校验和？
2. 重放时校验失败会怎样？
3. 环形日志如何用序列号避免重复重放？

## 九、演进与趋势
ext4 自 3.6 起逐步引入 64 位、校验和、fast_commit；日志块分配从固定到支持更灵活的 journal 位置与大小配置。

## 十、小结
ext4 通过稳定日志块分配与 crc32c 校验和，确保崩溃恢复「重放的是可信事务」，阻断了损坏日志的传播链。
