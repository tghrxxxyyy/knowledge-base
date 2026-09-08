# B树定义与高度分析

> 对应 CLRS 与 Cormen 等。

## 一、背景与挑战
磁盘 I/O 以页为单位，二叉平衡树每个节点一页导致树过高、I/O 次数多。B 树让每个节点容纳多关键字，降低树高、减少磁盘访问。

## 二、核心原理
B 树是平衡多路搜索树：每个内部节点有 $t-1$ 到 $2t-1$ 个关键字（$t$ 为最小度数），所有叶子同深。关键字在节点内有序，子树划分区间。

## 三、形式化与数学基础
设高度 $h$、最小度数 $t$、关键字数 $n$。节点数下界给出：
$h\le \log_t\big((n+1)/2\big)$。每个节点一页，故一次查找最多 $O(\log_t n)$ 次磁盘 I/O。

## 四、代码实现
```python
class BTreeNode:
    def __init__(self, leaf=False):
        self.keys = []
        self.children = []
        self.leaf = leaf
def btree_search(node, k):
    i = 0
    while i < len(node.keys) and k > node.keys[i]:
        i += 1
    if i < len(node.keys) and k == node.keys[i]:
        return node, i
    if node.leaf:
        return None
    return btree_search(node.children[i], k)
```

## 五、与其他技术对比
相比 AVL/红黑树（每节点 1 关键字），B 树高更低、适合外存；相比 B+ 树，B 树数据可存内部节点。

## 六、常见误区
混淆最小度数 $t$ 与阶 $m$：常见定义 $m=2t$。叶子深度不一 violates 平衡性；关键字数越界破坏 B 树性质。

## 七、与开源书/权威来源对应
CLRS 第 18 章 B 树；Cormen 等详细推导高度与 I/O 界。

## 八、面试题
证明 B 树高度上界；给定 $t$ 与 $n$ 估算最大深度。

## 九、演进与趋势
B 树思想衍生出 B+ 树（数据库索引主流）、B* 树（更满节点）、COW B 树（文件系统）。

## 十、小结
B 树以多关键字节点压低树高，查找 I/O 次数 $O(\log_t n)$，是外存索引基础。
