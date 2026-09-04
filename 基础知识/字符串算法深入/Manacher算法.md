# Manacher算法

> 对应 Manacher《A New Linear-Time On-Line Algorithm for Finding the Smallest Initial Palindrome》(1975)。

## 一、背景与挑战
求字符串的最长回文子串 / 所有回文中心。暴力 O(n^2)，Manacher 利用对称性在 O(n) 完成。

## 二、核心原理
对字符串插入分隔符（如 `#`）统一奇偶长度；用 `d[i]` 表示以 i 为中心的最长回文半径，借助已计算中心的覆盖右边界镜像复制。

## 三、形式化 / 数学基础
设当前最右边界 R，对应中心 C。对 i，若 `i < R`，则 `d[i] >= min(d[2C-i], R-i)`，再向外扩展。总扩展次数 O(n)。

## 四、代码实现
```python
def manacher(s):
    t = '#' + '#'.join(s) + '#'
    n = len(t)
    d = [0] * n
    C = R = 0
    for i in range(n):
        if i < R:
            d[i] = min(R - i, d[2 * C - i])
        while i - d[i] - 1 >= 0 and i + d[i] + 1 < n and t[i - d[i] - 1] == t[i + d[i] + 1]:
            d[i] += 1
        if i + d[i] > R:
            R = i + d[i]
            C = i
    return max(d)
```

## 五、与其他技术对比
与中心扩展法相比，Manacher 避免重复比较；与后缀数组/回文树相比，Manacher 最轻量、易写。

## 六、常见误区
插入分隔符后下标映射错误；镜像半径取 min 时漏掉 `R-i`；边界越界。

## 七、与开源书 / 权威来源对应
- Manacher 1975
- 代码随想录: https://github.com/youngyangyang04/leetcode-master

## 八、面试题
「最长回文子串」（LeetCode 5）；「回文子串个数」。

## 九、演进与趋势
回文自动机（Eertree）可在线求所有回文及出现次数；与 Manacher 互补。

## 十、小结
Manacher 用对称性与覆盖区间把回文半径计算降到线性，分隔符技巧统一奇偶。
