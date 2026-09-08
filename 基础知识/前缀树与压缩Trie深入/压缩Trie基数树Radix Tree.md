# 压缩Trie基数树Radix Tree

> 对应 Sedgewick《Algorithms》。

## 一、背景与挑战
标准 Trie 在稀疏字符集下产生大量「单链」内部节点，浪费空间。压缩 Trie（Patricia / Radix Tree）把只有一个子节点的链合并为一条边，显著减少节点。

## 二、核心原理
把连续无分支的路径压缩成一个标签（字符串片段）。查询时沿边标签做前缀匹配，可能落在边中间，需要分裂边。

## 三、形式化与数学基础
设叶子（键）数为 $k$，压缩后节点数为 $O(k)$，远小于标准 Trie。单次操作复杂度：
$T=O(m)$，其中 $m$ 为键长，比较按边标签分块进行。

## 四、代码实现
```python
class RadixNode:
    def __init__(self, label=""):
        self.label = label
        self.children = {}
        self.is_end = False
class RadixTree:
    def __init__(self):
        self.root = RadixNode()
    def insert(self, w):
        self._insert(self.root, w)
    def _insert(self, node, w):
        if not w:
            node.is_end = True
            return
        for ch in list(node.children):
            child = node.children[ch]
            pre = os.path.commonprefix([child.label, w])
            if pre:
                if pre != child.label:
                    split = RadixNode(pre)
                    node.children[ch] = split
                    child.label = child.label[len(pre):]
                    split.children[child.label[0]] = child
                self._insert(child if pre == child.label else node, w[len(pre):])
                return
        new = RadixNode(w)
        new.is_end = True
        node.children[w[0]] = new
```

## 五、与其他技术对比
相比标准 Trie 节点更少、缓存更友好；相比哈希表仍保留前缀结构。Linux 内核路由表、Redis 的 key 空间通知均使用 Radix Tree。

## 六、常见误区
误以为压缩后查询更快到对数级：仍是 $O(m)$，但常数因边合并而下降。忽略边中间分裂会破坏结构正确性。

## 七、与开源书/权威来源对应
Sedgewick《Algorithms》讲 Patricia Trie；CyC2018/CS-Notes 在字符串章节提及。

## 八、面试题
实现 Radix Tree 的插入与分裂；求最长公共前缀集合。

## 九、演进与趋势
ART（Adaptive Radix Tree）用节点类型自适应度数，是现代内存索引研究热点。

## 十、小结
压缩 Trie 将无分支链合并，节点数降到 $O(k)$，在保留前缀能力的同时大幅节省空间。
