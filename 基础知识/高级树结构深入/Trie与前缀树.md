# Trie与前缀树

> 对应 《算法导论》相关字符串结构章节与 Fredkin 1960（Trie 概念）。

## 一、背景与挑战
前缀树以字符为边组织字符串集合，支持前缀查询、异或最大/最小匹配、字典序遍历，广泛用于自动补全与路由。

## 二、核心原理
每个结点代表一个前缀，边为字符，终止标记表示完整词。空间换时间，插入/查找 O(长度)。

## 三、形式化 / 数学基础
若字符集大小 σ，最坏空间 $O(\sigma \cdot L)$（L 为总字符数）。「异或最大值」可在 01-Trie 上按位贪心。

## 四、代码实现
```python
class Trie:
    def __init__(self):
        self.children = {}
        self.is_end = False
    def insert(self, s):
        node = self
        for c in s:
            node = node.children.setdefault(c, Trie())
        node.is_end = True
    def starts_with(self, p):
        node = self
        for c in p:
            if c not in node.children:
                return False
            node = node.children[c]
        return True
```

## 五、与其他技术对比
与哈希集合相比，Trie 支持前缀与字典序操作；与后缀数组相比，Trie 更擅长「前缀」而非「任意子串」。

## 六、常见误区
终止标记遗漏导致前缀误判为单词；内存随字符集膨胀（可用压缩/双数组 Trie）。

## 七、与开源书 / 权威来源对应
- 代码随想录: https://github.com/youngyangyang04/leetcode-master
- Sedgewick《Algorithms》Trie 章节

## 八、面试题
「实现 Trie」；「单词搜索 II」（Trie + 回溯）；「最大异或对」（01-Trie）。

## 九、演进与趋势
压缩 Trie（ Patricia/Radix Tree）；后缀 Trie 与后缀数组关系。

## 十、小结
Trie 以前缀共享字符节省重复比较，是前缀类与异或匹配问题的标准结构。
