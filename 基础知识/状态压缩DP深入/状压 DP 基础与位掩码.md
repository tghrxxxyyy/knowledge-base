# 状压 DP 基础与位掩码

> 对应 Bellman 1962（动态规划最优化原理）与 youngyangyang04/leetcode-master 状态压缩 DP 章节。

## 一、背景与挑战
当状态维度之一是"某集合的取舍"（元素数 ≤ 机器字长），可用一个整数位掩码表示状态，把集合维度压进 DP 下标。

## 二、核心原理
状态设计为 `dp[mask]`，`mask` 的二进制第 i 位表示第 i 个元素是否已选/已覆盖。转移通过 `mask | (1<<i)` 增加元素。

## 三、形式化与数学基础
状态空间大小 $2^n$。转移：$dp[mask \cup \{i\}] = \min/\max (dp[mask] + cost(i))$，其中 $i\notin mask$。

## 四、代码实现
```python
def tsp_like(n, cost):
    INF = float('inf')
    dp = [INF] * (1 << n)
    dp[1] = 0              # 从节点 0 出发
    for mask in range(1 << n):
        if dp[mask] == INF:
            continue
        for i in range(n):
            if not (mask >> i) & 1:
                nxt = mask | (1 << i)
                dp[nxt] = min(dp[nxt], dp[mask] + cost[bit_of(mask)][i])
    return dp[(1 << n) - 1]
```

## 五、与其他技术对比
朴素集合 DP 用 `set` 作状态会爆炸且难哈希；位掩码把状态压成整数，转移用位运算极快。

## 六、常见误区
- 元素数 n 超过 20 时 $2^n$ 过大（状压仅适合 n ≤ ~20）。
- 忘记检查 `i` 是否已在 mask 中。

## 七、与开源书/权威来源对应
- leetcode-master 状态压缩 DP 入门（旅行商/子集）。
- Bellman 1962 DP 原理。

## 八、面试题
1. 状压 DP 适用 n 的上限大约是多少？为什么？
2. 如何用位运算判断/添加元素？

## 九、演进与趋势
配合子集枚举（`sub=(sub-1)&mask`）做"枚举父状态的所有子状态"优化转移。

## 十、小结
状压 DP 用位掩码把集合压进状态，适合 n ≤ 20 的组合类 DP。
