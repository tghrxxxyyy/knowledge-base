# MBR与GPT分区表结构

> 对应 Tanenbaum《Modern Operating Systems》与 UEFI 规范。

## 一、背景与挑战
磁盘需要被划分为可寻址的分区，旧方案 MBR 用 512 字节主引导记录，其中分区表仅 64 字节、4 个主分区项，且用 32 位 LBA 寻址，最大约 2 TiB。大容量盘与多分区需求催生了 GPT，它是 UEFI 规范的一部分，使用 64 位 LBA。

## 二、核心原理
MBR 位于 LBA 0，末尾是 0x55AA 引导标志，分区项记录起始与大小（以扇区计）。GPT 在 LBA 1 放保护 MBR（防旧工具误认空盘），LBA 2 起是 GPT 头与分区项数组，每项 128 字节，含类型 GUID、唯一 GUID、起止 LBA 与名称。GPT 在磁盘尾部冗余备份头以提升健壮性。

## 三、形式化与数学基础
MBR 单分区最大字节数由 32 位扇区计数决定：

$$ C_{mbr} = 2^{32} \times 512\,\text{B} \approx 2.2\,\text{TiB} $$

GPT 用 64 位 LBA，上限约为：

$$ C_{gpt} = 2^{64} \times 512\,\text{B} $$

分区数受限于分区项数组所占扇区数，典型 128 项。

## 四、代码实现
读取 GPT 头并校验签名（Linux 内核风格简化）：

```c
struct gpt_header {
    uint64_t signature;   // "EFI PART" = 0x5452415020494645
    uint32_t revision;
    uint32_t header_size;
    uint32_t crc32;
    uint64_t my_lba;
    uint64_t alt_lba;
    uint64_t first_usable_lba;
    uint64_t last_usable_lba;
    guid_t   disk_guid;
    uint64_t part_entries_lba;
    uint32_t num_parts;
    uint32_t part_entry_size;
    uint32_t part_crc32;
};

int is_gpt(struct gpt_header *h) {
    return h->signature == 0x5452415020494645ULL;
}
```

## 五、与其他技术对比
MBR 简单、工具生态广，但有 2 TiB 与 4 主分区硬限制，分区表无冗余。GPT 支持超大盘、任意数量分区、CRC 校验与备份，代价是必须 UEFI 或兼容层。

## 六、常见误区
认为逻辑分区可以无限多，扩展分区链仍有开销且易损；认为 GPT 不需要保护 MBR，实际保护 MBR 阻止旧工具把盘当空盘格式化；把 LBA 当物理扇区，现代盘逻辑块与物理块可能不一致。

## 七、与开源书/权威来源对应
UEFI 规范第 5 章定义 GPT；Tanenbaum《Modern Operating Systems》在存储管理层讨论分区；Vonng/ddia 虽聚焦分布式，但其磁盘布局笔记可对照块设备抽象。

## 八、面试题
MBR 的 2 TiB 限制来自哪里；GPT 如何保证健壮；保护 MBR 的作用；UEFI 为何偏好 GPT。

## 九、演进与趋势
NVMe 与 4K 扇区普及推动 LBA 抽象更受重视；分区之上出现 ZFS/Btrfs 子卷，使传统分区边界弱化；固件级 RAID 与存储池让分区表语义进一步下沉。

## 十、小结
MBR 与 GPT 都是把线性块地址空间切分为可管理区域的方案，GPT 用 64 位 LBA、CRC 与备份解决了 MBR 的容量与可靠性瓶颈，是 UEFI 时代磁盘布局的事实标准。
