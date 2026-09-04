# 状态压缩DP

> 对应 《算法竞赛进阶指南》状压 DP 与 TSP 章节。

## 一、背景与挑战
当状态涉及「集合」且规模小（n<=20）时，用整数的二进制位表示集合，典型如旅行商 TSP、棋盘覆盖、哈密顿路径。

## 二、核心原理
掩码 mask 的每位表示某元素是否选中；转移通过位运算枚举子集或翻转位：`mask ^ (1<<i)`、`(mask & (1<<i))`。

## 三、形式化 / 数学基础
TSP：
$dp[mask][i] = \min_{j\in mask, j\ne i}\big(dp[mask\setminus\{i\}][j] + dist[j][i]\big)$
子集枚举：`for sub = mask; sub; sub = (sub-1) & mask`。

## 四、代码实现
```python
def tsp(dist):
    n = len(dist)
    N = 1 << n
    INF = float('inf')
    dp = [[INF] * n for _ in range(N)]
    dp[1][0] = 0
    for mask in range(N):
        for i in range(n):
            if not (mask >> i) & 1:
                continue
            for j in range(n):
                if i == j or not (mask >> j) & 1:
                    continue
                dp[mask][i] = min(dp[mask][i], dp[mask ^ (1 << i)][j] + dist[j][i])
    return min(dp[N-1][i] + dist[i][0] for i in range(n))
```

## 五、与其他技术对比
与 BFS/DFS 暴力相比，状压 DP 用整数状态天然去重；与网络流匹配相比，状压适合小规模精确最优。

## 六、常见误区
忘记 `mask` 包含起点；子集转移时未保证 j 在 mask 中；位运算优先级写错（用括号包裹）。

## 七、与开源书 / 权威来源对应
- Skiena《The Algorithm Design Manual》TSP 章节
- 代码随想录: https://github.com/youngyangyang04/leetcode-master

## 八、面试题
「不同路径 III」（哈密顿路径计数）；「最小体力消耗路径」通常不用状压。

## 九、演进与趋势
结合 meet-in-the-middle 将 2^n 降到 2^(n/2)；轮廓线 DP 处理棋盘格（插头 DP）。

## 十、小结
状压 DP 把集合压成整数，核心是位运算枚举子集/选点，注意状态包含关系与边界初始化。
