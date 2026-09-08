# B树插入分裂

> 对应 CLRS。

## 一、背景与挑战
B 树插入必须保持节点关键字数 $\le 2t-1$。满节点插入会越界，需在插入前「预分裂」或插入后向上分裂。

## 二、核心原理
CLRS 采用「向下搜索时若遇满节点先分裂」的提前分裂策略：把中间关键字提升到父，左右 halves 成两个子。根满则建新根，树高 +1。

## 三、形式化与数学基础
每次分裂 $O(t)$，沿路径最多 $O(h)$ 次分裂。插入总复杂度：
$T=O(t\log_t n)$（含磁盘读写的 I/O 次数 $O(h)$）。

## 四、代码实现
```python
def split_child(parent, i, t):
    full = parent.children[i]
    right = BTreeNode(full.leaf)
    mid = t - 1
    right.keys = full.keys[mid + 1:]
    if not full.leaf:
        right.children = full.children[mid + 1:]
    parent.keys.insert(i, full.keys[mid])
    parent.children.insert(i + 1, right)
    full.keys = full.keys[:mid]
    full.children = full.children[:mid + 1]
def insert_nonfull(node, k, t):
    i = len(node.keys) - 1
    if node.leaf:
        node.keys.append(None)
        while i >= 0 and k < node.keys[i]:
            node.keys[i + 1] = node.keys[i]
            i -= 1
        node.keys[i + 1] = k
    else:
        while i >= 0 and k < node.keys[i]:
            i -= 1
        i += 1
        if len(node.children[i].keys) == 2 * t - 1:
            split_child(node, i, t)
            if k > node.keys[i]:
                i += 1
        insert_nonfull(node.children[i], k, t)
```

## 五、与其他技术对比
提前分裂保证插入路径上节点总有空位，避免回溯；而「插入后分裂」需自底向上回退。两者等价。

## 六、常见误区
忘记根满时建新根会使树高不增加；分裂时漏移动对应 children 导致子树丢失。

## 七、与开源书/权威来源对应
CLRS 第 18.2 节插入与分裂；Cormen 等给出完整伪代码。

## 八、面试题
实现 B 树插入；为何要提前分裂？

## 九、演进与趋势
B+ 树插入只在叶子存数据、分裂策略略有不同；LSM 树以写缓冲替代原地更新。

## 十、小结
B 树插入通过预分裂维持节点不溢出，沿路径 $O(\log_t n)$ 完成，根分裂使树高 +1。
