# 标准Trie树的插入与查询

> 对应 Sedgewick《Algorithms》。

## 一、背景与挑战
Trie（前缀树）用边表示字符，把一组字符串按前缀共享存储，使「前缀匹配」「按字典序遍历」变得高效。朴素哈希/平衡树无法高效做前缀查询。

## 二、核心原理
从根出发，沿字符串每个字符走对应子节点；不存在则新建。插入与查询时间均正比于字符串长度 $m$，与字符串总数无关。

## 三、形式化与数学基础
设字符集大小为 $\Sigma$，单词长 $m$。单操作复杂度：
$T=O(m)$，空间最坏 $O(N\cdot m)$（$N$ 为单词数）。节点数上界为所有单词字符总数。

## 四、代码实现
```python
class Trie:
    def __init__(self):
        self.children = {}
        self.is_end = False
    def insert(self, w):
        node = self
        for c in w:
            node = node.children.setdefault(c, Trie())
        node.is_end = True
    def search(self, w):
        node = self
        for c in w:
            if c not in node.children:
                return False
            node = node.children[c]
        return node.is_end
```

## 五、与其他技术对比
相比哈希表，Trie 支持前缀查询与自动补全；相比平衡二叉搜索树，Trie 不比较整串。代价是空间（可用压缩 Trie 缓解）。

## 六、常见误区
误以为 Trie 查询复杂度含 $\log$ 因子：实际为 $O(m)$ 与数量无关。另一误区是把字典序遍历当成需排序，其实 DFS 即得有序序列。

## 七、与开源书/权威来源对应
Sedgewick《Algorithms》第 5 章 R-way Trie；CLRS 在「基数树」相关讨论提及。

## 八、面试题
统计 Trie 中某个前缀的单词数；或实现 Trie 的 DFS 字典序遍历。

## 九、演进与趋势
工程上常用压缩前缀树（Radix Tree）、双数组 Trie 以降低空间与提升缓存命中。

## 十、小结
标准 Trie 以 $O(m)$ 完成插入与精确查询，核心是按字符边共享前缀，是前缀类问题的基础结构。
