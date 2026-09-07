# COW文件系统与日志结构LFS

> 对应 Rosenblum & Ousterhout 1992 "The Design and Implementation of a Log-Structured File System"（提出写时复制/日志结构）与 Bovet & Cesati《Understanding the Linux Kernel》。

## 一、背景与挑战
传统原地更新文件系统做小改写需随机写盘且崩溃易致不一致，需昂贵 fsck。ZFS/btrfs/BTRFS 等用写时复制：改写块时分配新块、旧块保留，天然支持快照与崩溃一致性。

## 二、核心原理
COW 文件系统改写某数据块时，不覆盖原块，而写入新位置，并向上更新其所有间接/元数据块（同样 COW），最终原子切换根指针。旧版本因仍被快照引用而保留，形成时间点快照；未引用旧块由垃圾回收（cleaner）回收。

## 三、形式化与数学基础
快照占用仅增量：$Snapshot_{size} = \sum changed\_blocks$。一致性：
$$root_{new} = COW(meta(root_{old}))$$
切换根指针为原子，使系统要么见旧根要么见新根，无中间态。校验和（checksum）使静默错误可检测。

## 四、代码实现
```c
// 伪代码：COW 更新一个数据块并更新上级指针
block_t new = alloc_block();
memcpy(new, old, BS);
new[off] = val;            // 修改副本
block_t np = cow_update_parent(parent, idx, new); // 递归 COW
commit_root(np);          // 原子切换 root 指针
```

## 五、与其他技术对比
COW 文件系统 vs 日志（ext4 journaling）：日志仍原地写数据，COW 全程新写。相较 LVM 快照（写时复制位图），文件系统级 COW 更细、校验更全。代价：碎片与 cleaner 开销。

## 六、常见误区
误以为 COW 快照零成本永久保留：旧块累积需 cleaner。误以为 COW 不写原块就快：需向上 propagating 更新元数据。误以为随机小写 COW 高效：易碎片，需碎片整理。

## 七、与开源书/权威来源对应
Rosenblum & Ousterhout 1992 是 COW/日志结构奠基；btrfs/ZFS 文档与 OSTEP 文件系统章覆盖。

## 八、面试题
问：COW 文件系统的快照为什么快？答：只切换根指针，旧块保留未改。问：cleaner 作用？

## 九、演进与趋势
ZFS/btrfs/APFS 均采 COW；bcachefs 进一步；NVMe ZNS 与 COW 协同减少写放大。

## 十、小结
COW 文件系统用"新写+原子根切换"同时获得崩溃一致性与高效快照，是现代存储主流方向。
