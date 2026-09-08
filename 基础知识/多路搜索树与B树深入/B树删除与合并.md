# B树删除与合并

> 对应 Cormen 等。

## 一、背景与挑战
删除可能使节点关键字数低于下界 $t-1$。需要借关键字（向兄弟旋转）或合并节点，并保证整树平衡。

## 二、核心原理
删除前保证「当前节点与将下降的子节点均非最小填充」。若子节点最小，则向其富兄弟借一个（父关键字下沉），或与该兄弟及父关键字合并成一个节点。

## 三、形式化与数学基础
每次合并/旋转 $O(t)$，路径长 $O(h)$。删除复杂度：
$T=O(t\log_t n)$。合并可能使根退化为单关键字并降树高。

## 四、代码实现
```python
def merge_children(parent, i, t):
    left, right = parent.children[i], parent.children[i + 1]
    left.keys.append(parent.keys.pop(i))
    left.keys.extend(right.keys)
    if not left.leaf:
        left.children.extend(right.children)
    parent.children.pop(i + 1)
def delete_from_leaf(node, k):
    node.keys.remove(k)
def borrow_or_merge(parent, i, t):
    if i > 0 and len(parent.children[i - 1].keys) >= t:
        # 向左兄弟借
        left = parent.children[i - 1]
        node = parent.children[i]
        node.keys.insert(0, parent.keys[i - 1])
        parent.keys[i - 1] = left.keys.pop()
        if not node.leaf:
            node.children.insert(0, left.children.pop())
    elif i < len(parent.children) - 1 and len(parent.children[i + 1].keys) >= t:
        right = parent.children[i + 1]
        node = parent.children[i]
        node.keys.append(parent.keys[i])
        parent.keys[i] = right.keys.pop(0)
        if not node.leaf:
            node.children.append(right.children.pop(0))
    else:
        if i > 0:
            merge_children(parent, i - 1, t)
        else:
            merge_children(parent, i, t)
```

## 五、与其他技术对比
B 树删除比二叉搜索树复杂（需维持最小填充）；B+ 树删除集中在叶子，内部仅维护分隔键。

## 六、常见误区
未在下降前补满子节点，导致到底才发现不足、需回溯；合并后忘记删父的分隔键。

## 七、与开源书/权威来源对应
CLRS 第 18.3 节删除；Cormen 等详细描述借/合并情形。

## 八、面试题
实现 B 树删除；合并与借用的触发条件？

## 九、演进与趋势
写时复制（COW）B 树用于 ZFS、 btrfs，避免原地修改带来的崩溃恢复难题。

## 十、小结
B 树删除通过借关键字或合并维持下界，路径上 $O(\log_t n)$ 调整，根合并可降树高。
