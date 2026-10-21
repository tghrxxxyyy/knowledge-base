# B树在数据库索引中的应用

> 对应 MySQL InnoDB 官方手册（Clustered and Secondary Indexes）、PostgreSQL nbtree 文档，以及 Ramakrishnan & Gehrke《Database Management Systems》索引章节、Graefe《Modern B-Tree Techniques》。

## 一、背景与挑战

关系数据库的查询性能几乎完全由索引决定。一条 `SELECT * FROM orders WHERE user_id = ?` 若走全表扫描是 $O(n)$ 次 I/O；走 B+ 树索引是 $O(\log_t n)$ 次。更复杂的 `WHERE a BETWEEN ... AND ... ORDER BY b LIMIT 10`，则要求索引同时支持**点查、范围、有序输出**——这正是 B+ 树的主场。

工程中真正棘手的是索引与存储布局的耦合：

1. **聚簇索引（clustered）**：行数据按主键物理有序存放（InnoDB），主键查找一步到位；但二级索引叶子存主键值，查非索引列要“回表”，双倍 B+ 树查找。
2. **非聚簇 / 堆表（heap）**：行存在堆页，所有索引叶子存行指针（RID），更新不必移动行，但点查可能“堆表随机读”。
3. **MVCC 与并发**：InnoDB 用 undo 日志维护多版本，索引页与事务可见性、间隙锁（gap lock）交织，稍不注意就死锁或幻读。

面试中“主键为什么建议自增”“覆盖索引是什么”“为什么不要对长字符串建全列索引”“二级索引何时失效”是高频题。理解 B/B+ 树在数据库中的形态，是 SQL 调优与架构设计的基本功。

## 二、核心原理

### 1. B+ 树索引的三种角色

- **聚簇索引（InnoDB 主键）**：B+ 树叶子直接存整行（或行的完整物理位置），按主键排序。全表数据即“主键 B+ 树的叶子层”。
- **二级索引**：B+ 树叶子存（索引列值, 主键值）。查询非索引列需要拿主键再查聚簇索引——**回表（bookmark lookup）**。
- **覆盖索引（covering index）**：查询所需列都包含在索引叶子中，免回表。`EXPLAIN` 显示 `Using index`。

### 2. 点查、范围与排序

- 点查：沿 B+ 树下降 $O(\log_t n)$，叶子内定位。
- 范围：`BETWEEN`/`>`/`<` 先定位左端点，顺叶链扫描。
- 排序：`ORDER BY 索引列` 可免排序（index order scan）；否则 filesort。
- 前缀匹配：`LIKE 'abc%'` 可用索引；`LIKE '%abc'` 通常不能。

### 3. 回表与索引选择

优化器会权衡：

- 二级索引选择性高、回表少 → 走二级索引；
- 回表代价高（大量行）→ 可能全表扫；
- 覆盖索引最优：一次 B+ 树访问拿全列。

**最左前缀**：复合索引 `(a,b,c)` 只有在查询条件从最左列连续使用时才有效；跳过 `a` 直接用 `b` 通常失效（除非索引跳跃扫描等高级特性）。

### 4. 写入路径与页分裂

插入按主键顺序（自增）追加到最右页，几乎不随机；UUID 主键随机导致频繁页分裂、填充率下降、索引膨胀。二级索引更新还要维护多棵 B+ 树。

### 5. MVCC 简述（InnoDB）

聚簇索引行含事务 id 与回滚指针；更新产生 undo 版本链。一致性读用快照沿 undo 链找可见版本。索引本身不存多版本，辅助以锁（记录锁、间隙锁）保证隔离。

## 三、形式化与数学基础

**点查代价。** 二级索引点查：

$$
T_{\text{point}} \approx 2 \times O(\log_t n) + O(1)
$$

覆盖索引：

$$
T_{\text{cover}} \approx O(\log_t n).
$$

**范围扫描代价。** 选择性 $\sigma$，结果 $L = \sigma n$，叶页记录数 $B$：

$$
T_{\text{range}} = O(\log_t n) + O\left(\frac{L}{B}\right) + \text{回表代价}.
$$

回表若每行随机页，则额外 $O(L)$ 次 I/O——这就是“不要乱建二级索引”的量化原因。

**填充率与膨胀。** 设填充率 $f$，索引页数 $\approx \frac{n}{B f}$。随机插入 $f$ 可能低至 0.5~0.7；自增 $f$ 接近 1。膨胀导致树高 +1 与缓存污染。

**选择性（selectivity）**。列不同值比例 $\frac{\text{distinct}}{n}$；选择性过低（如性别）时索引无效，优化器偏好全表。复合索引的选择性是各列的联合估计。

**缓冲池命中模型。** 若根与上层常驻内存，真实 I/O 近似叶子层缺页：

$$
E[\text{I/O}] \approx (1-\text{hit rate}) \times h.
$$

生产中 $h=3\sim4$，命中率 99%+ 时平均 I/O < 0.05。

## 四、代码实现

```python
"""简化版 InnoDB 风格：聚簇 B+ 树 + 二级索引 + 回表演示。"""
from __future__ import annotations
from typing import List, Optional, Tuple, Dict, Any


class Leaf:
    def __init__(self):
        self.keys: List[int] = []
        self.values: List[Any] = []
        self.next: Optional["Leaf"] = None
        self.prev: Optional["Leaf"] = None


class Internal:
    def __init__(self):
        self.keys: List[int] = []
        self.children: List[Any] = []


class BPlusTree:
    def __init__(self, order: int = 4):
        self.order = order
        self.root: Any = Leaf()

    def _find_leaf(self, k: int) -> Leaf:
        node = self.root
        while isinstance(node, Internal):
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
        out = []
        leaf = self._find_leaf(lo)
        while leaf is not None:
            for i, key in enumerate(leaf.keys):
                if key > hi:
                    return out
                if key >= lo:
                    out.append((key, leaf.values[i]))
            leaf = leaf.next
        return out

    def insert(self, k: int, v: Any):
        leaf = self._find_leaf(k)
        for i, key in enumerate(leaf.keys):
            if key == k:
                leaf.values[i] = v
                return
        i = 0
        while i < len(leaf.keys) and leaf.keys[i] < k:
            i += 1
        leaf.keys.insert(i, k)
        leaf.values.insert(i, v)
        if len(leaf.keys) >= self.order:
            self._split_leaf(leaf)

    def _split_leaf(self, leaf: Leaf):
        mid = len(leaf.keys) // 2
        right = Leaf()
        right.keys, right.values = leaf.keys[mid:], leaf.values[mid:]
        leaf.keys, leaf.values = leaf.keys[:mid], leaf.values[:mid]
        right.next, right.prev = leaf.next, leaf
        if leaf.next:
            leaf.next.prev = right
        leaf.next = right
        self._insert_parent(leaf, right.keys[0], right)

    def _split_internal(self, node: Internal):
        mid = len(node.keys) // 2
        up = node.keys[mid]
        right = Internal()
        right.keys = node.keys[mid + 1:]
        right.children = node.children[mid + 1:]
        node.keys = node.keys[:mid]
        node.children = node.children[: mid + 1]
        self._insert_parent(node, up, right)

    def _insert_parent(self, left: Any, key: int, right: Any):
        if left is self.root:
            nr = Internal()
            nr.keys = [key]
            nr.children = [left, right]
            self.root = nr
            return
        parent = self._find_parent(self.root, left)
        i = 0
        while i < len(parent.keys) and key >= parent.keys[i]:
            i += 1
        parent.keys.insert(i, key)
        parent.children.insert(i + 1, right)
        if len(parent.keys) >= self.order:
            self._split_internal(parent)

    def _find_parent(self, node: Any, child: Any):
        if isinstance(node, Leaf):
            return None
        for c in node.children:
            if c is child:
                return node
            if isinstance(c, Internal):
                p = self._find_parent(c, child)
                if p:
                    return p
        return None


class SimpleInnoDB:
    """聚簇索引：pk -> row dict；二级索引：col -> pk 列表；查询演示。"""

    def __init__(self, order: int = 4):
        self.clustered = BPlusTree(order)   # pk -> row
        self.secondary: Dict[str, BPlusTree] = {}  # idx_name -> (col, pk)
        self.rows: Dict[int, Dict[str, Any]] = {}

    def create_index(self, name: str):
        self.secondary[name] = BPlusTree(order=4)

    def insert_row(self, pk: int, row: Dict[str, Any]):
        self.rows[pk] = row
        self.clustered.insert(pk, row)
        for name, tree in self.secondary.items():
            col = name  # 简化：索引名即列名
            # 二级索引键可重复：同一列值对应多个主键（InnoDB 叶子存 (col, pk)）
            existing = tree.search(row[col])
            if existing is None:
                tree.insert(row[col], [pk])
            else:
                existing.append(pk)

    def select_by_pk(self, pk: int) -> Optional[Dict[str, Any]]:
        return self.clustered.search(pk)

    def select_by_index(self, name: str, value: Any,
                        covering: bool = False) -> List[Dict[str, Any]]:
        """非覆盖索引：先二级再回表（聚簇）。covering=True 时仅演示免回表。"""
        tree = self.secondary[name]
        pks = tree.search(value) or []
        if covering:
            # 覆盖索引场景：只需索引列本身，直接返回
            return [{name: value, "pk": pk} for pk in pks]
        out = []
        for pk in pks:
            row = self.clustered.search(pk)  # 回表
            if row is not None:
                out.append(row)
        return out

    def range_by_pk(self, lo: int, hi: int) -> List[Dict[str, Any]]:
        return [row for _, row in self.clustered.range_query(lo, hi)]


if __name__ == "__main__":
    db = SimpleInnoDB(order=4)
    db.create_index("city")
    db.insert_row(1, {"name": "alice", "city": "BJ"})
    db.insert_row(2, {"name": "bob", "city": "SH"})
    db.insert_row(3, {"name": "carol", "city": "BJ"})
    db.insert_row(4, {"name": "dave", "city": "GZ"})

    assert db.select_by_pk(2)["name"] == "bob"
    rows = db.select_by_index("city", "BJ")
    assert {r["name"] for r in rows} == {"alice", "carol"}

    # 覆盖索引路径
    cov = db.select_by_index("city", "BJ", covering=True)
    assert {r["pk"] for r in cov} == {1, 3}

    rng = db.range_by_pk(2, 3)
    assert [r["name"] for r in rng] == ["bob", "carol"]

    # 复合前缀思想：最左前缀可用（此处以 pk 范围演示）
    assert db.range_by_pk(1, 4).__len__() == 4
    print("B树在数据库索引中的应用：全部用例通过")
```

## 五、与其他技术对比

| 索引形态 | 结构 | 点查 | 范围 | 写入 | 典型系统 |
|----------|------|------|------|------|----------|
| **聚簇 B+ 树** | 数据即叶 | 最快 | 优 | 页分裂可控 | InnoDB |
| 堆表 + 二级 B+ 树 | RID 回表 | 二次查找 | 优 | 行不动 | PostgreSQL/Oracle |
| 哈希索引 | 桶 | $O(1)$ | 差 | 扩容 | Memory 引擎、部分 NoSQL |
| LSM（SSTable） | 多层 | 读放大 | 归并 | 顺序写优 | RocksDB、Cassandra |
| 倒排索引 | 倒排表 | 关键词 | 交并 | 批量更 | Elasticsearch |

取舍：**OLTP 关系库默认 B+ 树**；写密集、可接受最终一致可 LSM；全文检索用倒排。聚簇 vs 堆表取决于“按主键范围查多”还是“更新频繁且主键随机”。

## 六、常见误区

1. **主键用随机 UUID。** 页分裂多、填充率低、二级索引膨胀、范围扫差。后果：磁盘空间翻倍、写延迟抖动。应用自增或有序 UUIDv7。
2. **以为建了索引一定走。** 选择性低、类型隐式转换、对列用函数、`OR` 拆索引、统计信息过期都会导致全表扫。要看 `EXPLAIN`。
3. **忽略回表成本。** 二级索引选大量行时回表随机 I/O 爆炸；应建覆盖索引或调整查询。
4. **复合索引列序乱放。** 高频等值列应在前，范围列在后；否则前缀中断。`(a,b)` 不能高效支持 `WHERE b=?`。
5. **长字符串整列做索引。** 页扇出骤降、树高上升；应前缀索引或哈希摘要，注意区分度。

## 七、与开源书/权威来源对应

- MySQL 8.0 Reference Manual: *Clustered and Secondary Indexes*, *B-Tree Indexes*.
- PostgreSQL Documentation: *Multicolumn Indexes*, `nbtree` README。
- Ramakrishnan & Gehrke, *Database Management Systems*, 索引与查询处理章节。
- Graefe, *Modern B-Tree Techniques*, Foundations and Trends in Databases, 2010.

## 八、面试题

**1. 聚簇索引与二级索引的区别？**
参考答案：聚簇索引叶子存整行，按主键排序（InnoDB）；二级索引叶子存索引列+主键，查非索引列需回表。覆盖索引可避免回表。

**2. 为什么建议自增主键？**
参考答案：插入顺序追加最右页，页分裂少、填充率高、缓存友好。随机 UUID 导致频繁分裂与碎片。

**3. 什么是覆盖索引？**
参考答案：查询列都包含在索引中，免回表。`EXPLAIN` 显示 `Using index`。可把高频查询列组合进复合索引。

**4. 复合索引 `(a,b,c)` 对哪些查询有效？**
参考答案：最左前缀：`a`、`a,b`、`a,b,c` 有效；`b,c` 一般失效；`a,c` 只用到 `a`。范围条件之后的列通常不能继续用于索引查找。

## 九、演进与趋势

**索引类型扩展**：空间索引（R-Tree）、全文倒排、JSON 路径索引、向量索引（HNSW/IVF）与 B 树并存。**写优化**：AWS Aurora、PolarDB 把 redo/页下推存储层；Google Spanner 分布式 B 树/ LSM 混合。

**自适应索引**：数据库自动推荐索引（Oracle SQL Access Advisor、Postgres HypoPG）、机器学习索引（ALEX、PG-Strom）探索替代结构。**压缩与前缀**：InnoDB 页压缩、prefix compression 提高扇出。**无锁并发**：Bw-tree、ART、Masstree 在内存数据库（Hekaton、H-Store）中挑战传统 B+ 树。

## 十、小结

B/B+ 树是数据库索引的骨架：聚簇索引把数据与主键序绑定，二级索引补出多维访问路径，覆盖索引消除回表。理解树高、填充率、页分裂、最左前缀与回表代价，才能真正读懂执行计划并写出高命中率的索引——这也是从“会写 SQL”到“会调库”的关键一步。
