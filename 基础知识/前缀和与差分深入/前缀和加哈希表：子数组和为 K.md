# 前缀和 + 哈希表（子数组和为 K）

> 对应 youngyangyang04/leetcode-master 前缀和（和为 K 的子数组）与 CyC2018/CS-Notes。

## 一、背景与挑战
统计和为 k 的连续子数组个数。枚举两端 $O(n^2)$；前缀和 + 哈希表 $O(n)$。

## 二、核心原理
`sum(i+1,j) = S[j]-S[i] = k` ⟺ `S[i] = S[j]-k`。遍历时统计已出现的前缀和频次，查 `S[j]-k` 出现几次。

## 三、形式化与数学基础
设前缀和频次表 $C$。对每个 $j$：$ans += C[S[j]-k]$；再 $C[S[j]] += 1$。初值 $C[0]=1$。

## 四、代码实现
```python
def subarray_sum_k(nums, k):
    count = {0: 1}
    pref = 0
    ans = 0
    for x in nums:
        pref += x
        ans += count.get(pref - k, 0)
        count[pref] = count.get(pref, 0) + 1
    return ans
```

## 五、与其他技术对比
暴力 $O(n^2)$；本方法 $O(n)$ 且空间 $O(n)$。适用于"子数组和"类计数。

## 六、常见误区
- 忘记初始化 `count[0]=1`（空前缀也是一种）。
- 先加后查会把自己算入（应先查再更新自身）。

## 七、与开源书/权威来源对应
- leetcode-master 和为 K 的子数组。
- CS-Notes 前缀和哈希。

## 八、面试题
1. 为什么 count[0] 初始为 1？
2. 如何改为"最长子数组和为 k"？

## 九、演进与趋势
该技巧扩展到"子数组异或为 k"（前缀异或 + 哈希）。

## 十、小结
前缀和配哈希表把"区间和等于 k"转为"查历史前缀出现次数"。
