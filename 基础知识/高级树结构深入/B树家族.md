# B树家族

> 对应 Bayer & McCreight《Organization and Maintenance of Large Ordered Indexes》(1972)；Comer《The Ubiquitous B-Tree》(1979)；CLRS 第 18 章；Ramakrishnan & Gehrke《数据库管理系统原理》索引章节。

## 一、背景与挑战

磁盘与 SSD 的随机 I/O 代价远高于内存访问：一次 4KB 随机读可能是内存访问的数万倍。二叉平衡树（AVL、红黑树）虽有 $O(\log n)$ 的复杂度，但每个结点只存一个键、只有两个孩子，树高达 $\log_2 n$——对千万级索引就是 24 层，意味着最坏 24 次磁盘 I/O。工程上必须**用一次 I/O 读一整页（如 4KB/16KB）来携带更多键、更多分支**，把树高压到 3–4 层。

B 树（B-Tree）为此而生：它是**多路平衡搜索树**，结点大小与页对齐，所有叶子同层。B 树及家族（B+ 树、B* 树、B^ε 树）几乎是所有关系数据库索引、文件系统目录、LSM 之外存储引擎的默认结构：MySQL InnoDB 聚簇索引、PostgreSQL 与 SQLite 的 B+ 树索引、NTFS/ext4 的目录索引、HBase Region 元数据……理解 B 树家族是理解数据库「为什么索引能加速查询」的必经之路。

面试中常考：B 树与 B+ 树区别、为什么数据库用 B+ 树不用哈希/红黑树、结点分裂合并、高度与 I/O 次数估算。

## 二、核心原理

**B 树定义（m 阶）。** 每个结点最多 $m$ 个孩子、最多 $m-1$ 个关键字；除根外每个结点至少 $\lceil m/2 \rceil$ 个孩子；所有叶子在同一深度。关键字在结点内有序，孩子指针夹在关键字之间形成区间：

```
      [k1 | k2 | k3]
     /    |     |    \
  <k1   k1..k2  k2..k3  >k3
```

**查找。** 在结点内二分/顺序找到关键字区间，下到对应孩子；直至叶子。比较次数 $O(\log_m n)$，每层一次 I/O。

**插入。** 先查找到叶子，把关键字插入叶子有序位置：

- 若叶子未满（关键字 $< m-1$），直接插入。
- 若叶子满，**分裂**：取中间关键字 `k_mid` 上提到父结点，左右两半成为两个孩子。父结点若因此变满，继续向上分裂；最坏分裂到根，根分裂则树高加一（唯一长高的方式）。

**删除。** 比插入复杂，分几种：

1. 删除叶子中的关键字，若结点关键字数仍 $\ge \lceil m/2 \rceil - 1$ 则结束。
2. 若过少（下溢），先向左右兄弟**借位**（兄弟够富）。
3. 兄弟都紧，则与某兄弟**合并**，并把父结点中间关键字拉下来；父可能继续下溢，向上传播。根只剩一个孩子时树高减一。

**B+ 树。** B 树最重要的变体，也是数据库实际使用的形态：

- **非叶结点只存索引键**（引导查找），不存数据记录；
- **所有数据都在叶子**；叶子之间用双向链表串起，范围扫描/全表扫描只需沿叶子走；
- 非叶结点能塞进更多键（没有数据指针挤占），扇出更大、树更矮。

**B* 树。** 分裂前先在兄弟间重新分配（2/3 利用率），减少分裂次数；TLB 与部分文件系统用到。

**B^ε 树。** 在结点加缓冲，把插入变成顺序写，兼顾点查与范围写，见于 TokuDB/ForestDB。

**边界条件。** 阶 $m$ 与页大小对齐（如 16KB 页 / 128B 键 ≈ 128 阶）；分裂时中间键是**上提**不是复制（B 树）；B+ 树非叶中间键可能被「复制」到右叶子，要分清；重复键处理；根的最小孩子数是 2 而非 $\lceil m/2 \rceil$。

## 三、形式化与数学基础

**高度上界。** $n$ 个关键字的 B 树，高度 $h$ 满足：

$$n \ge 1 + (\lceil m/2 \rceil - 1)\sum_{i=1}^{h-1} \lceil m/2 \rceil^{\,i-1} \cdot 1 = \Omega\!\left(\lceil m/2 \rceil^{\,h-1}\right).$$

更直接地，叶子数 $\ge \lceil m/2 \rceil^{h-1}$，故

$$h \le 1 + \log_{\lceil m/2 \rceil}\frac{n+1}{2}.$$

例如 $m=100$、$n=10^7$：$\lceil m/2 \rceil = 50$，$\log_{50}(5\times 10^6) \approx 3.3$，树高约 3–4 层，即 3–4 次 I/O。对比红黑树 24 层，这是 B 树胜出的本质。

**查找代价。** 每结点内比较 $O(\log_2 m)$，共 $O(\log_m n)$ 层，总比较 $O(\log_2 n)$，但 I/O 次数 $O(\log_m n)$——关键是 I/O 而不是比较。

**插入均摊。** 结点分裂均摊 $O(1)$ 次/插入；满树插入最坏 $O(h)$ 次分裂，但均摊到树的构造过程仍是 $O(\log_m n)$ I/O。

**B+ 树扇出。** 非叶结点只存键（如 8B 键 + 8B 指针 = 16B），16KB 页可容纳约 1000 个键，扇出 $F \approx 1000$。高度 $h \approx \log_F n$：$10^9$ 行约 3 层。叶子存数据页，范围扫描 $O(k + \log_F n)$。

**空间利用率。** B 树结点关键字数 $\in [\lceil m/2 \rceil - 1, m-1]$，利用率约 50%；B* 树约 66%；B+ 树叶子链便于预读与压缩。

## 四、代码实现

教学版 B+ 树插入（含结点分裂、叶子链），可运行经典用例；生产实现还要处理删除借位/合并与磁盘页管理。

```python
class BPlusNode:
    def __init__(self, leaf=False):
        self.leaf = leaf
        self.keys = []
        self.children = []  # 叶子：记录；内部：子结点
        self.next = None    # B+ 树叶子链

    def full(self, order):
        return len(self.keys) >= order - 1


class BPlusTree:
    """简化的 B+ 树：order = 最大关键字数 + 1（最大子结点数）。"""

    def __init__(self, order=4):
        self.order = max(order, 3)
        self.root = BPlusNode(leaf=True)

    def _find_leaf(self, key):
        node = self.root
        while not node.leaf:
            i = 0
            while i < len(node.keys) and key >= node.keys[i]:
                i += 1
            node = node.children[i]
        return node

    def search(self, key):
        leaf = self._find_leaf(key)
        return key in leaf.keys

    def insert(self, key, val=None):
        leaf = self._find_leaf(key)
        # 有序插入叶子
        i = 0
        while i < len(leaf.keys) and leaf.keys[i] < key:
            i += 1
        if i < len(leaf.keys) and leaf.keys[i] == key:
            leaf.children[i] = val   # 更新
            return
        leaf.keys.insert(i, key)
        leaf.children.insert(i, val)
        if not leaf.full(self.order):
            return
        self._split_leaf(leaf)

    def _split_leaf(self, leaf):
        mid = len(leaf.keys) // 2
        right = BPlusNode(leaf=True)
        right.keys = leaf.keys[mid:]
        right.children = leaf.children[mid:]
        leaf.keys = leaf.keys[:mid]
        leaf.children = leaf.children[:mid]
        right.next = leaf.next
        leaf.next = right
        self._insert_parent(leaf, right.keys[0], right)

    def _insert_parent(self, left, key, right):
        if left is self.root:
            new_root = BPlusNode(leaf=False)
            new_root.keys = [key]
            new_root.children = [left, right]
            self.root = new_root
            return
        parent = self._find_parent(self.root, left)
        i = parent.children.index(left)
        parent.keys.insert(i, key)
        parent.children.insert(i + 1, right)
        if parent.full(self.order):
            self._split_internal(parent)

    def _split_internal(self, node):
        mid = len(node.keys) // 2
        up_key = node.keys[mid]
        right = BPlusNode(leaf=False)
        right.keys = node.keys[mid + 1:]
        right.children = node.children[mid + 1:]
        node.keys = node.keys[:mid]
        node.children = node.children[:mid + 1]
        self._insert_parent(node, up_key, right)

    def _find_parent(self, node, child):
        if node.leaf or child in node.children:
            # 深度优先找直接父
            for c in node.children:
                if c is child:
                    return node
                if not c.leaf:
                    p = self._find_parent(c, child)
                    if p:
                        return p
        return None

    def range_query(self, lo, hi):
        leaf = self._find_leaf(lo)
        res = []
        while leaf:
            for k, v in zip(leaf.keys, leaf.children):
                if k < lo:
                    continue
                if k > hi:
                    return res
                res.append((k, v))
            leaf = leaf.next
        return res


if __name__ == "__main__":
    t = BPlusTree(order=4)
    for i in range(1, 21):
        t.insert(i, f"v{i}")
    assert t.search(7) and not t.search(99)
    print(t.range_query(5, 10))
    print("root keys:", t.root.keys)
```

## 五、与其他技术对比

| 结构 | 高度/I/O | 范围扫描 | 等值 | 更新 | 典型 |
|------|----------|----------|------|------|------|
| B+ 树 | $O(\log_F n)$，3–4 层 | 叶子链最优 | 快 | 分裂/合并 | InnoDB、PostgreSQL 索引 |
| B 树 | 同量级 | 中（非叶也存数据） | 快 | 分裂/合并 | 部分文件系统 |
| 哈希索引 | $O(1)$ 页（桶） | 不支持 | 最快 | 扩容 | Memory 引擎、点查 |
| 红黑树 | $\log_2 n$ 层，内存 | 中序 | 内存快 | 旋转 | 内存 map |
| LSM 树 | 写放大低 | 有序 SSTable | 读放大 | 顺序写 | LevelDB/RocksDB、HBase |

取舍分析：

- **磁盘/SSD 点查 + 范围扫**：B+ 树几乎唯一选择（缓存命中后也是 3 次以内的指针跳）。
- **纯等值、内存**：哈希更快；但哈希不支持范围与排序，且扩容抖动。
- **写密集、可接受读放大**：LSM 树顺序写更优。
- **内存有序统计**：红黑树/跳表。

## 六、常见误区

1. **阶数定义混淆。** 「m 阶」通常指**最多 m 个孩子**（即 $m-1$ 个键）；有的教材说「m 个关键字」，读题时必须对齐，否则分裂边界全错。
2. **分裂时中间键处理错误。** B 树把中间键**上提到父**（不在孩子中保留）；B+ 树叶子中间键**保留**在右叶子，并复制上提为索引。混用会导致重复或丢失键。
3. **以为 B+ 树非叶存数据。** 那是 B 树；B+ 树数据全在叶子，非叶只是「路标」。这正是扇出更大、范围扫描更快的原因。
4. **忘记根的最小占用不同。** 根至少 2 个孩子（或 1 个键），其他结点至少 $\lceil m/2 \rceil$ 个孩子。删除时根的特殊处理决定树高何时减一。
5. **只比较 B 树与哈希的「查询复杂度」。** 数据库选 B+ 树的主因是**磁盘 I/O 模式**与范围扫描，不是平均比较次数。哈希在 SSD 上随机读也输给 B+ 树的预读。
6. **用「结点数」估计高度。** 应该用「关键字数 n」与扇出 $F$：$h \approx \log_F n$。十亿行 3–4 层，不是二叉树的 30 层。

## 七、与开源书/权威来源对应

- Bayer, R., & McCreight, E. *Organization and Maintenance of Large Ordered Indexes*. Acta Informatica, 1972.
- Comer, D. *The Ubiquitous B-Tree*. ACM Computing Surveys, 1979（家族综述必读）。
- Cormen et al., *Introduction to Algorithms*, Ch. 18 B-Trees（插入分裂算法与高度引理）。
- Ramakrishnan & Gehrke, *Database Management Systems*（数据库索引与 B+ 树章）；GitHub：`mysql/mysql-server` 的 `btr0*.cc`、`postgres` 的 `nbtree`。

## 八、面试题

**1. B 树与 B+ 树的区别？为什么数据库用 B+ 树？**
参考答案：B+ 树非叶只存索引、数据全在叶子、叶子链表串接。因此扇出更大树更矮、范围扫描与全表扫描顺着叶子走、非叶能缓存更多索引。B 树非叶存数据，点查可能略少一层，但范围与缓存不友好。

**2. 一个 16KB 页、键 8B 的 B+ 树能存多少行？高度大概几层？**
参考答案：叶子存行指针，非叶键+指针约 16B，扇出约 1000。$10^9$ 行高度 $\log_{1000} 10^9 = 3$。实际还要算叶子装填因子与行宽。

**3. 为什么不用哈希索引？**
参考答案：哈希不支持范围查询、排序、前缀；冲突严重时退化；扩容有抖动；磁盘上桶随机读对预读不友好。B+ 树支持范围、有序、稳定 I/O 模式。

**4. B 树插入何时树高增加？删除何时减少？**
参考答案：插入时根分裂才长高；删除时根只剩一个孩子并合并后才变矮。其余分裂/合并都在下层进行。

## 九、演进与趋势

- **LSM-Tree 与 B+ 树互补**：写多读少（日志、时序、消息）用 LSM（顺序写、合并）；读多范围扫（交易、订单）用 B+ 树。现代引擎（RocksDB、TiKV、Cassandra）常两者并存或可切换。
- **Bw-Tree / Bε-Tree / 并发 B 树**：为多核与 SSD/NVM 优化的无锁/缓冲变体，是数据库内核热点。
- **B+ 树与列存、压缩**：列式存储用有序 Run + 稀疏索引模拟 B+ 树思想；ZSTD/字典压缩放在叶子。
- **文件系统**：ext4 的 htree、XFS 的 B+ 树、NTFS 的 B+ 目录树证明该结构同样统治文件系统元数据。
- **云原生与分布式**：分布式 SQL（CockroachDB、TiDB）用分层 B+ 树 / Pebble（LSM）做存储，B 树思想上移到「Region 分裂与负载均衡」。

## 十、小结

B 树家族用多路分支与页对齐把树高压到 3–4 层，让一次 I/O 带回尽可能多的键；B+ 树把数据收拢到叶子并串成链表，兼顾点查、范围扫与大扇出，因而成为数据库与文件系统索引的绝对主流。理解分裂上提、高度与扇出、以及 B/B+/哈希/LSM 的取舍，是存储与数据库面试与实战的核心。
