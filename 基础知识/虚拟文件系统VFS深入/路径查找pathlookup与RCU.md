# 路径查找pathlookup与RCU

> 对应 Bovet & Cesati《Understanding the Linux Kernel》第 12 章 dcache 结构，以及内核官方文档 `Documentation/filesystems/path-lookup.rst`（由 Neil Brown 撰写）。

## 一、背景与挑战
`open("/a/b/c")` 需要把路径名逐分量解析：先定位 `/`，再在 `a` 的目录内容中查找 `b`，再在 `b` 中查找 `c`。每一步都是一次「父 dentry + 名字 → 子 dentry」的查找，可能命中 dcache（内存哈希），也可能必须发磁盘 I/O。
在多核机器上，路径查找是所有系统调用的公共前缀，热路径吞吐极高。若每个分量都加互斥锁（传统 ref-walk 需要 `d_lock` 与引用计数原子操作），`open`/`stat` 会让缓存行在多核间反复迁移（cache-line ping-pong），扩展性随核数增长而恶化。Linux 的答案是 **RCU 读侧无锁路径查找**：让最常见的「全命中缓存」路径完全不写共享内存、不取锁，把需要修改共享状态的情形降级到慢路径。

## 二、核心原理
路径查找采用**两阶段设计**：先尝试 `rcu-walk`，失败则降级为 `ref-walk`。
**rcu-walk** 在 `rcu_read_lock()` 保护的临界区内沿 dentry 树向下遍历。因为是 RCU 读者，不能睡眠、不能阻塞，也不能递增 dentry 引用计数（那会是共享写）。为检测并发修改，每个 dentry 带顺序锁 `d_seq`：读者读取前取序号，读取后校验，序号改变说明有写者动过（`rename`、`d_delete`、挂载变更），结果作废并重试或降级。为避免读到正在释放的对象，还需 `rename_lock`（全局顺序锁）保证 `..`（父指针）自洽，以及 `d_lockref`（锁引用）的存在性检查。
**ref-walk** 在遇到需要建立引用、需要磁盘 I/O、需要跨挂载点、或需展开符号链接时启动，先用 `unlazy_walk()` 把已解析部分「固化」：为 dentry 与 mount 取引用计数（`dget`、`mntget`），再加 `d_lock` 继续遍历。这条路径语义正确但代价高（原子操作、锁竞争、可能阻塞）。
**降级条件**包括：`d_seq` 校验失败；遇到负 dentry 需要调用可能阻塞的 `->lookup()`；需要跨挂载点（`DCACHE_MOUNTED`）并解析挂载哈希表；遇到符号链接需要展开（可能跨文件系统、可能循环）；需要在临界区内做任何可睡眠的事。
**并行 lookup** 解决另一类浪费：多个线程同时查找同一尚不存在的 dentry 时，若都调用 `->lookup()` 会造成重复磁盘 I/O 与重复分配。Linux 引入 `DCACHE_PAR_LOOKUP` 状态与 in-lookup dentry（`d_alloc_parallel`/`d_in_lookup`）：第一个查找者创建「正在查找」的 dentry 放入哈希，后来者会找到并等待。这类 dentry 对普通查找隐藏，因此不污染 dcache 语义。
其他关键机制：`d_revalidate`/`d_weak_revalidate` 让网络文件系统（NFS/CIFS）在慢路径确认 dentry 是否仍有效；`DCACHE_MOUNTED` 表示需跨越挂载点；符号链接的跳转次数受总量限制以防无限循环；`LOOKUP_*` 标志控制行为，其中 `LOOKUP_RCU` 表示尝试无锁、`LOOKUP_PARENT` 只解析到父目录（用于 `create`/`unlink`）、`LOOKUP_NO_SYMLINKS` 禁止符号链接、`LOOKUP_BENEATH`/`LOOKUP_IN_ROOT` 把解析约束在指定子树内（`openat2` 的安全基础）。

## 三、形式化与数学基础
设路径深度为 $k$，单个分量在 rcu-walk 中命中 dcache 的期望代价为 $O(1)$（哈希 + 顺序锁校验），则全命中时

$$ T_{rcu}(k) = O(k),\qquad \text{无共享写、无原子操作} $$

设降级概率为 $p$（各分量近似独立），总期望代价为

$$ E[cost] = O(k) \cdot \sum_{i=0}^{\infty} p^{i} = O\!\left(\frac{k}{1-p}\right) $$

当 $p \to 0$（热点路径全命中且无并发重命名）时期望代价退化为线性无锁扫描。这解释了 rcu-walk 对「读多写少、dcache 命中率高」负载的收益最大。
顺序锁的正确性条件为：读者读前后两次取到序号 $s_0$ 与 $s_1$，若

$$ s_0 = s_1 \;\land\; s_0 \bmod 2 = 0 \Rightarrow \text{读到的快照自洽} $$

序号为奇数表示写者正在修改，必须重试。与引用计数方案对比：ref-walk 每个分量至少两次原子操作（`dget`/`dput`），多核下每次原子操作都引起缓存行所有权转移；rcu-walk 把写操作数降为零，代价是必须处理「读到的对象可能被并发释放」，因此依赖 RCU 宽限期延迟释放。

## 四、代码实现
```c
/* 概念性伪码：rcu-walk 中读取一个 dentry 并校验顺序锁 */
struct dentry *rcu_lookup_step(struct dentry *parent, const struct qstr *name) {
    unsigned seq;
    struct dentry *child;

    rcu_read_lock();                             /* 进入 RCU 读侧临界区 */
    seq = read_seqcount_begin(&parent->d_seq);   /* 取序号 */
    child = __d_lookup_rcu(parent, name, &seq);  /* 无锁哈希查找 */
    if (!child || read_seqcount_retry(&parent->d_seq, seq)) {
        rcu_read_unlock();
        return NULL;                             /* 失败：交给慢路径重试 */
    }
    return child;                                /* 宽限期内不会被释放 */
}

/* 固化当前进度：从 rcu-walk 降级到 ref-walk */
int slow_path(struct nameidata *nd, struct dentry *dentry) {
    if (unlazy_walk(nd))                         /* 取引用计数 + d_lock */
        return -ECHILD;                          /* 失败则整个解析重新开始 */
    return walk_component(nd, dentry);
}

/* 符号链接与挂载点必须走慢路径 */
static int handle_mounts(struct nameidata *nd, struct dentry *dentry,
                         struct path *path) {
    if (d_is_symlink(dentry))
        return pick_link(nd, path, dentry, LOOKUP_FOLLOW, 0);  /* 展开符号链接 */
    if (d_flags_are_lookup(dentry))              /* DCACHE_MOUNTED：跨挂载点 */
        return step_into(nd, path, dentry);
    return 0;
}
```

`openat2` 通过 `RESOLVE_*` 把安全约束内联到解析循环：

```c
struct open_how how = {
    .flags = O_RDONLY,
    .resolve = RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS | RESOLVE_NO_MAGICLINKS,
};
int fd = syscall(SYS_openat2, dirfd, "sub/file", &how, sizeof(how));
/* RESOLVE_BENEATH：拒绝任何逃出 dirfd 子树的解析（含逃逸性符号链接与越过起点的 ..） */
```

## 五、与其他技术对比
| 维度 | rcu-walk | 传统 ref-walk | 用户态路径缓存 | 每次全量解析 |
| --- | --- | --- | --- | --- |
| 读侧是否取锁 | 否（RCU + 顺序锁校验） | 是（`d_lock`） | 视实现 | 视实现 |
| 引用计数操作 | 无 | 每分量至少两次原子操作 | 无 | 无 |
| 多核扩展性 | 近线性 | 随核数退化（缓存行争用） | 取决于用户锁 | 差 |
| 是否需要能阻塞 | 否 | 是 | 视实现 | 是 |
| 遇磁盘 I/O | 必须降级 | 直接处理 | 未命中转内核 | 直接处理 |
| 一致性保证 | 顺序锁重试 | 锁 + 引用计数 | 需自建失效机制 | 最强 |

与用户态缓存相比，内核方案的优势是**一致性由构造保证**：任何 `rename`/`unlink`/`mount` 都会使相关 `d_seq` 变化，慢路径自然重试，不存在「缓存未失效」这一整类 bug。代价是实现复杂度——rcu-walk 的每一步都必须论证「在 RCU 临界区内是安全的」。

## 六、常见误区
- **以为路径查找永远无锁**：rcu-walk 是尽力而为的快路径；任何需要 I/O、引用计数或顺序锁校验失败的情形都会降级到 ref-walk，后者会取锁甚至睡眠。
- **以为 `d_seq` 是普通锁**：它是顺序锁（seqlock），读者不阻塞写者，只在检测到冲突时重试。
- **以为符号链接与普通分量成本相同**：符号链接强制走 ref-walk（可能跨文件系统、触发 I/O），且计入跳转上限；`RESOLVE_NO_SYMLINKS` 正是为消除这种不确定性而设计。
- **以为 `..` 只需读 `d_parent`**：`rename` 会并发修改父子关系，`..` 的解引用必须用全局 `rename_lock` 保护，或降级后处理。
- **以为 dcache 中不存在中间态**：并行 lookup 会创建 `DCACHE_PAR_LOOKUP` 的 in-lookup dentry，它存在于哈希表但对普通查找不可见，是避免重复磁盘 I/O 的关键。

## 七、与开源书·权威来源对应
- 内核官方文档 `Documentation/filesystems/path-lookup.rst` 系统阐述 rcu-walk/ref-walk 两阶段设计、降级条件与顺序锁用法，是本主题最权威的说明。
- Bovet & Cesati《Understanding the Linux Kernel》第 12 章给出 dcache 哈希结构、`d_parent`/`d_subdirs` 组织与查找接口。
- Love《Linux Kernel Development》关于 dcache 与 inode 缓存的章节说明「路径 → dentry」映射的生命周期与回收路径。
- McKenney 等人关于 RCU 的论文与内核文档 `Documentation/RCU/` 解释顺序锁与 RCU 配合保证读者一致性的通用原理。
- Herlihy & Shavit《The Art of Multiprocessor Programming》中关于顺序锁与乐观读取的讨论给出理论视角，可对照理解「读者重试换取写者无阻塞」的权衡。

## 八、面试题
1. **为什么符号链接会让路径查找变慢？**
   要点：符号链接需展开为新的解析起点，可能跨文件系统、触发磁盘 I/O、形成循环，因此强制降级到 ref-walk 并计入跳转次数上限。
2. **rcu-walk 如何保证不读到半更新的 dentry？**
   要点：`d_seq` 是顺序锁，写者修改前后改变序号（奇数为写入中）；读者读前后校验序号，不一致则丢弃结果重试或降级，保证快照自洽。
3. **并行 lookup 解决什么问题？**
   要点：多线程同时查找同一不存在文件会重复调用 `->lookup()` 造成重复 I/O 与分配；in-lookup dentry 让后来者等待第一个查找者。
4. **`openat2` 的 `RESOLVE_BENEATH` 在底层如何实现？**
   要点：在解析循环中强制禁止逃出给定的起始 dentry（拒绝绝对路径、拒绝越过起点的 `..`、默认不跟随逃逸性符号链接），把安全检查内联到循环而非事后校验，消除 TOCTOU。
5. **为什么 rcu-walk 需要 `rename_lock` 这一全局顺序锁？**
   要点：`rename` 可同时改变父子关系与名字，纯局部 `d_seq` 无法保证 `..` 自洽；全局顺序锁让 rcu-walk 检测到重命名并重试。

## 九、演进与趋势
rcu-walk 自引入以来持续打磨：早期只覆盖最理想情况，后续逐步扩展到挂载点跨越、负 dentry 与部分权限检查，使降级概率不断下降。配套改进包括 `d_lockref`（把引用计数与锁合并到同一缓存行）、in-lookup dentry（消除并发重复查找）以及 `openat2` 的 `RESOLVE_*`（把安全约束内联到解析循环）。工具侧，`strace -y` 与 `perf` 对路径解析函数的采样让行为可观测。长期方向是进一步提高无锁覆盖比例，并用 `io_uring` 的批量 `openat` 摊薄多次解析的固定开销。只要 dcache 命中率足够高，「乐观读取 + 冲突重试 + 必要时降级」仍是最优架构。

## 十、小结
RCU 路径查找用「两阶段 + 顺序锁」把最常见的读路径变成近乎无锁：rcu-walk 在 RCU 临界区内沿 dentry 树遍历，用 `d_seq` 校验一致性、用 `rename_lock` 保证父链自洽、用 in-lookup dentry 消除并发重复查找；一旦需要引用计数、磁盘 I/O、跨挂载点或符号链接展开，就通过 `unlazy_walk` 固化为 ref-walk。代价是代码复杂度与「降级即变慢」的隐式成本，收益是路径查找在多核上近似线性扩展。
