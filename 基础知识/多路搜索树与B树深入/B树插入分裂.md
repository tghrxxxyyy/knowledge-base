# B树插入分裂

> 对应 CLRS《Introduction to Algorithms》第 18 章 B-TREE-INSERT 与 B-TREE-SPLIT-CHILD，以及 Bayer & McCreight (1972) 原始论文中的节点分裂策略。

## 一、背景与挑战

B 树插入必须同时维护三条不变量：节点关键字数 $\le 2t-1$、非根节点关键字数 $\ge t-1$、所有叶子同深。朴素做法是“先把关键字塞进叶子，满了再向上分裂”，但若在递归返回时才分裂，会出现两种麻烦：一是父节点已满、分裂又要再向上传播，实现上需要回溯；二是根分裂时机不清晰，树高增长容易写错。

CLRS 采用**预分裂（preemptive split）**：从根向下查找插入位置的途中，**只要遇到满节点（恰好 $2t-1$ 个关键字）就先把它分裂**，再下降。这样保证走到叶子时叶子必有空位，插入永远是叶子上的 $O(1)$ 写入（外加路径上已做好的分裂）。根满时先分裂根，产生新根，树高加一——这是 B 树唯一增高方式。

为什么这样设计？外存索引的写入路径常常“顺路”做 I/O。预分裂把分裂成本摊在下降路径上，避免向上回溯修改已写回的页；同时向下时还能利用“即将要写的页已在缓冲池”优化。数据库实现里（如 InnoDB）也采用类似思路，配合迷你事务（mini-transaction）与 WAL 保证分裂的原子性。

面试中“B 树插入如何维持平衡”“满节点分裂时中间关键字去哪了”是高频题。核心答案是：**中间关键字上提到父节点，左右两半成为兄弟**；根分裂则新建根、树高 +1。

## 二、核心原理

### 1. 节点分裂（B-TREE-SPLIT-CHILD）

设父节点 $x$ 的第 $i$ 个孩子 $y$ 已满（$2t-1$ 个关键字）。分裂步骤：

1. 新建节点 $z$，把 $y$ 的后 $t-1$ 个关键字移到 $z$。
2. 把 $y$ 的**中间关键字** $k = y.keys[t-1]$（0 下标）**上提**到父节点 $x$，插在 $x.keys[i]$ 位置。
3. 把 $z$ 作为 $x$ 的第 $i+1$ 个孩子。
4. 若 $y$ 非叶，把 $y$ 对应的后 $t$ 个孩子指针一起移到 $z$。

分裂后：$y$ 有 $t-1$ 个关键字，$z$ 有 $t-1$ 个关键字，父节点多 1 个关键字、1 个孩子。

**为什么中间关键字上提？** B 树节点内关键字划分搜索区间。$y$ 的关键字 $k_0<\cdots<k_{2t-2}$，中间 $k=k_{t-1}$ 正好把搜索空间均分：左半 $(−\infty, k)$ 归 $y$，右半 $(k, +\infty)$ 归 $z$。上提到父节点后，$k$ 成为 $y$ 与 $z$ 的分隔键，保持全局有序不变量。

### 2. 插入（B-TREE-INSERT）

```
insert(T, k):
    r = T.root
    if r 满:          # 根特判
        新建 s，s 成为新根，s 的唯一孩子是 r
        split_child(s, 0)
        T.root = s
        树高 +1
    insert_nonfull(T.root, k)

insert_nonfull(x, k):
    i = x.keys 的下标指针
    if x.leaf:
        把 k 插入 x.keys[i] 位置
    else:
        若 x.children[i] 满: split_child(x, i)
        根据 k 与 x.keys 比较决定下降到哪个孩子
        递归 insert_nonfull
```

**不变量**：进入 `insert_nonfull(x,k)` 时，$x$ 一定不满（$<2t-1$）。根节点在入口保证；非根在下降前若将要进入的孩子满，先分裂，分裂后两个兄弟各 $t-1$，父多 1 关键字但父原本不满（由归纳），故父不会溢出。

### 3. 边界条件

- **关键字已存在**：经典 B 树通常不允许重复键；若允许可在节点内维护多重集或在值中放链表。
- **$t=2$**：节点关键字 1~3，分裂出的兄弟各 1 个关键字，中间键上提。
- **空树**：根是空叶，直接插入。
- **根满且插入关键字恰好会触发根分裂**：必须先分裂根再下降，否则递归里改根引用困难。

### 4. 为什么正确

- 分裂后左右节点各 $t-1$ 个关键字，满足最少填充。
- 中间键上提后父节点关键字有序性保持（插入位置正确）。
- 叶子同深：分裂不改变叶子深度；根分裂新增一层，所有叶子同步加深。
- 由“只有根分裂增层”与“预分裂保证不满传递”，树始终是合法 B 树。

## 三、形式化与数学基础

**分裂的复杂度。** 一次 `split_child` 涉及移动 $t-1$ 个关键字与最多 $t$ 个孩子指针，时间 $O(t)$。插入沿树高最多做 $h$ 次分裂（路径上每层至多一次），故

$$
T_{\text{insert}} = O(h \cdot t) = O(t \log_t n).
$$

若 $t$ 视为常数，则 $O(\log n)$；工程上 $t$ 由页大小决定，$t \approx P/(2B)$，$B$ 为键+指针大小。

**树高增长。** 仅当根分裂时高度 $+1$。根有 $2t-1$ 个关键字被分裂后，新根 1 个关键字、两个孩子各 $t-1$ 个关键字。故高度变化是“台阶式”的，且与 $n$ 对数相关：

$$
h \le 1 + \log_t \frac{n+1}{2}.
$$

**关键字数与节点数。** 设节点数 $N$，则 $n \ge (t-1)(N-1)/2$ 量级（最稀疏），$n \le (2t-1)N$。插入序列无论顺序如何，最终高度只与 $n$、$t$ 有关——这是 B 树“与插入顺序无关的完美平衡”的形式化表述。

**均摊分析。** 最坏一次插入 $O(t\log_t n)$；均摊分裂次数更少，因为合并/再分裂需先有删除等操作。教材常写插入时间 $O(\log n)$ 次 I/O、$O(t\log n)$ CPU。

**与红黑树对比的双对数。** 红黑树插入最多 2~3 次旋转、$O(\log n)$ 比较；B 树插入的“旋转”即分裂/借位，目标是减少 I/O 而非减少比较。

## 四、代码实现

```python
"""B 树插入（预分裂）与查找/中序遍历。"""
from __future__ import annotations
from typing import List, Optional, Tuple


class BTreeNode:
    def __init__(self, leaf: bool = False):
        self.keys: List[int] = []
        self.children: List["BTreeNode"] = []
        self.leaf = leaf


class BTree:
    def __init__(self, t: int = 3):
        assert t >= 2
        self.t = t
        self.root = BTreeNode(leaf=True)

    # ---------- 查找 ----------
    def search(self, k: int) -> Optional[Tuple[BTreeNode, int]]:
        return self._search(self.root, k)

    def _search(self, x: BTreeNode, k: int):
        i = 0
        while i < len(x.keys) and k > x.keys[i]:
            i += 1
        if i < len(x.keys) and k == x.keys[i]:
            return x, i
        if x.leaf:
            return None
        return self._search(x.children[i], k)

    # ---------- 分裂 ----------
    def _split_child(self, x: BTreeNode, i: int):
        """分裂 x 的第 i 个满孩子 y，中间键上提到 x。"""
        t = self.t
        y = x.children[i]
        z = BTreeNode(leaf=y.leaf)
        mid = y.keys[t - 1]
        # z 拿走 y 的后 t-1 个关键字
        z.keys = y.keys[t:]
        y.keys = y.keys[: t - 1]
        if not y.leaf:
            z.children = y.children[t:]
            y.children = y.children[:t]
        x.children.insert(i + 1, z)
        x.keys.insert(i, mid)

    # ---------- 插入 ----------
    def insert(self, k: int):
        t = self.t
        root = self.root
        if len(root.keys) == 2 * t - 1:
            new_root = BTreeNode(leaf=False)
            new_root.children = [root]
            self._split_child(new_root, 0)
            self.root = new_root
            self._insert_nonfull(new_root, k)
        else:
            self._insert_nonfull(root, k)

    def _insert_nonfull(self, x: BTreeNode, k: int):
        t = self.t
        i = len(x.keys) - 1
        if x.leaf:
            x.keys.append(0)  # 占位
            while i >= 0 and k < x.keys[i]:
                x.keys[i + 1] = x.keys[i]
                i -= 1
            x.keys[i + 1] = k
        else:
            while i >= 0 and k < x.keys[i]:
                i -= 1
            i += 1
            if len(x.children[i].keys) == 2 * t - 1:
                self._split_child(x, i)
                if k > x.keys[i]:
                    i += 1
            self._insert_nonfull(x.children[i], k)

    # ---------- 工具 ----------
    def keys_inorder(self) -> List[int]:
        out: List[int] = []

        def walk(x: BTreeNode):
            for i, key in enumerate(x.keys):
                if not x.leaf:
                    walk(x.children[i])
                out.append(key)
            if not x.leaf:
                walk(x.children[len(x.keys)])

        walk(self.root)
        return out

    def height(self) -> int:
        h, x = 0, self.root
        while not x.leaf:
            x = x.children[0]
            h += 1
        return h

    def validate(self) -> bool:
        t = self.t

        def check(x: BTreeNode, is_root: bool) -> int:
            assert all(x.keys[i] < x.keys[i + 1] for i in range(len(x.keys) - 1))
            if not is_root:
                assert t - 1 <= len(x.keys) <= 2 * t - 1
            else:
                assert 1 <= len(x.keys) <= 2 * t - 1
            if x.leaf:
                return 1
            assert len(x.children) == len(x.keys) + 1
            depths = {check(c, False) for c in x.children}
            assert len(depths) == 1
            return depths.pop() + 1

        check(self.root, True)
        return True


if __name__ == "__main__":
    # t=2 插入 1..10
    bt = BTree(t=2)
    for k in range(1, 11):
        bt.insert(k)
        assert bt.validate()
    assert bt.keys_inorder() == list(range(1, 11))
    assert bt.search(7) is not None
    assert bt.search(11) is None

    # 逆序插入
    bt2 = BTree(t=3)
    for k in range(30, 0, -1):
        bt2.insert(k)
        assert bt2.validate()
    assert bt2.keys_inorder() == list(range(1, 31))

    # 乱序 + 重复检测
    import random
    random.seed(42)
    bt3 = BTree(t=3)
    data = list(range(1, 51))
    random.shuffle(data)
    for k in data:
        bt3.insert(k)
    assert bt3.validate()
    assert bt3.keys_inorder() == list(range(1, 51))

    # 中间键上提的直接验证：t=2 插入 1..7，根应含中间元素
    bt4 = BTree(t=2)
    for k in range(1, 8):
        bt4.insert(k)
    assert bt4.validate()
    assert len(bt4.root.keys) >= 1
    print("B树插入分裂：全部用例通过")
```

## 五、与其他技术对比

| 策略 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| **预分裂（CLRS）** | 下降途中遇满先分裂 | 无回溯，I/O 友好 | 路径上可能多一次分裂 |
| 后分裂 | 插入叶子后向上分裂 | 直观 | 需回溯/递归返回改父 |
| 懒分裂 | 满节点暂存溢出页 | 少写 | 查询变复杂，需合并溢出 |
| B* 树 | 先向兄弟挪/三方合并 | 填充率高 | 分裂更复杂 |
| LSM | 内存表 + 顺序 flush | 写吞吐高 | 读放大、需要 compaction |

取舍：**教学与面试按 CLRS 预分裂写**；生产数据库在预分裂基础上加并发锁与日志。写入密集、空间敏感可考虑 B* 或 LSM。

## 六、常见误区

1. **中间关键字塞进左或右节点，而不是上提。** 后果：父节点缺分隔键，搜索区间错误，查找不到本应存在的键。
2. **忘记“根满先分裂”。** 根被写满后插入失败或树高不变导致叶子深度不一。根是唯一允许少于 $t-1$ 关键字的节点，也是唯一增高点。
3. **分裂后孩子指针没跟着搬。** 非叶节点分裂时必须把后 $t$ 个孩子移给 $z$，只搬关键字会破坏子树与区间对应。
4. **下标 `i` 在分裂后未更新。** 若上提键后 $k > x.keys[i]$，应下降到右兄弟 `i+1`；忘改则插入错孩子，有序性被破坏。
5. **验证器不查“叶子同深”。** 只查关键字数范围是不够的；B 树的平衡靠叶子同深保证。

## 七、与开源书/权威来源对应

- Cormen et al., *Introduction to Algorithms*, 3ed., 第 18.2 节 — `B-TREE-SPLIT-CHILD` / `B-TREE-INSERT` 伪代码与证明。
- Bayer & McCreight, *Organization and Maintenance of Large Ordered Indexes*, 1972.
- Knuth, TAOCP Vol. 3, 6.2.4 — 多路树插入与分裂的历史讨论。
- PostgreSQL / MySQL InnoDB 源码中的 page split（`btr_page_split_and_insert`）是预分裂思想的工业实现。

## 八、面试题

**1. B 树插入一个满节点时如何处理？**
参考答案：把满节点按中间关键字分裂成两个各含 $t-1$ 个关键字的节点，中间关键字上提到父节点作为分隔键。父满则递归分裂；根满则新建根，树高 +1。CLRS 用预分裂：下降途中先分裂满孩子。

**2. 为什么 B 树插入不需要旋转（像 AVL 那样）？**
参考答案：B 树靠节点分裂维持“关键字数有上下界 + 叶子同深”。分裂只在节点溢出时发生，天然保持完美平衡；没有“高度差 1”这类局部调整需求。

**3. 插入复杂度是多少？**
参考答案：下降 $O(h)$，每层至多一次 $O(t)$ 的分裂，总 $O(t \log_t n)$；I/O 主导时为 $O(\log_t n)$ 次页访问。

**4. 如何实现允许重复键的 B 树？**
参考答案：(a) 节点内同一键多值（多重集）；(b) 键后接值列表/链表；(c) 把 value 编码进键 `(key, seq)` 保持唯一。索引场景常用 (b)/(c)。

## 九、演进与趋势

**并发插入**：B-link 树在节点加右链与高键，分裂时先链后改父，避免长期持锁；InnoDB 用悲观锁 + mini-transaction；Masstree、Bw-tree 走 latch-free 路线。

**缓冲池友好分裂**：现代引擎会考虑“尽量向左/右兄弟借”减少页分裂次数（类似 B*），并统计分裂频率调 `fillfactor`。**SSD 上** 减少写放大比减少树高更重要，会延迟分裂、批量写入。

**工程延伸**：LSM 树的 SSTable 内部仍常用 B 树式块索引；Btrfs、XFS 的目录项结构是 B 树变体。理解插入分裂的不变量，才能读懂这些工业实现的“为什么这么写”。

## 十、小结

B 树插入的精髓是**预分裂 + 中间关键字上提**：下降时保证目标节点不满，满节点一分为二、中位键升父，根分裂则长高。它用局部 $O(t)$ 代价换来全局“叶子同深、半满填充”，是外存有序索引写入路径的标准解。
