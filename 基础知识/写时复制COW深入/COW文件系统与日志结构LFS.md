# COW文件系统与日志结构LFS

> 对应 Rosenblum & Ousterhout, *The Design and Implementation of a Log-Structured File System* (ACM TOCS 1992)，与 Bovet & Cesati《Understanding the Linux Kernel》。

## 一、背景与挑战

传统文件系统原地更新数据与元数据块：小改写产生多次随机写盘，崩溃时元数据可能只更新一半，需要与容量成正比的全盘 `fsck`。日志结构文件系统（LFS）把存储视为只追加的日志，把随机小写聚合为大顺序写——这正是写时复制（COW）的核心思想：**永不覆盖旧块，只写新块**。ZFS、btrfs、APFS、bcachefs 后来把该思路与 COW B 树结合，同时获得崩溃一致性与高效快照。

难点是：只追加会让旧块变成垃圾，必须由后台 **cleaner** 识别并回收仍被引用的活数据；元数据还要随数据向上更新，任一次修改都会传播到根。

## 二、核心原理

COW 文件系统的核心是**自底向上传播的复制链**：

1. 改数据块 $D$ 时先分配新块 $D'$，复制内容后再改；
2. $D$ 的父间接块同样 COW 出 $P'$，其中指向 $D'$；
3. 递归向上，直到路径上的根节点被替换；
4. 最后**原子切换超级块中的根指针**，从旧树切到新树。

切换前系统看到旧树、切换后看到新树，不存在「半新半旧」的中间态，因此不依赖日志也能保证一致性。快照是这个机制的自然副产品：保留旧根指针即可，旧块因仍被引用而不被回收；删除快照后，仅被该快照引用的块才变垃圾。

第二个支柱是校验和：每个块（含元数据）都存校验值，父块保存子块校验值，形成默克尔式信任链，可检测静默损坏并在有冗余副本时修复。

## 三、形式化与数学基础

一次路径修改的 COW 传播可写作：

$$root_{new} = COW\bigl(meta(\ldots COW(meta(COW(data)))\ldots)\bigr)$$

由于根切换是单点原子操作，一致性成立：观察者要么看到 $root_{old}$ 的整棵树，要么看到 $root_{new}$ 的整棵树。树高为 $h$ 时，改一个数据块只需重写 $O(h)$ 个元数据块，而非整棵树。快照的增量空间成本为：

$$Space_{snapshot} = \sum_{\text{被修改的块}} |block|$$

即快照本身几乎不占空间，占用随写入量增长。cleaner 的效率用写放大度量：$WA = \dfrac{\text{实际写入介质字节}}{\text{上层逻辑写入字节}}$，碎片越严重，需要搬运的活数据越多，$WA$ 越大。

## 四、代码实现

```c
/* 伪代码：COW 更新数据块，再沿祖先链逐级 COW 到根 */
block_t cow_data(block_t leaf, int idx, char val) {
    block_t copy = alloc_block();            /* 永不覆盖旧块 */
    memcpy(copy.data, leaf.data, BLOCK_SIZE);
    copy.data[idx] = val;                    /* 只在新副本上修改 */
    copy.csum = checksum(copy.data);
    return copy;
}

block_t cow_parent(block_t parent, int slot, block_t new_child) {
    block_t copy = alloc_block();
    memcpy(copy.data, parent.data, BLOCK_SIZE);
    copy.ptr[slot] = new_child;              /* 指向新的子块 */
    copy.csum = checksum(copy.data);
    return copy;
}

void write_block(block_t leaf, int idx, char val) {
    block_t cur = cow_data(leaf, idx, val);
    for (int lv = 0; lv < height; lv++)      /* ancestors 由遍历得到 */
        cur = cow_parent(ancestors[lv], slot_of[lv], cur);
    superblock.root = cur;                   /* 原子切换根指针 */
    superblock.csum = checksum(cur);
    flush_superblock();
}
```

cleaner 的骨架是「读候选段 → 逐块判断是否仍被引用 → 活块重写到新段 → 更新引用映射 → 整段标记为空闲」。

## 五、与其他技术对比

| 维度 | COW 文件系统 | 日志文件系统（ext4） | 传统原地更新 | LVM 快照 |
| --- | --- | --- | --- | --- |
| 数据写入位置 | 总是新位置 | 原地 + 先写日志 | 原地 | 原地（COW 位图） |
| 崩溃一致性 | 原子根切换 | 重放/回滚日志 | 依赖 fsck | 依赖底层机制 |
| 快照成本 | 只保留旧根 | 需额外机制 | 无 | 块级位图 |
| 校验粒度 | 每块校验和、父子链 | 通常只校验元数据 | 无 | 无 |
| 主要代价 | 碎片与 cleaner 写放大 | 写日志的额外写 | fsck 时间 | 首次写放大 |
| 典型实现 | ZFS、btrfs、APFS | ext3/ext4、XFS | 早期 ext2 | dm-snapshot |

## 六、常见误区

- **「COW 快照零成本且可永久保留」**：快照本身不占空间，但写入会让旧块被钉住、cleaner 无法回收，空间随修改量增长。
- **「COW 不写原块所以一定更快」**：好处是写顺序化与免 fsck，代价是元数据向上传播与 cleaner 搬运；碎片严重时写放大可能超过原地更新。
- **「随机小写也高效」**：连续随机小写会迅速碎片化，需靠段大小、写入批处理与 cleaner 策略调节。
- **「有校验和就不会丢数据」**：校验和只能**检测**损坏，修复需要冗余；单副本场景下只能报错。
- **「日志与 COW 是一回事」**：日志是「原地更新 + 先写日志保证可重放」，COW 是「永不原地改」，机制与代价都不同。

## 七、与开源书·权威来源对应

- **Rosenblum & Ousterhout 1992 (TOCS)**：LFS 原始论文，提出段、cleaner、引用映射，并讨论 COW 用于快照。
- **Bovet & Cesati《Understanding the Linux Kernel》**：页缓存与文件系统层的交互、脏页回写机制。
- **Tanenbaum《Modern Operating Systems》**：文件系统实现章节对日志结构与日志文件系统的对比。
- **Arpaci-Dusseau《Operating Systems: Three Easy Pieces》**：文件系统实现与崩溃一致性（Journaling、LFS）。
- **各 COW 文件系统官方文档**：btrfs 设计文档、OpenZFS 文档、APFS 说明，以官方最新文档为准。

## 八、面试题

**Q1：COW 文件系统的快照为什么快？**
要点：只需保留旧根指针，旧块因仍被引用而不被回收；切换与数据量无关。

**Q2：cleaner 的作用是什么？**
要点：找出段中仍被引用的活块，搬到新段并更新引用，然后整段回收，避免空间耗尽。

**Q3：为什么 COW 文件系统不需要 fsck？**
要点：更新都是「新写 + 原子根切换」，本地不可能出现半更新的树；校验和另可发现静默损坏。

**Q4：COW 的主要代价是什么？**
要点：元数据向上传播的计算、长期积累的碎片、cleaner 造成的写放大。

## 九、演进与趋势

- **主流采用**：ZFS、btrfs、APFS、bcachefs 以 COW B 树为核心，快照、克隆、去重、校验和成为标配。
- **与 SSD 协同**：NVMe ZNS 要求顺序写、禁止原地改写，与 LFS/COW 天然契合，可降低写放大与 GC 压力。
- **写放大治理**：段大小自适应、写入批处理、cleaner 优先级调节，以及把热点随机写与顺序日志分流到不同设备。
- **持久内存**：在 PMEM 上 COW 的原子性可由 8 字节原子写直接实现，简化一致性协议。

## 十、小结

COW 文件系统用「新写 + 原子根切换」同时获得崩溃一致性与廉价快照，用校验和获得端到端完整性，代价是碎片、元数据传播与 cleaner 写放大。它与日志文件系统解决同一问题但机制相反：一个坚决不原地改，一个先写日志再原地改。
