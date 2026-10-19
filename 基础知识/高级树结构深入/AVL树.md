# AVL树

> 对应 Adelson-Velsky & Landis《An algorithm for the organization of information》(1962)；CLRS《Introduction to Algorithms》第 13 章导论部分；Sedgewick《Algorithms》第 3 章平衡查找树。

## 一、背景与挑战

二叉搜索树（BST）的查找、插入、删除复杂度都正比于树高。若关键码按有序序列依次插入，普通 BST 会退化成一条链表，单次操作从 $O(\log n)$ 恶化到 $O(n)$——在线段树式的静态数据上这尚可接受，但作为动态字典（符号表、内存索引、路由表）就会成为系统瓶颈。工程上需要一种「自平衡」结构：不论插入顺序如何，都能把高度压到对数级。

AVL 树是最早的自平衡二叉搜索树（1962 年由 Adelson-Velsky 与 Landis 提出，也是「算法」一词最早出现在论文标题中的著名案例之一）。它的约束非常严格：任意结点的左右子树高度差（平衡因子）绝对值不超过 1。这个不变量换来的是**严格**的 $O(\log n)$ 高度上界，查找路径比红黑树更短，因此在读多写少的场景（如语言运行时的只读符号表、内存中只读字典、部分数据库内存索引）表现优异。

在面试与竞赛中，AVL 树是「手写平衡树」的经典入门题：它比红黑树情形少（只需四种旋转模式），比替罪羊树更直观（局部修复而非整树重建），适合考察对旋转、高度维护、递归回溯修复这些基本功的掌握。理解 AVL 也是理解红黑树、Treap、伸展树等后续结构的必要台阶。

## 二、核心原理

**不变量。** 对每个结点 $x$，定义平衡因子 $bf(x) = h(x.left) - h(x.right)$，其中空树高度为 0、单结点高度为 1。AVL 要求 $bf(x) \in \{-1, 0, 1\}$。等价地：左右子树高度差不超过 1。注意这是**对每一个结点**都成立的局部约束，不是只对根成立。

**插入后的修复。** 新结点总是作为叶子插入，插入后只有从该叶子到根的路径上，结点的平衡因子可能变成 $\pm 2$。设离插入点最近的失衡结点为 $x$，则失衡只可能有四种形态，由「哪一侧过高」和「过高侧的孩子在哪一侧」决定：

1. **LL 型**：$x$ 的左孩子 $y$ 的左子树过高 → 对 $x$ 右旋一次。
2. **RR 型**：$x$ 的右孩子 $y$ 的右子树过高 → 对 $x$ 左旋一次。
3. **LR 型**：$x$ 的左孩子 $y$ 的右子树过高 → 先对 $y$ 左旋，再对 $x$ 右旋（双旋）。
4. **RL 型**：$x$ 的右孩子 $y$ 的左子树过高 → 先对 $y$ 右旋，再对 $x$ 左旋（双旋）。

单旋与双旋都只动常数个指针，旋转后必须**自底向上更新高度** $h(x) = 1 + \max(h(x.left), h(x.right))$。一个关键性质：对 $x$ 做一次旋转修复后，该子树的高度会恢复到插入前的值，因此修复可以立刻停止——不必继续向上调整。这是 AVL 插入只涉及「一次单旋或一次双旋」的原因，也是它与红黑树「最坏三次旋转」的对比点。

**删除后的修复。** 删除一个叶子或单孩子结点后，高度可能下降，失衡可能沿路径向上传播，最坏需要 $O(\log n)$ 次旋转。实践中通常递归删除后逐层检查平衡因子，失衡则按上述四种情形旋转，然后继续向上——因为删除后子树高度可能变矮，不能像插入那样「旋完即止」。

**边界条件。** 空树、单结点树永远平衡；插入到空树时直接建根；旋转函数必须同时正确处理 `None` 子树并更新高度；平衡因子用高度现算比单独维护更不易出错。

## 三、形式化与数学基础

设 $N(h)$ 为高度为 $h$ 的 AVL 树最少含有的结点数。根的两棵子树中，一棵高度为 $h-1$，另一棵高度至少为 $h-2$（由平衡因子约束），故

$$N(h) = N(h-1) + N(h-2) + 1,\quad N(0)=0,\ N(1)=1.$$

这与 Fibonacci 递推同型。令 $N(h)+1 = F(h+2)$，由 $F(k) \approx \varphi^k / \sqrt{5}$（$\varphi = \frac{1+\sqrt{5}}{2} \approx 1.618$）得

$$n \ge N(h) \approx \frac{\varphi^{h+2}}{\sqrt{5}} - 1 \implies h \le \log_\varphi(\sqrt{5}(n+1)) - 2 = O(\log n).$$

更常用的形式是 $h < 1.4405 \log_2(n+2) - 0.3277$，比理想完全二叉树的 $\log_2 n$ 多约 44% 的高度，但严格有界。对比红黑树的 $h \le 2\log_2(n+1)$，AVL 更矮，故平均查找更短。

**旋转正确性。** 右旋（对 $y$）把 $y.left$ 提为子树根，保持中序序列不变：设 $x = y.left$，则中序为 $\text{in}(x.left)\ x\ \text{in}(x.right)\ y\ \text{in}(y.right)$，旋转后仍为同一序列。二叉搜索性质因此保持。高度更新方程如上，旋转后 $x$、$y$ 的高度可由子结点高度 $O(1)$ 算出。

**插入修复的均摊代价。** 每次插入至多一次单旋或一次双旋（双旋可看作两次单旋），故插入的旋转次数为 $O(1)$，总时间由下降查找路径决定，为 $O(\log n)$。

## 四、代码实现

完整可运行的 AVL 插入（含四种旋转与高度维护），并附带中序遍历与查找：

```python
class AVLNode:
    __slots__ = ("key", "left", "right", "h")

    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None
        self.h = 1  # 叶结点高度为 1


def _h(node):
    return node.h if node else 0


def _bf(node):
    return _h(node.left) - _h(node.right)


def _update(node):
    node.h = 1 + max(_h(node.left), _h(node.right))
    return node


def rotate_right(y):
    """LL 型：对 y 右旋，返回新子树根。"""
    x = y.left
    y.left = x.right
    x.right = y
    _update(y)
    _update(x)
    return x


def rotate_left(x):
    """RR 型：对 x 左旋，返回新子树根。"""
    y = x.right
    x.right = y.left
    y.left = x
    _update(x)
    _update(y)
    return y


def rebalance(node):
    """按平衡因子选择 LL/RR/LR/RL 四种修复。"""
    _update(node)
    bf = _bf(node)
    if bf > 1:  # 左侧过高
        if _bf(node.left) < 0:  # LR
            node.left = rotate_left(node.left)
        return rotate_right(node)  # LL
    if bf < -1:  # 右侧过高
        if _bf(node.right) > 0:  # RL
            node.right = rotate_right(node.right)
        return rotate_left(node)  # RR
    return node


def insert(node, key):
    if node is None:
        return AVLNode(key)
    if key < node.key:
        node.left = insert(node.left, key)
    elif key > node.key:
        node.right = insert(node.right, key)
    else:
        return node  # 不允许重复键
    return rebalance(node)


def inorder(node, out=None):
    if out is None:
        out = []
    if node:
        inorder(node.left, out)
        out.append(node.key)
        inorder(node.right, out)
    return out


def search(node, key):
    while node:
        if key == node.key:
            return True
        node = node.left if key < node.key else node.right
    return False


if __name__ == "__main__":
    root = None
    for k in [9, 5, 10, 0, 6, 11, -1, 1, 2]:
        root = insert(root, k)
    print(inorder(root))          # [-1, 0, 1, 2, 5, 6, 9, 10, 11]
    print(search(root, 6), search(root, 7))  # True False
    print(root.h)                 # 高度应保持很小
```

有序插入 `[1..1000]` 后树高约为 $1.44\log_2 1000 \approx 14$，远小于退化链的 1000，可自行验证。

## 五、与其他技术对比

| 结构 | 平衡方式 | 查找 | 插入/删除 | 适用场景 |
|------|----------|------|-----------|----------|
| AVL 树 | 严格平衡因子 $|bf|\le 1$ | 最优（树最矮） | 旋转较多（删除可能多层） | 读多写少、内存字典 |
| 红黑树 | 黑高近似平衡 | 略慢于 AVL | 旋转少、常数好 | 通用有序 map（Java TreeMap、C++ std::map） |
| 跳表 | 概率分层 | 期望 $O(\log n)$ | 实现极简、易并发 | Redis zset、并发索引 |
| B+ 树 | 多路平衡 | 依赖缓存/页 | 磁盘 I/O 友好 | 数据库索引、文件系统 |
| 替罪羊树 | 权重平衡 + 整树重建 | $O(\log n)$ 均摊 | 无旋转、实现简单 | 竞赛、实现成本敏感 |

取舍要点：AVL 用更严格的平衡换取更短查找路径；若写操作占比高，红黑树或跳表通常更合适。内存非常紧时 AVL 每结点存高度（可压缩为 2 bit 平衡因子）也优于跳表的多层指针数组。

## 六、常见误区

1. **旋转后忘记更新高度。** 高度是递归自底向上维护的，若旋转函数不 `_update`，后续平衡因子全错，树会静默失衡。后果是查找仍可能正确（中序没变），但复杂度退化，且很难调试。
2. **平衡因子符号搞反。** 把 $h(right)-h(left)$ 与 $h(left)-h(right)$ 混用，会导致 LL 判成 RR，插入有序序列直接崩成链表。统一约定并用单测覆盖四种情形。
3. **插入后认为「必须一直旋到根」。** AVL 插入修复一次旋转即恢复子树高度，可以停止；删除才需要向上传播。多写不必要的旋转会增加常数并引入 bug。
4. **双旋写成两次独立单旋却漏了中间结点的高度更新。** LR/RL 必须先对孩子旋转、再对失衡结点旋转，顺序反了或漏更新都会破坏平衡因子。
5. **用「左右子树结点数差」当平衡因子。** AVL 约束的是**高度差**不是规模差；规模平衡是替罪羊树/权重平衡树的概念，两者不可混用。

## 七、与开源书/权威来源对应

- Adelson-Velsky, G. M., & Landis, E. M. (1962). *An algorithm for the organization of information*. Soviet Mathematics Doklady.
- Cormen et al., *Introduction to Algorithms* (CLRS), 3rd/4th ed., Ch. 13（红黑树前的平衡树背景）与二叉搜索树章节。
- Sedgewick & Wayne, *Algorithms*, 4th ed., §3.2（AVL 与红黑树对比、旋转图解）。
- GitHub：`CyC2018/CS-Notes` 数据结构篇、`TheAlgorithms/Python` 中的 AVL 实现可作对照。

## 八、面试题

**1. 手写 AVL 插入，覆盖 LL/RR/LR/RL 四种旋转。**
参考答案：先递归插入，再自底向上更新高度；若 $bf>1$ 则看左孩子 $bf$ 决定 LL（右旋）或 LR（先左旋左孩子再右旋）；$bf<-1$ 对称处理。旋转必须更新两个结点的高度，插入修复至多一次旋转即可返回。

**2. AVL 树高度上界是多少？如何证明？**
参考答案：由 $N(h)=N(h-1)+N(h-2)+1$ 与 Fibonacci 数列可得 $h \le 1.4405\log_2(n+2)$。证明思路是构造「最少结点的 AVL 树」，其两子树高度差恰为 1 且都是最少结点的 AVL 树。

**3. 为什么说 AVL 比红黑树「查找快、插入慢」？**
参考答案：AVL 更严格平衡，树高更矮（$\approx 1.44\log n$ vs $2\log n$），查找比较次数更少；但插入/删除需要的旋转次数更多、删除可能向上传播修复，写入常数更大。读多写少选 AVL，通用场景选红黑树。

**4. 能否不用递归实现 AVL 插入？**
参考答案：可以。用栈记录下降路径，插入叶子后逆序弹栈逐层 `rebalance`；插入情形在第一次旋转后即可提前结束。删除则需走完整条路径。

## 九、演进与趋势

- **权重平衡树（Weight-Balanced Tree / Bounded-Balance Tree）**：用子树规模比替代高度差，旋转条件更统一，便于持久化与顺序统计，OCaml Map 等采用类似思想。
- **AVL 的持久化与函数式变体**：路径复制后旋转代价小，适合不可变数据结构。
- **与红黑树的工程取舍仍在演进**：Java `TreeMap`、Linux 内核 `rbtree`、C++ `std::map` 选红黑树；而一些语言运行时的符号表、只读字典仍偏好 AVL。近年也有用 **B 树/自适应基数树** 在缓存友好方向替代二叉平衡树的实践。
- **竞赛与教学**：AVL 常作为手写平衡树的第一课，后续接 Splay、Treap、FHQ Treap；工程面试更常考「手写旋转」与「高度界证明」而非完整删除。

## 十、小结

AVL 树用「任意结点高度差不超过 1」这一严格不变量，配合 LL/RR/LR/RL 四种旋转，把二叉搜索树高度稳稳压在 $1.44\log_2 n$ 以内；插入至多一次旋转、删除可能多层修复，查找路径是各类平衡树中最短之一。它在读多写少场景性能出众，也是理解红黑树、跳表、B 树等结构的必经之路。
