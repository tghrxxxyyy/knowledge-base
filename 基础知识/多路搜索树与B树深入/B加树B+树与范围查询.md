# B加树B+树与范围查询

> 对应 Comer (1979)《The Ubiquitous B-Tree》、Bayer & McCreight (1972)，以及 MySQL InnoDB / PostgreSQL 索引实现文档中对 B+ 树的描述。

## 一、背景与挑战

关系数据库与文件系统里最频繁的操作不只是点查，还有**范围查询**：`WHERE age BETWEEN 20 AND 30`、`ORDER BY id LIMIT 100`、文件系统按名遍历目录区间。B 树虽然也能做范围查询（中序遍历），但有个结构性麻烦：数据分散在各层内部节点，中序遍历要反复回溯父节点，外存上变成大量随机 I/O，无法顺序读。

B+ 树（B+-tree）针对这一点做了两处关键改造：

1. **内部节点只存键与子指针，不存行数据**——纯路由，同样一页能放更多键，分支因子更大、树更矮。
2. **所有记录都在叶子，叶子之间用双向链表串起来**——范围扫描变成“定位起点 + 顺链表顺序读”，完全线性、缓存与预读友好。

工程上，InnoDB 聚簇索引、PostgreSQL 的 `nbtree`、SQLite、SQL Server、NTFS/ext4 目录、HFS+ 都是 B+ 树。面试中“B 树与 B+ 树区别”“为什么范围查询快”“聚簇索引叶子存什么”是数据库索引必考题。理解 B+ 树，等于理解了磁盘上“点查 + 范围 + 有序遍历”三大需求的标准解。

## 二、核心原理

### 1. 结构定义

- **内部节点（internal）**：$n$ 个键 $k_1 < \cdots < k_n$，$n+1$ 个子指针，键是子树的**路由键**（通常是子树中的最小键或分隔键），**不含记录指针**。
- **叶子节点（leaf）**：按序存放 $(key, value)$ 对（或记录），叶子间用 `prev/next` 链表相连，头尾可哨兵。
- **平衡**：所有叶子同深，与 B 树相同。
- **填充**：非根节点至少半满；叶子与内部节点分别计。

### 2. 点查找

从根沿路由键下降到叶子，在叶子中找 $key$，读出 $value$。路径长度等于树高 $h = O(\log_t n)$，且每层只读一页。

### 3. 范围查询

`range(a, b)`：

1. 下降到 $a$ 所在叶子，定位起点（lower_bound）。
2. 沿 `next` 链表顺序读叶子，输出 $key \le b$ 的记录，直到超出上界或链表尾。

复杂度：$O(h + L)$ 次节点访问，$L$ 为结果条数对应的叶子页数；顺序 I/O 摊还后接近 $O(h + \frac{|R|}{B})$，$B$ 为一页记录数。

### 4. 为什么正确

- 内部路由键保持搜索区间划分，点查路径唯一且最短。
- 叶子链表保持全局有序：相邻叶子的键区间连续，顺链即得有序序列。
- 平衡由 B 树式分裂/合并维护：叶子满则分裂，中位键**复制**（B+ 常用 copy 而非 move）到父节点作为路由；父满递归分裂。

**与 B 树的关键差别——中位键“复制”而非“移走”**：B 树把中间关键字上提后该键不在子节点；B+ 树叶子分裂时中间键在右叶子仍保留一份，父节点只存路由副本，保证叶子层是完整的有序全集。

### 5. 边界条件

- 重复键：叶子放多值，或键为复合 $(key, pk)$。
- 删除下溢：与 B 树类似借位/合并；链表指针必须同步维护。
- 聚簇 vs 二级：叶子 value 是整行还是主键回表，见专篇。

## 三、形式化与数学基础

**树高。** 内部节点不含记录，只含 $m-1$ 个路由键与 $m$ 个指针。页大小 $P$，键大小 $K$，指针 $P_{tr}$，则

$$
m \approx \left\lfloor \frac{P}{K + P_{tr}} \right\rfloor.
$$

树高上界同 B 树：

$$
h \le \log_{\lceil m/2 \rceil}\frac{n+1}{2} + 1.
$$

由于内部节点更“瘦”（只存键），同页下 $m$ 比 B 树更大，$h$ 更小。

**点查 I/O。** 沿树高 $h$ 次页读；缓冲池命中根与上层后，常降至 1~3 次真实 I/O。

**范围查询 I/O。** 定位 $O(h)$，顺序扫描 $\lceil |R| / B_{\text{leaf}} \rceil$ 页，$B_{\text{leaf}}$ 为一页容纳记录数。对比 B 树中序遍历的“节点回溯”，B+ 树连续链使预读（read-ahead）生效，吞吐高一个数量级。

**填充率。** 叶子与内部皆可维护 $\ge 50\%$ 填充（B* 或延迟合并可更高）。$n$ 条记录占用页数约 $\frac{n}{B_{\text{leaf}} \cdot f}$，$f$ 为填充率。

**范围查询下界。** 任何基于比较的有序索引输出 $L$ 条记录至少 $\Omega(L)$，B+ 树达到 $O(h + L/B)$，在磁盘模型下接近最优。

## 四、代码实现

```python
"""B+ 树：插入（分裂）、点查、范围查询。内部节点只路由，叶子链表相连。"""
from __future__ import annotations
from typing import List, Optional, Tuple, Any


class LeafNode:
    def __init__(self):
        self.keys: List[int] = []
        self.values: List[Any] = []
        self.next: Optional["LeafNode"] = None
        self.prev: Optional["LeafNode"] = None


class InternalNode:
    def __init__(self):
        self.keys: List[int] = []            # 路由键
        self.children: list = []             # InternalNode | LeafNode


class BPlusTree:
    def __init__(self, order: int = 4):
        """order = 最多孩子数（阶 m），叶子最多 order-1 条。"""
        assert order >= 3
        self.order = order
        self.root: Any = LeafNode()

    # ---------- 查找 ----------
    def _find_leaf(self, k: int) -> LeafNode:
        node = self.root
        while isinstance(node, InternalNode):
            i = 0
            while i < len(node.keys) and k >= node.keys[i]:
                i += 1
            node = node.children[i]
        return node

    def search(self, k: int) -> Optional[Any]:
        leaf = self._find_leaf(k)
        for i, key in enumerate(leaf.keys):
            if key == k:
                return leaf.values[i]
        return None

    def range_query(self, lo: int, hi: int) -> List[Tuple[int, Any]]:
        """返回 [lo, hi] 内所有 (key, value)，按 key 升序。"""
        out: List[Tuple[int, Any]] = []
        leaf = self._find_leaf(lo)
        while leaf is not None:
            for i, key in enumerate(leaf.keys):
                if key > hi:
                    return out
                if key >= lo:
                    out.append((key, leaf.values[i]))
            leaf = leaf.next
        return out

    # ---------- 插入 ----------
    def insert(self, k: int, v: Any):
        leaf = self._find_leaf(k)
        # 重复键则覆盖
        for i, key in enumerate(leaf.keys):
            if key == k:
                leaf.values[i] = v
                return
        # 有序插入
        i = 0
        while i < len(leaf.keys) and leaf.keys[i] < k:
            i += 1
        leaf.keys.insert(i, k)
        leaf.values.insert(i, v)
        # 叶子溢出则分裂
        if len(leaf.keys) >= self.order:
            self._split_leaf(leaf)

    def _split_leaf(self, leaf: LeafNode):
        mid = len(leaf.keys) // 2
        right = LeafNode()
        right.keys = leaf.keys[mid:]
        right.values = leaf.values[mid:]
        leaf.keys = leaf.keys[:mid]
        leaf.values = leaf.values[:mid]
        # 维护双向链表
        right.next = leaf.next
        right.prev = leaf
        if leaf.next is not None:
            leaf.next.prev = right
        leaf.next = right
        up_key = right.keys[0]  # 路由键：右叶子最小键（复制）
        self._insert_into_parent(leaf, up_key, right)

    def _split_internal(self, node: InternalNode):
        mid = len(node.keys) // 2
        up_key = node.keys[mid]
        right = InternalNode()
        right.keys = node.keys[mid + 1:]
        right.children = node.children[mid + 1:]
        node.keys = node.keys[:mid]
        node.children = node.children[: mid + 1]
        self._insert_into_parent(node, up_key, right)

    def _insert_into_parent(self, left: Any, key: int, right: Any):
        if left is self.root:
            new_root = InternalNode()
            new_root.keys = [key]
            new_root.children = [left, right]
            self.root = new_root
            return
        parent = self._find_parent(self.root, left)
        i = 0
        while i < len(parent.keys) and key >= parent.keys[i]:
            i += 1
        parent.keys.insert(i, key)
        parent.children.insert(i + 1, right)
        if len(parent.keys) >= self.order:
            self._split_internal(parent)

    def _find_parent(self, node: Any, child: Any) -> Optional[InternalNode]:
        if isinstance(node, LeafNode):
            return None
        for c in node.children:
            if c is child:
                return node
            if isinstance(c, InternalNode):
                p = self._find_parent(c, child)
                if p is not None:
                    return p
        return None

    # ---------- 工具 ----------
    def dump_leaves(self) -> List[int]:
        out: List[int] = []
        node = self.root
        while isinstance(node, InternalNode):
            node = node.children[0]
        while node is not None:
            out.extend(node.keys)
            node = node.next
        return out


if __name__ == "__main__":
    t = BPlusTree(order=4)
    for k in range(1, 21):
        t.insert(k, f"v{k}")
    assert t.search(7) == "v7"
    assert t.search(99) is None
    assert t.dump_leaves() == list(range(1, 21))

    rq = t.range_query(5, 12)
    assert [k for k, _ in rq] == list(range(5, 13))
    assert t.range_query(100, 200) == []
    assert t.range_query(1, 1) == [(1, "v1")]

    # 覆盖插入
    t.insert(7, "new7")
    assert t.search(7) == "new7"
    assert t.dump_leaves() == list(range(1, 21))

    # 乱序
    import random
    random.seed(3)
    t2 = BPlusTree(order=5)
    data = list(range(1, 61))
    random.shuffle(data)
    for k in data:
        t2.insert(k, k * 10)
    assert t2.dump_leaves() == list(range(1, 61))
    assert [k for k, _ in t2.range_query(10, 20)] == list(range(10, 21))
    assert all(t2.search(k) == k * 10 for k in data)
    print("B加树B+树与范围查询：全部用例通过")
```

## 五、与其他技术对比

| 结构 | 内部存数据 | 范围扫描 | 树高 | 典型应用 |
|------|------------|----------|------|----------|
| B 树 | 可以 | 中序回溯 | 较高 | 文件系统、部分索引 |
| **B+ 树** | 否，全在叶 | 叶链表顺序读 | 更矮 | **数据库索引主流** |
| B* 树 | 类似 B | 类似 | 更矮 | 写密集 |
| 红黑树 | 是 | 中序 | $\Theta(\log_2 n)$ | 内存 map |
| LSM 树 | — | 多层归并 | — | 写优化 |

取舍：**点查+范围+磁盘 → B+ 树**。内存有序容器用红黑树/跳表。写多读少可考虑 LSM，但范围与点查尾延迟通常 B+ 树更稳。

## 六、常见误区

1. **以为 B+ 树内部节点存行数据。** 后果：低估分支因子，高估树高；还可能错误地在内部直接返回记录，破坏“叶子是唯一数据层”的设计。
2. **叶子分裂时把中位键移走（像 B 树）。** B+ 树应**复制**路由键，叶子保留全集；移走会导致范围查询丢键。
3. **维护链表时漏 prev/next。** 只改 next 或忘记更新邻居，范围扫描断链或成环。
4. **范围查询从根做中序遍历。** 正确是 lower_bound 到叶子再顺链；从根遍历会退化为随机 I/O。
5. **比较 `k >= keys[i]` 的路由约定不统一。** 内部节点路由是“小于 key 走左、大于等于走右”还是相反，必须与插入分裂时 `up_key` 的选择（右最小 or 左最大）一致，否则查不到。

## 七、与开源书/权威来源对应

- Comer, *The Ubiquitous B-Tree*, ACM Computing Surveys, 1979 — B+ 树变体综述。
- Bayer & McCreight, 1972 — B 树原文，B+ 树思想源头。
- MySQL InnoDB 文档：Clustered and Secondary Indexes（B+ 树索引结构）。
- PostgreSQL `nbtree` README（`src/backend/access/nbtree/README`）— 工业 B+ 树设计。

## 八、面试题

**1. B 树与 B+ 树的区别？**
参考答案：B+ 树内部节点只存路由键与指针，所有记录在叶子；叶子用链表相连，范围查询顺序读。B 树内部可存数据，范围查询需中序回溯。B+ 树分支更大、树更矮、范围更强。

**2. 范围查询复杂度？**
参考答案：$O(h + L/B)$ 次 I/O，$h$ 为树高，$L$ 为结果条数，$B$ 为叶页记录数。定位起点 $O(h)$，之后顺序扫描链表。

**3. 为什么 B+ 树更适合磁盘？**
参考答案：内部节点纯路由 → 一页更多键 → 树高 3~4；叶子链表使预读生效；数据集中分布在少量叶子页，缓存命中率高。

**4. 叶子分裂时中间键如何处理？**
参考答案：右叶子保留最小键，父节点插入该键的副本作路由（copy-up）。这样叶子层保持完整有序全集。

## 九、演进与趋势

**并发 B+ 树**：B-link 树、latch coupling、Bw-tree（latch-free）支撑高并发 OLTP。**前缀压缩**：叶子存键前缀差分（InnoDB 的 prefix compression、SQLite 的 index keys），进一步提高扇出。**SSD 优化**：更大节点页、减少写放大的合并策略、TLC/QLC 上的冷热分离。

**与 LSM 的竞争融合**：RocksDB 的 BlobDB、PebblesDB、Dostoevsky 等在 LSM 上补强范围查询；TiDB/TiKV 用 Raft + RocksDB，CockroachDB 混用。**内存索引**：ART、Masstree、Bw-tree 在 DRAM/NVM 上挑战传统 B+ 树。**云原生**：Aurora、PolarDB 把 B+ 树页下推到共享存储层。

## 十、小结

B+ 树把 B 树的平衡外存骨架改造成“内部纯路由 + 叶子全数据 + 链表顺序读”，同时优化了点查 I/O 与范围扫描。它是现代数据库索引与文件系统的默认形态；掌握路由键约定、分裂复制与叶链维护，才能真正读懂执行计划与索引优化。
