# B树与磁盘IO优化

> 对应 CLRS《Introduction to Algorithms》第 18 章外存模型讨论、Vitter (2001)《External Memory Algorithms》，以及数据库系统实现（Graefe）中关于缓冲池与 B 树页布局的章节。

## 一、背景与挑战

现代存储层次的延迟鸿沟大致是：寄存器 ~1 ns，L1 缓存 ~4 ns，主存 ~100 ns，NVMe SSD ~100 μs，HDD ~10 ms。算法若按“比较次数最少”设计（红黑树、AVL），在外存上可能惨败——每层节点一次随机 I/O，$\log_2 n$ 次 I/O 就是 $\log_2 n$ 次百微秒级等待，数据一大就崩。

外存算法的正确目标是：**最小化 I/O 次数**，并且让 I/O 尽量是**大块顺序读**。B 树通过“节点 = 页、高扇出、完美平衡”三条设计，把点查压到 $O(\log_t n)$ 次 I/O；再通过缓冲池、预读、聚簇布局、批量插入等工程手段，把真实 I/O 进一步摊薄。

面试中常问“为什么不用哈希表做数据库索引”“页大小如何影响树高”“缓冲池命中率 99% 时树高还有意义吗”。这些都要求理解**外存计算模型（external memory model）**：以页传输次数为复杂度度量，$M$ 为内存能容纳的页数，$B$ 为一页元素数。工程上，MySQL InnoDB 的 16KB 页、PostgreSQL 的 8KB 页、文件系统的块大小，都是按这个模型选定的。

## 二、核心原理

### 1. 节点与页对齐

B 树一个节点分配一整页（或多个连续页）。页大小 $P$（如 4KB/16KB），键+指针大小约 $K$（如 16~24B），则扇出

$$
m \approx \frac{P}{K}.
$$

$P=16\text{KB}, K=16\text{B}$ 时 $m \approx 1000$。树高 $h \approx \log_m n$，$n=10^9$ 时 $h \approx 3$。点查只碰 3 次页。

### 2. I/O 复杂度（外存模型）

- **点查/插入/删除**：$O(\log_t n)$ 次页传输。
- **顺序扫描**：$O(n/B)$ 次（B+ 树叶子链 + 预读）。
- **批量构建**：排序后自底向上建树，$O(n/B)$ 顺序写，远优于逐条插入的随机写。

对比：红黑树 $O(\log_2 n)$ 次页传输，$n=10^9$ 约 30 次；哈希表点查 $O(1)$ 但范围与扩容差，且桶随机分布不利于预读。

### 3. 缓冲池（buffer pool）与缓存友好

数据库把热页缓存在内存。根节点几乎常驻，上层节点访问频率高也易常驻；实际 I/O 主要发生在叶子。经验上，树高 4、缓冲池足够时，一次点查常只缺载 0~1 个叶子页。

**LRU / Clock 替换**决定哪些页留下；**预读（read-ahead）**在范围扫描或顺序构建时批量取页，把随机 I/O 伪装成顺序 I/O。

### 4. 聚簇布局与预读

- **聚簇索引**：行数据按主键顺序存于叶子，相邻键常在同一页，范围扫描近乎顺序读。
- **填充因子（fillfactor）**：预留空位减少分裂，或故意不满加速插入。
- **页分裂与碎片**：随机主键（如 UUID）导致页分裂频繁、填充率低；自增主键写入更友好。

### 5. 批量与延迟写

大量插入时先排序/缓冲，再自底向上 bulk-load 建 B 树，$O(n/B)$ 顺序 I/O；或使用 mini-batch 合并写回。删除大量记录后 compaction 重组页，提高填充率。

### 6. 与查询优化器的联动

执行计划里的 `rows` 估算、索引选择、回表代价，本质上都是 I/O 模型：优化器比较“走二级索引 + 回表”与“全表顺序扫”的页传输次数。统计信息（基数、直方图）不准时，会选出 I/O 更差的计划；这也是 DBA 要定期 `ANALYZE` 的原因。把 B 树树高、页填充率、缓冲命中率纳入容量规划，才能解释线上“为什么这条 SQL 突然慢了”。

## 三、形式化与数学基础

**树高与 I/O。** 设最小度数 $t$（节点关键字 $t-1 \sim 2t-1$），则

$$
h \le 1 + \log_t \frac{n+1}{2},
$$

点查 I/O $= O(h)$。令 $t \approx P / (2K)$，则

$$
h = O\left(\frac{\log n}{\log (P/K)}\right).
$$

**页数与扫描。** $n$ 条记录、页放 $B$ 条，共 $\Theta(n/B)$ 页；顺序扫描 I/O $\Theta(n/B)$。

**外存排序（外部排序）。** 若内存装 $M$ 页，可做 $M$ 路归并：每次读 $M$ 页排序写回，再归并，I/O 为 $\Theta\big(\frac{n}{B}\log_{M} \frac{n}{MB}\big)$。B 树 bulk-load 即基于此。

**缓冲命中率的影响。** 设每次点查真实缺页概率 $p$，期望 I/O $= p \cdot h$。$h=3$，$p=0.1$ 时期望 0.3 次 I/O——这就是“树高仍有意义，但缓冲更关键”的量化解释。

**分裂的均摊代价。** 随机插入下每次分裂概率约 $1/t$ 量级；自增键几乎从不向中间分裂，只在最右页扩展（append-friendly）。

**填充率与空间。** 最坏 $50\%$ 填充，B* 可到 $2/3$；生产靠 `fillfactor` 与延迟合并控制，常见目标 70%~90%。

## 四、代码实现

```python
"""页感知 B 树：估算扇出/树高、模拟页 I/O 计数、批量 bulk-load。"""
from __future__ import annotations
from dataclasses import dataclass
from typing import List, Optional, Tuple
import math


@dataclass
class PageStats:
    page_size: int = 16384       # 16KB
    key_size: int = 8            # 主键
    ptr_size: int = 6            # 页号（压缩指针示意）

    @property
    def slots_per_node(self) -> int:
        """一页大约能放多少个 (key,ptr)。"""
        return max(2, self.page_size // (self.key_size + self.ptr_size))

    @property
    def max_degree(self) -> int:
        """阶 m：最多孩子数。"""
        return self.slots_per_node

    @property
    def min_degree(self) -> int:
        """CLRS 最小度数 t ≈ m/2。"""
        return max(2, self.max_degree // 2)


def estimated_height(n: int, t: int) -> int:
    """h <= 1 + log_t ((n+1)/2)，返回保守整数上界。"""
    if n <= 0:
        return 0
    h = 1 + math.log((n + 1) / 2, t)
    return math.ceil(h)


def estimate_io_point_query(n: int, stats: PageStats, buffer_hit_top_levels: int = 0) -> int:
    """点查 I/O 次数上界：树高减去已被缓冲的上层。"""
    t = stats.min_degree
    h = estimated_height(n, t)
    return max(0, h - buffer_hit_top_levels)


class PagedBTree:
    """教学版：节点即页，统计读页次数。支持 bulk-load 与查找。"""

    def __init__(self, t: int = 4):
        self.t = t
        self.root_keys: List[int] = []
        self.root_children: List[list] = []  # 哨兵结构，用列表模拟页
        self.leaves: List[List[int]] = [[]]  # 用叶子页列表简化
        self.leaf_pages = 1
        self.page_reads = 0

    def bulk_load(self, sorted_keys: List[int], page_capacity: int):
        """自底向上顺序构建：O(n/B) 顺序写。"""
        assert sorted_keys == sorted(set(sorted_keys))
        self.leaves = []
        for i in range(0, len(sorted_keys), page_capacity):
            self.leaves.append(sorted_keys[i:i + page_capacity])
        self.leaf_pages = len(self.leaves)
        # 内部节点自底向上归并路由键（右页最小键）
        level = [pg[0] if pg else 0 for pg in self.leaves]
        # 简化：查找时线性扫叶子索引；真实实现应建内部索引
        self._index = level
        self.page_reads = 0

    def search(self, k: int) -> bool:
        """统计页读：先读索引页（简化为 1 页），再读叶子页。"""
        self.page_reads += 1  # 根/索引
        # 二分定位叶子
        lo, hi = 0, len(self.leaves) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if self._index[mid] <= k:
                lo = mid
            else:
                hi = mid - 1
        self.page_reads += 1  # 叶子
        return k in self.leaves[lo]

    def range_scan(self, lo: int, hi: int) -> List[int]:
        out: List[int] = []
        for pg in self.leaves:
            self.page_reads += 1
            if pg and pg[0] > hi:
                break
            for x in pg:
                if x > hi:
                    return out
                if x >= lo:
                    out.append(x)
        return out


if __name__ == "__main__":
    # 16KB 页、8B 键、6B 指针 → 每页约 1170 槽，t≈585
    stats = PageStats()
    assert stats.slots_per_node >= 1000
    t = stats.min_degree
    h = estimated_height(10 ** 9, t)
    assert h <= 5  # 十亿键不超过 5 层

    # 批量加载 1..1000，页容量 100 → 10 叶
    bt = PagedBTree()
    keys = list(range(1, 1001))
    bt.bulk_load(keys, page_capacity=100)
    assert bt.leaf_pages == 10
    assert bt.search(500)
    assert bt.page_reads == 2  # 1 索引 + 1 叶子
    assert not bt.search(2000)
    assert bt.page_reads == 4  # 再查一次：2 索引 + 2 叶子

    # 范围扫描
    bt2 = PagedBTree()
    bt2.bulk_load(keys, page_capacity=100)
    rs = bt2.range_scan(150, 250)
    assert rs == list(range(150, 251))

    # 估算 I/O
    io = estimate_io_point_query(10 ** 6, stats, buffer_hit_top_levels=2)
    assert 0 <= io <= 3
    print("B树与磁盘IO优化：全部用例通过")
```

## 五、与其他技术对比

| 方案 | 点查 I/O | 范围 | 写入 | 适用 |
|------|----------|------|------|------|
| 红黑树（每节点一页） | $O(\log_2 n)$ | 中序慢 | 一般 | 纯内存 |
| **B/B+ 树** | $O(\log_t n)$ | 顺序优 | 分裂可控 | **磁盘/SSD 索引** |
| 哈希索引 | $O(1)$ | 差 | 扩容抖 | 点查专用 |
| LSM 树 | 读放大 | 归并 | 顺序写优 | 写密集 |
| 直接顺序文件 | $O(n/B)$ | 优 | 追加优 | 日志、冷数据 |

取舍：**OLTP 点查+范围用 B+ 树**；追加写多、可接受 compaction 用 LSM；内存场景不必强上 B 树。

## 六、常见误区

1. **按 CPU 复杂度选数据结构，忽略 I/O。** 红黑树比较次数少但页传输多；外存场景应先算树高对应的 I/O。
2. **节点大小随意。** 节点半页浪费带宽，两页增加分裂与对齐问题；应对齐文件系统块/数据库页。
3. **认为缓冲池能“救回”一切。** 缓冲只救热点；冷数据范围扫、随机 UUID 插入仍会打满磁盘。
4. **用随机主键（UUIDv4）做聚簇索引。** 页分裂频繁、填充率低、写放大高；应使用自增、有序 UUIDv7、或显式 bulk-load。
5. **忽略预读与顺序性。** B+ 树叶链 + read-ahead 才有高吞吐；打乱页布局会退化为随机读。

## 七、与开源书/权威来源对应

- Cormen et al., *Introduction to Algorithms*, 第 18 章 — B 树与外存讨论。
- Vitter, *External Memory Algorithms and Data Structures*, ACM Computing Surveys, 2001.
- Graefe, *Modern B-Tree Techniques*, Foundations and Trends in Databases, 2010.
- MySQL InnoDB / PostgreSQL 文档中的 page size、buffer pool、fillfactor 章节。

## 八、面试题

**1. 页 8KB、键指针共 20B，估算 $n=10^8$ 的树高。**
参考答案：每页约 400 槽，$t \approx 200$。$h \le 1 + \log_{200}(10^8/2) \approx 3$。点查约 3 次页读，上层缓存后常 1 次。

**2. 为什么 B+ 树范围查询比 B 树快？**
参考答案：B+ 树叶子链表顺序读 + 预读；B 树中序遍历需回溯内部节点，随机 I/O 多。

**3. 如何减少 B 树页分裂？**
参考答案：自增/有序键、bulk-load、调高 fillfactor 预留空位、延迟合并、避免频繁随机更新同一页。

**4. 缓冲池命中率 99% 时 B 树还有优势吗？**
参考答案：有。树高低意味着热点页少、易缓存；哈希或更深结构可能缓存不中。且范围扫描仍受益叶链与顺序 I/O。

## 九、演进与趋势

**NVMe/NVRAM 时代**：延迟下降但带宽与并行度更重要，B 树节点变大（64KB），多队列、异步 I/O、io_uring 普及。**分层存储**：热数据 DRAM、温数据 SSD、冷数据对象存储，B 树页可下沉（buffer pool extension）。

**WiscKey / Bε 树**：把值从索引分离，进一步写友好。**并发与无锁**：Bw-tree、Masstree、ART 适配多核与持久内存。**云数据库**：Aurora 日志即数据库、PolarDB 共享存储，把 B 树页读写下推到远端，树高与网络往返重新权衡。

## 十、小结

B 树是为 I/O 而生的结构：节点对齐页、高扇出压树高、完美平衡保证稳定延迟。再叠加缓冲池、预读、聚簇与 bulk-load，才能把外存索引的性能做满。理解 $h \le \log_{\lceil m/2\rceil}\frac{n+1}{2}+1$ 与页模型，是数据库与文件系统调优的理论起点。
