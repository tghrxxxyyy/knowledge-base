# B树定义与高度分析

> 对应 Bayer & McCreight (1972)《Organization and Maintenance of Large Ordered Indexes》，CLRS《Introduction to Algorithms》第 18 章 B 树，以及 Comer (1979)《The Ubiquitous B-Tree》。

## 一、背景与挑战

内存与磁盘之间存在巨大速度差：DRAM 访问约 100 ns，SSD 随机读约 100 μs，机械磁盘寻道约 10 ms，相差 $10^3$~$10^5$ 倍。外存以**页**（4KB/8KB/16KB）为 I/O 单位，一次读写比单字节访问贵不了太多。因此外存数据结构的优化目标不是“比较次数最少”，而是**磁盘 I/O 次数最少**，并且让节点大小对齐到页。

二叉平衡树（AVL、红黑树）每个节点只存 1 个关键字、2 个指针，高度 $\Theta(\log_2 n)$。$n=10^9$ 时树高约 30，查找要 30 次节点访问；若每个节点一页，就是 30 次随机 I/O，完全不可接受。更糟的是每页只用掉几个字节，带宽浪费 99% 以上。

B 树的思路是**多路平衡**：一个节点容纳上百个关键字，与一页对齐，把树高压到 3~4 层，查找只需 3~4 次 I/O。B 树及其变体 B+ 树是数据库索引、文件系统（HFS+、NTFS、ext4 的 HTree、XFS）、键值存储的事实标准。面试中“为何不用红黑树做数据库索引”“B 树高度如何算”是必考题，背后考察的是**外存计算模型（external memory model）**与 B 树不变量的理解。

## 二、核心原理

### 1. 定义（CLRS 最小度数 $t$ 版本）

B 树是满足下列性质的有根树：

1. **每个节点 $x$ 含 $n_x$ 个关键字，按升序排列**；含 $n_x+1$ 个子指针。
2. **每个非根内部节点至少 $t-1$ 个关键字**，至多 $2t-1$ 个；即至少 $t$ 个孩子，至多 $2t$ 个孩子（$t \ge 2$）。
3. **根至少 1 个关键字**（除非整棵树空）。
4. **所有叶子在同一深度**（完美平衡）。
5. **关键字划分区间**：若关键字为 $k_1 < \cdots < k_{n_x}$，子树 $C_0,C_1,\dots,C_{n_x}$ 满足 $C_i$ 中所有关键字落在 $(k_i, k_{i+1})$ 的开区间约定内（$k_0=-\infty$，$k_{n_x+1}=+\infty$）。

等价的**阶 $m$** 定义：每个节点最多 $m$ 个孩子、最多 $m-1$ 个关键字；非根非叶至少 $\lceil m/2 \rceil$ 个孩子。常见对应 $m = 2t$（此时最少关键字 $t-1 = m/2 - 1$，与 $\lceil m/2 \rceil$ 个孩子一致）。

### 2. 核心不变量

- **平衡不变量**：所有叶子同深，树高完全由关键字数决定，不依赖插入顺序（与红黑树的“近似平衡”本质不同）。
- **填充不变量**：除根外每个节点至少半满（约 $t-1$ 个关键字）。这保证了节点数下界，从而压低树高。
- **有序不变量**：节点内关键字有序，子树划分搜索区间；查找是“节点内二分 + 下降一层”。

### 3. 查找过程

从根开始，在节点内二分查找（$O(\log t)$ 次比较，但节点已在内存时很快），找到等于则成功；否则沿对应子指针下降，直到叶子。I/O 次数 = 树高 $h$。

### 4. 为什么正确

所有叶子同深来自“插入时只通过分裂向上传递、根分裂才增层”；最少关键字来自“删除时向兄弟借或合并”。二者共同保证高度上界。填充率有界，则节点数 $\Omega(n/t)$，再由 $t$ 叉树的节点数与高度关系得 $h = O(\log_t n)$。

## 三、形式化与数学基础

**树高上界。** 设高度 $h$（叶子深度为 $h$，根深度 0），最小度数 $t$，关键字总数 $n$。

- 根至少 1 个关键字、至少 2 个孩子（若 $h \ge 1$）。
- 深度 1 至少 $2(t-1)$ 个关键字（每节点至少 $t-1$，至少 $2t$ 个节点？）——精确计数：深度 1 至少 $2$ 个节点，每节点至少 $t-1$ 关键字，故至少 $2(t-1)$ 个关键字。
- 深度 $i$（$1 \le i \le h-1$）至少 $2 t^{i-1}$ 个节点（每层节点数至少乘 $t$），每节点至少 $t-1$ 关键字。

故叶子深度 $h$ 时，

$$
n \ge 1 + (t-1)\sum_{i=1}^{h-1} 2 t^{i-1} = 1 + 2(t-1)\cdot\frac{t^{h-1}-1}{t-1} = 2t^{h-1} - 1.
$$

于是

$$
t^{h-1} \le \frac{n+1}{2} \quad\Rightarrow\quad h \le 1 + \log_t\frac{n+1}{2}.
$$

用阶 $m$（最少孩子数 $\lceil m/2 \rceil$）表述，常见形式为

$$
h \le \log_{\lceil m/2 \rceil}\frac{n+1}{2} + 1.
$$

**数值例子。** 页大小 16KB，关键字+指针 16B，则 $m \approx 1000$，$\lceil m/2 \rceil = 500$。$n = 10^9$ 时

$$
h \le \log_{500}\frac{10^9}{2} + 1 \approx 4.
$$

即 4 次 I/O 覆盖十亿条记录——这就是 B 树统治外存索引的原因。

**比较次数与 I/O。** 节点内二分 $O(\log m)$ 次比较，但节点常驻缓冲池后比较在内存；主要代价是沿树高的 $h$ 次页读。

**B 树与信息论下界。** $n$ 个关键字的搜索树至少高度 $\log_m n$ 量级（$m$ 路分支），B 树达到 $O(\log_t n)$，在常数因子内最优。

## 四、代码实现

```python
"""B 树定义、节点结构与查找。插入/删除见后续文档。"""
from __future__ import annotations
from typing import List, Optional, Tuple


class BTreeNode:
    def __init__(self, leaf: bool = False):
        self.keys: List[int] = []
        self.children: List["BTreeNode"] = []
        self.leaf = leaf

    def __repr__(self):
        return f"{'leaf' if self.leaf else 'int'}{self.keys}"


class BTree:
    def __init__(self, t: int = 3):
        assert t >= 2
        self.t = t          # 最小度数
        self.root = BTreeNode(leaf=True)

    # ---------- 查找 ----------
    def search(self, k: int) -> Optional[Tuple[BTreeNode, int]]:
        return self._search(self.root, k)

    def _search(self, x: BTreeNode, k: int) -> Optional[Tuple[BTreeNode, int]]:
        i = 0
        while i < len(x.keys) and k > x.keys[i]:
            i += 1
        if i < len(x.keys) and k == x.keys[i]:
            return x, i
        if x.leaf:
            return None
        return self._search(x.children[i], k)

    def height(self) -> int:
        h = 0
        x = self.root
        while not x.leaf:
            x = x.children[0]
            h += 1
        return h

    def keys_inorder(self) -> List[int]:
        out: List[int] = []

        def walk(x: BTreeNode):
            for i, k in enumerate(x.keys):
                if not x.leaf:
                    walk(x.children[i])
                out.append(k)
            if not x.leaf:
                walk(x.children[len(x.keys)])

        walk(self.root)
        return out

    def count_keys(self, x: Optional[BTreeNode] = None) -> int:
        x = self.root if x is None else x
        n = len(x.keys)
        for c in x.children:
            n += self.count_keys(c)
        return n

    # ---------- 验证不变量 ----------
    def validate(self) -> bool:
        t = self.t

        def check(x: BTreeNode, depth: int, lo, hi) -> int:
            """返回叶子深度；非法则抛错。"""
            keys = x.keys
            for i in range(len(keys) - 1):
                assert keys[i] < keys[i + 1]
            for k in keys:
                assert lo is None or k > lo
                assert hi is None or k < hi
            if x is not self.root:
                assert t - 1 <= len(keys) <= 2 * t - 1
            else:
                assert 0 < len(keys) <= 2 * t - 1
            if x.leaf:
                return depth
            assert len(x.children) == len(keys) + 1
            depths = set()
            for i, c in enumerate(x.children):
                clo = keys[i - 1] if i > 0 else lo
                chi = keys[i] if i < len(keys) else hi
                depths.add(check(c, depth + 1, clo, chi))
            assert len(depths) == 1
            return depths.pop()

        check(self.root, 0, None, None)
        return True


if __name__ == "__main__":
    # 构造一棵合法的 t=2（即 2-3-4 树风格）B 树：手动建叶与根
    # root: [6], children: leaf[2,4], leaf[8,10]
    bt = BTree(t=2)
    left = BTreeNode(leaf=True)
    left.keys = [2, 4]
    right = BTreeNode(leaf=True)
    right.keys = [8, 10]
    bt.root.keys = [6]
    bt.root.children = [left, right]
    bt.root.leaf = False

    assert bt.validate()
    assert bt.height() == 1
    assert bt.search(4)[0].keys == [2, 4]
    assert bt.search(5) is None
    assert bt.keys_inorder() == [2, 4, 6, 8, 10]
    assert bt.count_keys() == 5

    # 高度界数值验证：t=2, n 个关键字，h <= 1 + log_t((n+1)/2)
    import math
    n = 5
    h = bt.height()
    bound = 1 + math.log((n + 1) / 2, 2)
    assert h <= bound + 1e-9
    print("B树定义与高度分析：全部用例通过")
```

## 五、与其他技术对比

| 结构 | 分支 | 高度 | 节点利用率 | 适合 |
|------|------|------|------------|------|
| AVL/红黑树 | 2 | $\Theta(\log_2 n)$ | ~1 关键字/节点 | 纯内存 |
| **B 树** | $m$~$2m$ | $O(\log_m n)$ | ≥半满 | 外存、数据库 |
| B+ 树 | 同 B 树 | 同上 | 同上，数据全在叶 | 范围扫描主流 |
| B* 树 | 同上 | 更矮 | ≥2/3 满 | 写密集 |
| LSM 树 | — | 多层 | 顺序写 | 写多读少 |

取舍：**磁盘/SSD 用 B/B+ 树**；纯内存且只需点查/中序遍历，红黑树更简单。B 树内部节点可存数据（减少一层查找），B+ 树内部只做路由、叶子链表适合范围——见专篇。

## 六、常见误区

1. **混淆最小度数 $t$ 与阶 $m$。** CLRS 的 $t$：关键字 $t-1 \sim 2t-1$；阶 $m$：最多 $m$ 个孩子。关系近似 $m = 2t$，但不同教材定义不同，套公式前先对齐符号。
2. **忽略根节点特例。** 根可以少于 $t-1$ 个关键字（甚至 1 个），否则 $n$ 小的树根本建不起来。验证器必须区分根与非根。
3. **以为 B 树是二叉搜索树的推广就“近似平衡”。** B 树是**完美平衡**（叶子同深），比红黑树更严格；不要说“B 树是平衡的”了事，面试官要听“所有叶子在同一深度”。
4. **高度公式套错底数。** $h \le 1 + \log_t\frac{n+1}{2}$ 中底数是最小度数 $t$（或 $\lceil m/2 \rceil$），不是 2。用 2 会严重高估 I/O。
5. **节点内线性查找当 $O(1)$。** 理论比较次数 $O(\log t)$；工程上 $t$ 小时线性扫更缓存友好（$t \le 64$ 常用线性）。

## 七、与开源书/权威来源对应

- Bayer & McCreight, *Organization and Maintenance of Large Ordered Indices*, Acta Informatica, 1972 — B 树原始论文。
- Cormen, Leiserson, Rivest, Stein, *Introduction to Algorithms*, 3ed., 第 18 章 — 定义、查找、高度界完整推导。
- Comer, *The Ubiquitous B-Tree*, ACM Computing Surveys, 1979 — 综述经典。
- Knuth, *The Art of Computer Programming*, Vol. 3, 6.2.4 — 多路查找树历史与分析。

## 八、面试题

**1. 证明 B 树高度上界 $h \le \log_{\lceil m/2 \rceil}\frac{n+1}{2}+1$。**
参考答案：非根节点至少 $\lceil m/2 \rceil-1$ 个关键字、$\lceil m/2 \rceil$ 个孩子。记 $s=\lceil m/2 \rceil$，则深度 $i$ 至少 $s^{i-1}$ 量级节点、关键字数 $n \ge (s-1)(1+s+\cdots+s^{h-1}) = s^h-1$，解得 $h \le \log_s(n+1)$，再按 CLRS 的 $t$ 记号精化为题中形式。

**2. 为什么数据库索引用 B+ 树而不是红黑树？**
参考答案：I/O 次数正比树高。红黑树高 $\Theta(\log_2 n)$，$10^9$ 约 30 层；B+ 树分支上百，高 3~4。且 B+ 树节点对齐页，叶子链表利于范围扫描与预读。

**3. B 树最小度数 $t$ 的含义？节点关键字数范围？**
参考答案：$t$ 使每个非根节点关键字数 $\in[t-1, 2t-1]$，孩子数 $\in[t, 2t]$。$t=2$ 时即 2-3-4 树。

**4. 给定页 8KB、指针 8B、关键字 16B，估算树高。**
参考答案：每节点约 $8192/24 \approx 340$ 个关键字，最少孩子约 170。$n=10^8$ 时 $h \le \log_{170}(n/2)+1 \approx 3$。

## 九、演进与趋势

**B+ 树** 成为关系数据库与文件系统主流（InnoDB、PostgreSQL、SQLite、NTFS、ext4）。**B\* 树** 强制 2/3 填充、延迟分裂，减少空间浪费。**Blink 树 / Bε 树** 面向并发与缓存。**写优化 LSM 树** 与 B 树在写放大、读放大之间权衡，成为 RocksDB 等的选择。

**现代硬件**：NVMe SSD 与 NVRAM 让“大节点、少层级”更划算；B 树节点从 4KB 涨到 16KB/64KB。**并发 B 树**（Bw-tree、Masstree、ART）融合 latch-free、前缀压缩。**教学与面试**中 B 树高度界仍是外存算法的入门必修。

## 十、小结

B 树用**多关键字节点 + 最少半满 + 叶子同深**三条不变量，把查找 I/O 压到 $O(\log_t n)$，高度界 $h \le \log_{\lceil m/2 \rceil}\frac{n+1}{2}+1$ 是外存索引的理论基石。理解定义中的“阶/最小度数”与填充下界，才能继续学好插入分裂、删除合并与 B+ 树范围查询。
