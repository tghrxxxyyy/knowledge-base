# B树删除与合并

> 对应 CLRS《Introduction to Algorithms》第 18.3 节 B-TREE-DELETE（借位与合并），以及 Bayer & McCreight (1972)、Comer (1979) 关于节点下溢处理的讨论。

## 一、背景与挑战

B 树删除比插入复杂，因为删除可能让节点关键字数跌破下界 $t-1$（下溢），而插入只需处理上溢。朴素做法“直接从叶子抹掉关键字”会破坏最少填充不变量，进而可能让树高上界失效——节点稀疏后，同样 $n$ 个关键字的树会变高，I/O 性能退化。

正确做法是三种局部调整：

1. **借位（redistribute）**：从关键字多的兄弟借一个，经父节点中转，保持有序。
2. **合并（merge）**：与兄弟连同父节点分隔键合并成一个节点，父少一个关键字。
3. **提前下潜（preemptive borrow/merge）**：CLRS 在递归下降时，保证“将要进入的孩子至少有 $t$ 个关键字”（而非仅仅 $t-1$），这样从该子树删除 1 个关键字后仍合法，避免回溯。

工程上，数据库的页回收、索引填充率下降、`DELETE` 后碎片整理，都与 B 树删除直接相关。InnoDB 的 `fillfactor`、页合并阈值、PostgreSQL 的 `btree_page` 重组，都是删除合并策略的工业参数。面试中“删除如何保持平衡”“为何删除比插入难”是区分度很高的题。

## 二、核心原理

### 1. 删除的分类讨论（设要删关键字 $k$ 在节点 $x$）

**情形 A：$k$ 在内部节点 $x$。**

- **A1：$k$ 左侧孩子 $y$ 至少有 $t$ 个关键字**：找 $y$ 中 $k$ 的前驱 $k'$（$y$ 子树中最大关键字），用 $k'$ 替换 $k$，递归删 $k'$。
- **A2：右侧孩子 $z$ 至少 $t$ 个关键字**：对称，找后继替换再删。
- **A3：$y,z$ 都恰好 $t-1$ 个关键字**：把 $k$ 与 $y,z$ 合并成一个节点（$y$ 含 $k$ 再接 $z$ 的关键字），然后在合并节点中递归删 $k$。父节点失去分隔键 $k$，可能下溢，继续向上处理。

**情形 B：$k$ 在叶子 $x$。** 直接删除。若 $x$ 关键字数变为 $< t-1$，触发下溢修复。

### 2. 下溢修复（关键不变量）

删除后节点 $x$ 只有 $t-2$ 个关键字：

- **B1：左兄弟有 $\ge t$ 个关键字**：经父旋转——父的分隔键下移到 $x$，左兄弟最大关键字上提到父，$x$ 多一个关键字。
- **B2：右兄弟有 $\ge t$ 个关键字**：对称。
- **B3：左右兄弟都只有 $t-1$ 个**：选一个兄弟合并：$x$ + 父分隔键 + 兄弟 → 新节点（$2t-1$ 个关键字，合法）。父失去一个关键字，可能继续下溢。

**CLRS 的预借/预合并**：在下降到孩子 $c$ 之前，若 $c$ 只有 $t-1$ 个关键字，先向其富兄弟借或与穷兄弟合并，保证 $c$ 进入递归时至少 $t$ 个关键字，删除 1 个后仍 $\ge t-1$。这与插入的预分裂对称，**避免向上回溯**。

### 3. 边界条件

- 删除后节点为空且是根：树高减一，根的唯一孩子成为新根。
- 兄弟选取：左兄弟存在优先左，否则右；或统一“左右都试”。
- 关键字不存在：删除失败，树不变。
- $t=2$ 时下溢节点只有 0 个关键字，必须立即借或合并。

### 4. 为什么正确

- 借位与合并都保持“节点内有序 + 子树区间正确”。
- 合并后的节点有 $(t-1)+1+(t-1)=2t-1$ 个关键字，恰在上界内。
- 借位后 $x$ 有 $t$ 个、兄弟 $t-1$ 个（或对称），均合法。
- 预借/预合并使递归前条件“子节点至少 $t$ 个关键字”成立，删除后不会低于 $t-1$，归纳完成。

## 三、形式化与数学基础

**复杂度。** 删除沿树高 $h$ 下降，每层至多一次 $O(t)$ 的借位/合并，总

$$
T_{\text{delete}} = O(t \cdot h) = O(t \log_t n).
$$

I/O 次数 $O(\log_t n)$，与查找同阶；合并可能连锁到根，最坏全高。

**高度变化。** 仅当根只剩 0 个关键字（唯一孩子）时高度 $-1$。删除后高度仍满足

$$
h \le 1 + \log_t \frac{n+1}{2},
$$

因为最少填充保证节点数下界。

**填充率下界。** 除根外每节点 $\ge t-1$ 个关键字，填充率 $\ge \frac{t-1}{2t-1} \approx 50\%$。B* 树通过三方合并把下界提到 $2/3$。

**合并链最坏情形。** 连续删除同一路径上的关键字可能触发 $O(h)$ 次合并，每次 $O(t)$，故单次删除最坏 $O(t h)$；均摊后更少，因为合并需要先有借位/填充储备。

**与红黑树删除对比。** 红黑树删除最多 $O(\log n)$ 次旋转与重染色；B 树删除的借/合并对应“节点密度调整”，目标仍是减少外存 I/O。

**正确性归纳（CLRS）**：`B-TREE-DELETE` 保持 B 树性质。下降前使孩子关键字数 $\ge t$，删除后 $\ge t-1$；合并后新节点 $\le 2t-1$；根特判维持高度。

## 四、代码实现

```python
"""B 树删除：借位、合并、预借/预合并（CLRS 风格）。"""
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

    def search(self, k: int) -> bool:
        return self._search(self.root, k)

    def _search(self, x: BTreeNode, k: int) -> bool:
        i = 0
        while i < len(x.keys) and k > x.keys[i]:
            i += 1
        if i < len(x.keys) and k == x.keys[i]:
            return True
        if x.leaf:
            return False
        return self._search(x.children[i], k)

    def insert(self, k: int):
        t = self.t
        root = self.root
        if len(root.keys) == 2 * t - 1:
            nr = BTreeNode(leaf=False)
            nr.children = [root]
            self._split_child(nr, 0)
            self.root = nr
            self._insert_nonfull(nr, k)
        else:
            self._insert_nonfull(root, k)

    def _split_child(self, x: BTreeNode, i: int):
        t = self.t
        y = x.children[i]
        z = BTreeNode(leaf=y.leaf)
        mid = y.keys[t - 1]
        z.keys = y.keys[t:]
        y.keys = y.keys[: t - 1]
        if not y.leaf:
            z.children = y.children[t:]
            y.children = y.children[:t]
        x.children.insert(i + 1, z)
        x.keys.insert(i, mid)

    def _insert_nonfull(self, x: BTreeNode, k: int):
        t = self.t
        i = len(x.keys) - 1
        if x.leaf:
            x.keys.append(None)
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

    def delete(self, k: int) -> bool:
        ok = self._delete(self.root, k)
        if not self.root.leaf and len(self.root.keys) == 0:
            self.root = self.root.children[0]
        return ok

    def _find_key(self, x: BTreeNode, k: int) -> int:
        i = 0
        while i < len(x.keys) and k > x.keys[i]:
            i += 1
        return i

    def _delete(self, x: BTreeNode, k: int) -> bool:
        t = self.t
        i = self._find_key(x, k)
        if i < len(x.keys) and x.keys[i] == k:
            if x.leaf:
                x.keys.pop(i)
                return True
            return self._delete_internal(x, i)
        if x.leaf:
            return False
        if len(x.children[i].keys) == t - 1:
            self._fill(x, i)
            i = self._find_key(x, k)
        return self._delete(x.children[i], k)

    def _delete_internal(self, x: BTreeNode, i: int) -> bool:
        """删除内部节点 x.keys[i]（前驱 / 后继 / 合并）。"""
        k_removed = x.keys[i]
        y, z = x.children[i], x.children[i + 1]
        if len(y.keys) >= self.t:
            pred = self._max_key(y)
            self._delete(y, pred)
            x.keys[i] = pred
            return True
        if len(z.keys) >= self.t:
            succ = self._min_key(z)
            self._delete(z, succ)
            x.keys[i] = succ
            return True
        # 两孩子都恰好 t-1：合并 y + key + z
        y.keys.append(x.keys[i])
        y.keys.extend(z.keys)
        if not y.leaf:
            y.children.extend(z.children)
        x.keys.pop(i)
        x.children.pop(i + 1)
        return self._delete(y, k_removed)

    def _max_key(self, x: BTreeNode) -> int:
        while not x.leaf:
            x = x.children[-1]
        return x.keys[-1]

    def _min_key(self, x: BTreeNode) -> int:
        while not x.leaf:
            x = x.children[0]
        return x.keys[0]

    def _fill(self, x: BTreeNode, i: int):
        if i > 0 and len(x.children[i - 1].keys) >= self.t:
            self._borrow_from_prev(x, i)
        elif i < len(x.keys) and len(x.children[i + 1].keys) >= self.t:
            self._borrow_from_next(x, i)
        else:
            if i > 0:
                self._merge(x, i - 1)
            else:
                self._merge(x, i)

    def _borrow_from_prev(self, x: BTreeNode, i: int):
        child, sib = x.children[i], x.children[i - 1]
        child.keys.insert(0, x.keys[i - 1])
        x.keys[i - 1] = sib.keys.pop()
        if not child.leaf:
            child.children.insert(0, sib.children.pop())

    def _borrow_from_next(self, x: BTreeNode, i: int):
        child, sib = x.children[i], x.children[i + 1]
        child.keys.append(x.keys[i])
        x.keys[i] = sib.keys.pop(0)
        if not child.leaf:
            child.children.append(sib.children.pop(0))

    def _merge(self, x: BTreeNode, i: int):
        child, sib = x.children[i], x.children[i + 1]
        child.keys.append(x.keys[i])
        child.keys.extend(sib.keys)
        if not child.leaf:
            child.children.extend(sib.children)
        x.keys.pop(i)
        x.children.pop(i + 1)

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

    def validate(self) -> bool:
        t = self.t

        def check(x: BTreeNode, is_root: bool) -> int:
            assert all(x.keys[i] < x.keys[i + 1] for i in range(len(x.keys) - 1)), x.keys
            if not is_root:
                assert t - 1 <= len(x.keys) <= 2 * t - 1, (x.keys, t)
            else:
                assert 0 <= len(x.keys) <= 2 * t - 1, x.keys
            if x.leaf:
                return 1
            assert len(x.children) == len(x.keys) + 1
            depths = {check(c, False) for c in x.children}
            assert len(depths) == 1
            return depths.pop() + 1

        check(self.root, True)
        return True


if __name__ == "__main__":
    bt = BTree(t=2)
    for k in range(1, 21):
        bt.insert(k)
    assert bt.validate()
    for k in [5, 10, 15, 1, 20, 7, 8]:
        assert bt.delete(k)
        assert bt.validate()
    expect = [k for k in range(1, 21) if k not in {5, 10, 15, 1, 20, 7, 8}]
    assert bt.keys_inorder() == expect

    assert bt.delete(999) is False

    bt2 = BTree(t=3)
    for k in range(1, 31):
        bt2.insert(k)
    for k in range(1, 31):
        assert bt2.delete(k)
        assert bt2.validate()
    assert bt2.keys_inorder() == []

    import random
    random.seed(7)
    bt3 = BTree(t=3)
    data = list(range(1, 61))
    for k in data:
        bt3.insert(k)
    random.shuffle(data)
    for k in data[:40]:
        assert bt3.delete(k)
        assert bt3.validate()
    assert bt3.keys_inorder() == sorted(data[40:])
    print("B树删除与合并：全部用例通过")

```

## 五、与其他技术对比

| 操作 | B 树 | 红黑树 | LSM 树 |
|------|------|--------|--------|
| 删除复杂度 | $O(t\log_t n)$ | $O(\log n)$ 旋转 | 逻辑删 + compaction |
| 空间回收 | 合并/页回收 | 节点释放 | 合并 SSTable |
| 填充率 | ≥50%（B* ≥2/3） | 不适用 | 与 compaction 策略有关 |
| 范围扫描 | 叶子链表优（B+） | 中序 | 多层查找 |
| I/O | $O(\log_t n)$ | 差 | 读放大 |

取舍：**点删+范围扫用 B/B+ 树**；内存集合用红黑树/AVL；写多可 LSM。B 树删除的“借/合并”是外存版的旋转，精髓是维持密度下界。

## 六、常见误区

1. **删除后不检查下溢。** 节点关键字数可能低于 $t-1$，填充率与树高界同时失效。后果：查询变慢，后续插入更容易溢出。
2. **合并时忘带父分隔键。** 只把两兄弟拼一起，漏掉 $x.keys[i]$，搜索区间断裂。正确是 `child + parent_key + sibling`。
3. **借位方向搞反。** 从左兄弟借应该“父键下移、兄弟最大键上移”；写反会导致有序性被破坏。验证器要查节点内严格递增。
4. **内部节点删除用错前驱/后继。** 前驱是左子树最大键，不是左子树根的任意键；应沿最右路径走到底。
5. **根节点收缩遗漏。** 根关键字空但还有唯一孩子时，必须把孩子提为新根，否则树高不变、根为空壳。

## 七、与开源书/权威来源对应

- Cormen et al., *Introduction to Algorithms*, 3ed., 第 18.3 节 — `B-TREE-DELETE` 完整分情形伪代码。
- Bayer & McCreight, 1972 — 原始论文定义平衡与删除策略。
- Comer, *The Ubiquitous B-Tree*, 1979 — 变体比较。
- MySQL InnoDB `btr_cur_optimistic_delete` / PostgreSQL `_bt_delete_parent` 等源码是工业级删除/合并实现。

## 八、面试题

**1. B 树删除如何处理下溢？**
参考答案：优先从富兄弟借（父键下移、兄弟对侧键上移）；兄弟都只有 $t-1$ 个关键字时，与兄弟连同父分隔键合并。父可能继续下溢，递归向上；根空则树高减一。

**2. 为什么 CLRS 删除要“提前保证孩子至少 $t$ 个关键字”？**
参考答案：这样删除 1 个关键字后孩子仍 $\ge t-1$，无需向上回溯修复。与插入的预分裂对称，使实现只沿一条路径向下。

**3. 删除内部节点时，若左右孩子都只有 $t-1$ 个关键字怎么办？**
参考答案：把该关键字与左右孩子合并成一个新节点（共 $2t-1$ 个关键字），然后在新节点中递归删除目标键。父少一个键，可能触发向上合并。

**4. B 树删除会不会降低树高？**
参考答案：会。当根关键字数减到 0 且仅剩一个孩子时，孩子成为新根，树高减一；此时 $n$ 变小，与高度界一致。

## 九、演进与趋势

**页合并与碎片整理**：数据库在删除大量行后统计页填充率，低于阈值（如 50%）触发 merge，回收页给 free list。PostgreSQL 的 `btree_page` 重组、InnoDB 的 `fillfactor` 与此相关。

**延迟合并**：为写性能，常把合并推迟到空页过多时批处理，类似 LSM 的 compaction。**并发删除** 需要 latch coupling 与安全节点分裂/合并协议（B-link、Bw-tree）。

**与 LSM 对比的工程叙事**：删除在 B 树是即时物理删（或标记 + 真空），在 LSM 是墓碑（tombstone）+ 合并时过滤。理解 B 树删除有助于评估两种引擎的写放大与空间放大。

## 十、小结

B 树删除的完整图景是：**内部键用前驱/后继下沉，叶子删除后借位或合并修复下溢，根特判收缩树高**。借位保持密度，合并保持平衡，预借/预合并让操作单向下潜。掌握这套分情形，就掌握了外存有序索引维护不变量的核心手段。
