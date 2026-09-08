# B加树B+树与范围查询

> 对应 Sedgewick《Algorithms》。

## 一、背景与挑战
数据库索引大量使用 B+ 树：所有记录存叶子，叶子间用链表串起，使范围扫描只需顺序读叶子，无需中序回溯。

## 二、核心原理
内部节点只存「分隔键 + 子指针」，不存真实数据；叶子存全部记录并彼此链表相连。查找沿内部节点下降，范围查询在叶子链表上顺序遍历。

## 三、形式化与数学基础
点查找 $O(\log_t n)$；范围 $[a,b]$ 查询为 $O(\log_t n + |结果|)$，叶子链表使顺序读连续、缓存友好。分支因子大，树高通常 3-4 层。

## 四、代码实现
```python
class BPlusLeaf:
    def __init__(self):
        self.keys = []
        self.values = []
        self.next = None
def range_query(leaf_head, a, b):
    cur = leaf_head
    while cur and cur.keys and cur.keys[-1] < a:
        cur = cur.next
    res = []
    while cur:
        for k, v in zip(cur.keys, cur.values):
            if a <= k <= b:
                res.append((k, v))
        if cur.keys[-1] > b:
            break
        cur = cur.next
    return res
```

## 五、与其他技术对比
相比 B 树（数据在内部节点），B+ 树分支因子更大、范围查询更快，但点查找需到叶子。现代关系型数据库几乎都用 B+ 树。

## 六、常见误区
以为内部节点存数据：B+ 树内部仅索引。范围查询忘记用叶子链表导致退化成多次点查。

## 七、与开源书/权威来源对应
Sedgewick《Algorithms》外部搜索树章节；数据库系统实现教材（如 Gray）。

## 八、面试题
B+ 树与 B 树的核心区别？为何数据库选 B+ 树？

## 九、演进与趋势
LSM 树、缓存友好的 B+ 树变体（如 Bw-Tree）应对 SSD 与多核。

## 十、小结
B+ 树把数据全部放叶子并以链表相连，范围查询 $O(\log n + 结果)$，是数据库索引事实标准。
