# 树状数组lowbit原理

> 对应 Kozen《The Design and Analysis of Algorithms》。

## 一、背景与挑战
频繁求前缀和并单点加，朴素数组 $O(n)$ 查询。树状数组（Fenwick Tree）用 lowbit 把前缀和分解为 $O(\log n)$ 段。

## 二、核心原理
`lowbit(x) = x & -x` 取 x 二进制最低位的 1 及其后零。索引 i 管理的区间是 $(i-\text{lowbit}(i),\,i]$，通过不断加减 lowbit 在 $O(\log n)$ 内跳转区间。

## 三、形式化与数学基础
前缀和：从 i 反复 `i -= lowbit(i)` 累加，步数等于 i 的二进制中 1 的个数，期望 $O(\log n)$：
$T_{\rm add}=T_{\rm prefix}=O(\log n)$，空间 $O(n)$。

## 四、代码实现
```python
class Fenwick:
    def __init__(self, n):
        self.bit = [0] * (n + 1)
    def add(self, i, delta):
        while i < len(self.bit):
            self.bit[i] += delta
            i += i & (-i)
    def prefix(self, i):
        s = 0
        while i > 0:
            s += self.bit[i]
            i -= i & (-i)
        return s
```

## 五、与其他技术对比
相比线段树，树状数组代码更短、常数更小，但只擅长前缀/单点；任意区间最值它不支持。

## 六、常见误区
树状数组下标从 1 开始，传入 0 会死循环；`x & -x` 依赖补码表示，Python 整数同样适用。

## 七、与开源书/权威来源对应
Kozen《The Design and Analysis of Algorithms》前缀结构；Fenwick 1989 原始论文。

## 八、面试题
解释 lowbit 的作用；为什么树状数组是 1-indexed？

## 九、演进与趋势
扩展到区间加/区间求和（两个 BIT）、二维 BIT 与可持久化 BIT。

## 十、小结
树状数组用 lowbit 把前缀和拆成 $O(\log n)$ 段，是前缀统计最简洁高效的结构。
