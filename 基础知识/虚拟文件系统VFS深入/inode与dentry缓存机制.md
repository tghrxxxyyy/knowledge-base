# inode与dentry缓存机制

> 对应 Bovet & Cesati《Understanding the Linux Kernel》第 12 章 VFS 数据结构与 Kerrisk《The Linux Programming Interface》第 14 章。

## 一、背景与挑战
路径名解析需反复在磁盘上查找目录项并读取 inode，磁盘 I/O 慢且代价高。为加速，内核维护 dentry 缓存（dcache）与 inode 缓存，将最近使用的映射常驻内存。

## 二、核心原理
`inode` 描述文件元数据（权限、大小、时间戳、数据块指针），全局以 `i_hash` 按 `(super_block, inode号)` 哈希。当引用计数 `i_count` 归零但仍在缓存时进入"unused"链表，内存紧张时由 slab 回收。`dentry` 表示一次路径分量查找结果，含 `d_inode` 指针、`d_parent` 与子 dentry 哈希表，形成目录树缓存。

## 三、形式化与数学基础
dcache 命中率：
$$h = \frac{N_{hit}}{N_{hit}+N_{miss}}$$
负 dentry（记录"该名不存在"）用于吸收 `stat` 不存在文件的攻击流量。dcache 规模受 `dentry_unused` 链表与 shrinker 控制，期望 $h \to 1$ 于热点工作集。

## 四、代码实现
```c
// 负 dentry：d_inode == NULL 表示该路径分量不存在
struct dentry {
    struct inode *d_inode;     // NULL 即负 dentry
    struct dentry *d_parent;
    struct hlist_head d_children;
    struct qstr d_name;
};
// 查找顺序：dcache -> icache -> 底层文件系统 -> 回填缓存
struct dentry *d_lookup(struct dentry *parent, const struct qstr *name);
```

## 五、与其他技术对比
dcache 是"路径→inode"的缓存，页缓存是"文件偏移→物理页"的缓存，二者分层协作。相较硬件 TLB，dcache 由内核显式管理且支持负缓存。

## 六、常见误区
误以为 dentry 与文件一一对应：同一文件可有多个 dentry（硬链接、挂载点）。误以为负 dentry 浪费内存：它防御不存在路径的磁盘风暴。误以为 `ls` 必读磁盘：热点目录命中 dcache 为零 I/O。

## 七、与开源书/权威来源对应
Bovet & Cesati 给出 dcache 的 parent/child 链表与 LRU；OSTEP 文件系统章用"一切皆缓存"视角解释。

## 八、面试题
问：为什么删除大目录有时很慢？答：需逐条回收海量 dentry 与 inode 缓存项，并写回目录数据块。问：dcache 与 icache 谁先查找？

## 九、演进与趋势
dcache 引入 RCU 读侧无锁遍历，mount 点用 `mount` 对象解耦，提升大规模并发路径查找吞吐。

## 十、小结
inode 缓存与 dentry 缓存把慢速磁盘元数据访问变成内存哈希查找，是文件系统性能的核心支柱。
