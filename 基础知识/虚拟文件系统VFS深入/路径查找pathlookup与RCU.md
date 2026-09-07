# 路径查找pathlookup与RCU

> 对应 Bovet & Cesati《Understanding the Linux Kernel》与 Linux 内核文档 `Documentation/filesystems/path-lookup.rst`。

## 一、背景与挑战
`open("/a/b/c")` 需逐分量解析 `/a`、`/a/b`、`/a/b/c`，涉及多次 dentry 查找。高并发下若全程持锁，路径查找成为扩展性瓶颈。Linux 引入 RCU 读侧无锁路径查找（ref-walk / rcu-walk）。

## 二、核心原理
路径查找分两阶段：rcu-walk 在无锁 RCU 临界区内沿 dentry 父子链与 `d_seq` 顺序锁快速遍历；若遇需阻塞（如磁盘读取缺失 dentry）则降级为 ref-walk（持 `d_lock` 与引用计数）。`d_seq` 允许读者检测写者是否并发修改，冲突即重试。

## 三、形式化与数学基础
设分量数 $k$，rcu-walk 单分量期望 $O(1)$（哈希命中），整体期望 $O(k)$ 且无锁。重试概率 $p$ 下：
$$E[cost] = O(k) \cdot \sum_{i=0}^{\infty} p^i = O\left(\frac{k}{1-p}\right)$$
$p$ 极低时接近无锁线性扫描。

## 四、代码实现
```c
// 内核 link_path_walk 在 rcu-walk 中读 dentry 并比对 d_seq
unsigned seq = read_seqcount_begin(&dentry->d_seq);
struct dentry *child = d_lookup(parent, &name);
if (read_seqcount_retry(&parent->d_seq, seq))
    goto slow_path;   // 降级 ref-walk
```

## 五、与其他技术对比
早期仅 ref-walk（全程锁）简单但扩展差；rcu-walk 提升读并发，代价是读路径需处理重试。相较用户态哈希表路径缓存，内核用 dcache + RCU 兼顾一致性。

## 六、常见误区
误以为路径查找永远无锁：rcu-walk 失败会回退 ref-walk。误以为 `d_seq` 是普通锁：它是顺序锁，读者不阻塞写者只重试。误以为符号链接零成本：它强制 ref-walk。

## 七、与开源书/权威来源对应
内核官方 path-lookup.rst 由 Neil Brown 撰写，系统阐述 rcu-walk/ref-walk；Bovet & Cesati 给出 dcache 结构。

## 八、面试题
问：为什么符号链接会让路径查找变慢？答：需 ref-walk 并可能跨文件系统解析。问：rcu-walk 如何保证不读到半更新 dentry？

## 九、演进与趋势
rcu-walk 自 2.6.38 引入后持续打磨，配合 `LOOKUP_FAST` 标志与 `nd` 结构优化，使高核数机器路径查找近似线性扩展。

## 十、小结
RCU 路径查找用顺序锁与两阶段降级，把最常见的读路径变成近乎无锁，是 VFS 扩展性的关键优化。
