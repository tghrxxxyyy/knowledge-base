# inode与dentry缓存机制

> 对应 Bovet & Cesati《Understanding the Linux Kernel》第 12 章「虚拟文件系统」的数据结构部分，以及 Kerrisk《The Linux Programming Interface》第 14 章。

## 一、背景与挑战
路径名解析的每一步都需要「目录内容」与「文件元数据」，而这两者都在磁盘上。`stat`、`open`、`access` 这类极高频操作若每次都读盘，性能不可接受。内核因此维护两层元数据缓存：**inode 缓存（icache）**以 `(super_block, inode 号)` 为键缓存文件元数据；**dentry 缓存（dcache）**以「父 dentry + 名字」为键缓存「名字 → inode」的绑定。
二者分工明确：icache 回答「这个文件什么属性」，dcache 回答「这个名字指向哪个文件」。难点在于**生命周期**：内存有限、文件可能被删除、目录项可能被改名、网络文件系统的元数据可能随时失效，因此缓存必须支持引用计数、LRU 回收、别名（硬链接）处理与失效通知。

## 二、核心原理
**inode 的字段与状态**：`i_ino`（inode 号）、`i_sb`（所属超级块）、`i_count`（引用计数）、`i_nlink`（硬链接数）、`i_state`（状态位，含 `I_DIRTY_SYNC`/`I_DIRTY_DATASYNC`/`I_DIRTY_PAGES`/`I_NEW`/`I_FREEING`/`I_WILL_FREE`/`I_REFERENCED`）、`i_mapping`（页缓存入口）、`i_op`/`i_fop`、`i_rwsem`（串行化 `->lookup`/`->create`/`->rename`）、`i_lru`（LRU 链表）。
查找路径：`iget_locked`/`find_inode_fast` 在哈希桶中命中并等待 `I_NEW` 消失；未命中则调用文件系统的 `alloc_inode` 创建、置 `I_NEW`，填好元数据后清位并唤醒等待者。释放走 `iput`：`i_count` 减一，减到 0 且 `i_nlink == 0` 时标记回收，否则放入 `inode_lru` 等待内存压力下的 `prune_icache`（注册为 shrinker）。`i_state` 的 `I_DIRTY_*` 与页缓存的 dirty 位是**两套独立**标记：前者表示 inode 元数据（大小、时间戳、块映射）需写回，后者表示数据页需写回。这解释了为何只改数据时 `fdatasync` 足够，而改了大小/时间戳后需要 `fsync`。
**dentry 的关键字段**：`d_name`（`struct qstr`，含长度、`hash`、`name` 指针）、`d_parent`、`d_inode`、`d_sb`；`d_lockref`（把自旋锁与引用计数打包在同一缓存行，减少原子操作与伪共享）；`d_seq`（顺序锁，供 RCU 路径查找校验一致性）；`d_flags`（`DCACHE_OP_HASH`/`DCACHE_OP_COMPARE`/`DCACHE_OP_REVALIDATE`/`DCACHE_OP_DELETE`/`DCACHE_OP_PRUNE`/`DCACHE_DISCONNECTED`/`DCACHE_MOUNTED`）；`d_hash`（哈希桶节点）、`d_lru`（未使用链表）、`d_subdirs`（子树）、`d_u.d_alias`（同一 inode 的别名链）、`d_op`。
**三种特殊 dentry**：**负 dentry**（`d_inode == NULL`）明确记录「这个名字不存在」，用于吸收「反复 `stat` 不存在的文件」这类流量（包括攻击流量），使查询在内存中完成而不触发磁盘查找；**已断开 dentry**（`DCACHE_DISCONNECTED`）存在于 dcache 但未连到超级块根，常见于 NFS 通过文件句柄构造的路径片段；**in-lookup dentry**（`DCACHE_PAR_LOOKUP`）正在被 `->lookup()` 处理，对普通查找不可见，用于避免并发重复查找。
**别名与生命周期**：硬链接意味着多个 dentry 指向同一 inode，通过 `d_u.d_alias` 链在 inode 上串联。inode 被回收时必须把它的所有别名 dentry 置负或断开（`d_prune_aliases`），否则会留下悬空指向。`dput` 递减 dentry 引用计数，归零后进入 `dentry_unused` LRU；`d_delete` 在引用计数为 1 时把 dentry 置负、否则断开与 inode 的连接；`d_invalidate` 用于强制失效（卸载或收到网络失效通知）。
**lookup 缺失路径**：dcache 未命中时，VFS 调用父目录 inode 的 `i_op->lookup()`。为处理并发竞态，目录 inode 的 `i_rwsem` 会被加锁（或走 in-lookup 路径），文件系统读完目录数据后调用 `d_splice_alias`/`d_add` 绑定结果。
**回收压力平衡**：icache/dcache 与页缓存共享同一个可用内存池，通过 shrinker 按优先级回收；`/proc/sys/vm/vfs_cache_pressure` 控制内核对元数据缓存相对页缓存的回收倾向，值越大越倾向回收 dentry/inode。

## 三、形式化与数学基础
dcache 命中率（$N_{hit}$ 为命中次数，$N_{miss}$ 为未命中）：

$$ h = \frac{N_{hit}}{N_{hit} + N_{miss}} $$

热点工作集完全驻留时 $h \to 1$，每次分量解析的期望代价从 $O(T_{io})$ 降为 $O(1)$ 哈希查找。icache 的回收触发条件为

$$ evict(inode) \iff i\_count = 0 \;\land\; i\_nlink = 0 $$

若 $i\_count = 0$ 但 $i\_nlink > 0$，inode 保留在 LRU 中（可复用，也可在压力下回收后再从磁盘读回）。
dentry 的存在性有三值语义：$state(d) \in \{positive,\; negative,\; in\_lookup\}$。前两者对普通查找可见（正 dentry 给出 inode，负 dentry 给出「不存在」），第三者对普通查找隐藏。负 dentry 的价值可量化：设某名字被查询 $n$ 次且确实不存在，无缓存代价为 $n \cdot T_{dirscan}$，有缓存后降为

$$ T_{dirscan} + (n-1) \cdot O(1) $$

别名一致性约束（硬链接）要求同一 inode 上的所有正 dentry 出现在同一条别名链中：

$$ \forall d_1, d_2 : d_1.d\_inode = d_2.d\_inode = I \Rightarrow d_1 \in alias(I) \land d_2 \in alias(I) $$

这正是「回收 inode 时必须清理所有别名」这一规则的形式化来源。

## 四、代码实现
```c
#include <linux/dcache.h>
#include <linux/fs.h>

/* dentry 的核心字段（简化示意） */
struct dentry {
    unsigned int d_flags;              /* DCACHE_* 标志 */
    seqcount_spinlock_t d_seq;         /* 供 rcu-walk 校验的顺序锁 */
    struct hlist_bl_node d_hash;       /* 挂入 dcache 哈希桶 */
    struct dentry *d_parent;           /* 父目录 */
    struct qstr d_name;                /* 名字（长度 + hash + 指针） */
    struct inode *d_inode;             /* NULL 即负 dentry */
    struct lockref d_lockref;          /* 自旋锁 + 引用计数打包 */
    const struct dentry_operations *d_op;
    struct super_block *d_sb;
    struct list_head d_lru;            /* 未使用链表 */
    struct list_head d_subdirs;        /* 子 dentry */
    struct hlist_node d_alias;         /* 同一 inode 的别名链 */
};
```

```c
/* 目录查找骨架：dcache 未命中时由文件系统填充 */
static struct dentry *myfs_lookup(struct inode *dir, struct dentry *dentry,
                                  unsigned int flags) {
    struct inode *inode = NULL;
    u64 ino = myfs_dir_search(dir, &dentry->d_name);   /* 读目录数据块 */
    if (ino) {
        inode = myfs_iget(dir->i_sb, ino);             /* 走 icache */
        if (IS_ERR(inode)) return ERR_CAST(inode);
    }
    /* inode 为 NULL 时 d_splice_alias 产生负 dentry，用于吸收不存在查询 */
    return d_splice_alias(inode, dentry);
}

/* 回收路径：强制失效并递减引用计数 */
void myfs_evict(struct dentry *victim) {
    d_invalidate(victim);          /* 置负或断开，并处理子 dentry */
    dput(victim);                  /* 归零后进入 dentry_unused LRU */
}
```

```bash
cat /proc/sys/vm/vfs_cache_pressure      # 越大越倾向回收 dentry/inode
slabtop -o | head -20                    # 查看 dentry / inode_cache 用量
```

## 五、与其他技术对比
| 维度 | dcache | icache | page cache | TLB |
| --- | --- | --- | --- | --- |
| 缓存对象 | 名字 → inode 的绑定 | 文件元数据 | 文件数据页 | 虚拟页 → 物理页 |
| 键 | 父 dentry + 名字哈希 | (超级块, inode 号) 哈希 | (`address_space`, 页偏移) xarray | 虚拟页号 |
| 负缓存 | 支持（负 dentry） | 不适用 | 不适用 | 不适用 |
| 并发读取 | RCU + 顺序锁 | 哈希桶锁 | RCU（xarray） | 硬件自动 |
| 回收方式 | LRU + shrinker | LRU + shrinker | 页回收（直接 + kswapd） | 硬件/软件失效 |

三者的协作是典型的分层缓存：路径解析先靠 dcache 找到 dentry，再由 dentry 取得 inode（icache 提供），最后访问数据时靠页缓存（或 `mmap` 触发的缺页）。任一层未命中都会放大到下一层，最坏情形一次 `open` 级联触发 dcache miss（读目录）、icache miss（读 inode）、page cache miss（读数据）——这正是冷启动性能显著低于热路径的根本原因。

## 六、常见误区
- **以为 dentry 与文件一一对应**：同一文件可有多个 dentry（硬链接、bind 挂载、`/proc/<pid>/root` 等入口），通过 `d_alias` 链关联；反过来一个 dentry 也可暂时没有 inode（负 dentry 或 in-lookup）。
- **以为负 dentry 浪费内存**：它把「不存在」也缓存下来，专门吸收重复的失败查询，是安全与性能的双重收益。
- **以为 `ls` 一定读磁盘**：热点目录的 dentry 与 inode 都在缓存中，`ls` 可以零磁盘 I/O。
- **以为删掉文件 inode 立即消失**：`unlink` 只减 `i_nlink`；若仍有打开的 `struct file` 引用（`i_count > 0`），inode 与数据块都不释放。
- **以为 icache 与 dcache 的脏标记是同一个**：inode 元数据脏与数据页脏互相独立，决定了 `fsync` 与 `fdatasync` 的差别。
- **以为 dcache 无失效机制**：`d_delete`/`d_invalidate`/`d_prune_aliases` 与网络文件系统的 `d_revalidate` 共同保证一致性。

## 七、与开源书·权威来源对应
- Bovet & Cesati《Understanding the Linux Kernel》第 12 章详述 dcache 哈希组织、`d_parent`/`d_subdirs`/`d_alias` 链表、inode 哈希与 LRU 队列结构。
- Kerrisk《The Linux Programming Interface》第 14 章从用户态视角说明 inode 的可见属性（`i_nlink` 与 `stat` 的 `st_nlink`）与硬链接语义。
- Love《Linux Kernel Development》关于 inode 与 dcache 的章节给出 `iget`/`iput`、`dget`/`dput` 的引用计数规则与回收路径。
- Remzi & Andrea《Operating Systems: Three Easy Pieces》的文件系统与缓存章节用「一切皆缓存」的视角解释元数据缓存的收益与失效问题。
- 内核文档 `Documentation/filesystems/path-lookup.rst` 与 `vfs.rst` 是 dcache 并发访问与对象职责的权威说明，具体字段以官方最新文档为准。

## 八、面试题
1. **为什么删除包含海量文件的大目录有时很慢？**
   要点：`unlink` 每个条目都要修改目录数据块并回收对应的 dentry/inode 缓存项，涉及别名链与 LRU 维护、元数据写回与日志提交。
2. **dcache 与 icache 谁先被查找？**
   要点：路径解析先查 dcache 得到 dentry，再由 `d_inode` 取 inode；dentry 缺失时调用 `->lookup()`，其中再走 `iget` 查 icache。顺序是「名字先于属性」。
3. **负 dentry 有什么用，什么时候被清除？**
   要点：缓存「名字不存在」以避免重复磁盘查找；在内存压力下被回收、在被回收的目录上执行 `create` 时被复用，或被 `d_invalidate` 清理。
4. **为什么 inode 回收前必须处理别名 dentry？**
   要点：硬链接使多个 dentry 指向同一 inode；inode 释放后这些 dentry 的 `d_inode` 会悬空，因此 `iput` 到零必须调用 `d_prune_aliases` 把别名置负或断开。
5. **`I_DIRTY_*` 与页缓存的 dirty 位有何不同？**
   要点：前者标记 inode 元数据（大小、时间戳、块映射）需写回，后者标记数据页需写回；`fdatasync` 只需保证数据与影响读回的最小元数据落盘，`fsync` 要求全部元数据。

## 九、演进与趋势
两套缓存的演进方向一致：减少元数据开销、提高并发度。dcache 引入 RCU 读侧无锁遍历与 `d_lockref`（引用计数与锁合并到同一缓存行），把路径查找从「每分量两次原子操作」降为「零写共享内存」；in-lookup dentry 消除并发重复 `lookup` 的浪费。icache 侧，`i_state` 与 `i_count` 的分离、`I_REFERENCED` 位的引入让 LRU 保活更准确；时间戳从「每次更新都写回」走向多粒度与惰性写回。文件系统侧，`iomap` 与 `folio` 改造简化页缓存与元数据的协同，`kernfs` 让伪文件系统的 inode/dentry 生成开销极低。

## 十、小结
inode 缓存与 dentry 缓存把「慢速磁盘元数据访问」变成内存哈希查找：dcache 用「父 dentry + 名字」索引并支持负 dentry，icache 用「超级块 + inode 号」索引并用引用计数与 LRU 管理生命周期。三条必须记住的规则是：同一 inode 可以有多个 dentry（别名链）、负 dentry 是有效且有价值的缓存项、元数据脏与数据脏是两套独立标记。理解 `iget`/`iput`、`dget`/`dput` 的引用计数语义与 shrinker 回收机制，就掌握了文件系统冷热路径差异与「删除后空间未释放」这类现象的解释框架。
