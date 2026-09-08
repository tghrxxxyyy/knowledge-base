# 后缀数组与高度数组LCP

> 对应 CLRS 与 Sedgewick《Algorithms》。

## 一、背景与挑战
仅有后缀数组难以直接回答「最长公共前缀」类问题。高度数组 $lcp[i]$ 表示排在第 $i$ 与第 $i-1$ 的后缀之间的最长公共前缀长度，是后缀数组最重要的辅助结构。

## 二、核心原理
Kasai 算法利用「相邻后缀的 LCP 至少比上一对少 1」的性质：若后缀 $i$ 在 SA 中排第 $r$，则与上一后缀的 LCP 不会小于上一轮 $h-1$，从而线性扫描即可。

## 三、形式化与数学基础
令 $lcp[i]=|{\rm LCP}(SA[i],SA[i-1])|$，$i\ge1$。Kasai 维护匹配长度 $h$，每次处理原串位置 $i$ 时：
若 $rank[i]>0$，从 $h$ 开始向后匹配，$h\leftarrow\max(0,h-1)$。总复杂度：
$T(n)=O(n)$。

## 四、代码实现
```python
def build_lcp(s, sa):
    n = len(s)
    rank = [0] * n
    for i in range(n):
        rank[sa[i]] = i
    lcp = [0] * n
    h = 0
    for i in range(n):
        if rank[i] > 0:
            j = sa[rank[i] - 1]
            while i + h < n and j + h < n and s[i + h] == s[j + h]:
                h += 1
            lcp[rank[i]] = h
            if h > 0:
                h -= 1
        else:
            h = 0
    return lcp
```

## 五、与其他技术对比
Kasai 是 $O(n)$ 且只需 SA；相比用 RMQ 在高度数组上求任意两后缀 LCP（再 $O(1)$ 查询），Kasai 先构造、再配笛卡尔树/稀疏表即可。

## 六、常见误区
误以为 $lcp[i]$ 是后缀 $i$ 与前一个原串后缀的比较：它比较的是 SA 中相邻两个后缀，下标是排名而非原位置。另一误区是忘记 $h$ 递减，导致退化为 $O(n^2)$。

## 七、与开源书/权威来源对应
CLRS 习题中讨论后缀数组与 RMQ 的归约；Sedgewick《Algorithms》给出后缀数组应用实例。

## 八、面试题
用 $lcp$ 数组 + RMQ 在 $O(1)$ 求任意两后缀 LCP；或证明 Kasai 是线性的。

## 九、演进与趋势
高度数组配合稀疏表/笛卡尔树是后缀数组应用的标配，广泛用于重复子串、子串出现次数统计。

## 十、小结
高度数组 $lcp$ 以 $O(n)$ 由 SA 构造，是解锁后缀数组区间查询能力的关键。
