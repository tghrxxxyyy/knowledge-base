# 双数组Trie Double-Array Trie

> 对应 TheAlgorithms/Python。

## 一、背景与挑战
标准 Trie 用指针/字典存孩子，内存碎片大、缓存差。Double-Array Trie（DAT）用两个并行数组 `BASE` 与 `CHECK` 表示转移，极致压缩且查询极快。

## 二、核心原理
对状态 $s$ 与字符 $c$，子状态存于 `BASE[s] + c`，且 `CHECK[BASE[s]+c] == s` 表示合法转移。插入时为一个节点的所有子字符寻找连续的 `BASE` 槽位。

## 三、形式化与数学基础
状态数 $S$，字符集 $\Sigma$。查询：
$T=O(m)$（数组随机访问）。空间约 $O(S\cdot \Sigma)$ 经紧凑分配可接近 $O(S)$。

## 四、代码实现
```python
class DoubleArrayTrie:
    def __init__(self, sigma):
        self.sigma = sigma
        self.base = [0]
        self.check = [-1]
    def _ensure(self, idx):
        while len(self.base) <= idx:
            self.base.append(0)
            self.check.append(-1)
    def add_trans(self, s, c, t):
        self._ensure(t)
        self.base[s] = t - self.sigma.index(c)
        self.check[t] = s
    def go(self, s, c):
        t = self.base[s] + self.sigma.index(c)
        if t < len(self.check) and self.check[t] == s:
            return t
        return -1
```

## 五、与其他技术对比
相比指针 Trie，DAT 省内存、缓存友好、易序列化；代价是插入需重排、实现复杂。Hanzi 分词（如 Tire 树词典）常用 DAT。

## 六、常见误区
忽略 `CHECK` 一致性检查会误走到非法状态；插入重排时未更新受影响子树导致失效。

## 七、与开源书/权威来源对应
TheAlgorithms/Python 中有 Trie 系列实现；Aoe 等人提出基于 DAT 的分词系统。

## 八、面试题
解释 BASE/CHECK 的语义；如何在 DAT 上做前缀枚举？

## 九、演进与趋势
DAT 与 AC 自动机结合（ACDAT）用于高速多模式匹配，常见于中文分词引擎。

## 十、小结
双数组 Trie 用 BASE/CHECK 以紧凑数组表达状态转移，兼顾速度与空间，是工业词典索引常用结构。
