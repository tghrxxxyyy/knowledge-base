# 旅行商问题 TSP

> 对应 Bellman 1962（DP 最优化原理）与 youngyangyang04/leetcode-master 状态压缩（TSP）。

## 一、背景与挑战
访问 n 个城市各一次并回到起点，求最短回路。暴力 $O(n!)$；状压 DP 可达 $O(n^2 2^n)$。

## 二、核心原理
状态 `dp[mask][i]` 表示已访问集合 mask、当前在城市 i 的最小代价。转移枚举下一个未访问城市 j。

## 三、形式化与数学基础
$$dp[mask][i]=\min_{j\notin mask} (dp[mask\setminus\{i\}][j]+dist[j][i])$$
初值 $dp[\{0\}][0]=0$。答案 $\min_i (dp[all][i]+dist[i][0])$。

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
            if not (mask >> i) & 1 or dp[mask][i] == INF:
                continue
            for j in range(n):
                if (mask >> j) & 1:
                    continue
                nxt = mask | (1 << j)
                dp[nxt][j] = min(dp[nxt][j], dp[mask][i] + dist[i][j])
    ans = min(dp[N - 1][i] + dist[i][0] for i in range(n))
    return ans
```

## 五、与其他技术对比
暴力 $O(n!)$；状压 $O(n^2 2^n)$；近似算法（最近邻/Christofides）用于大规模。

## 六、常见误区
- 忘记回到起点那一段距离。
- n 较大时内存/时间超限（应确认 n ≤ 16~20）。

## 七、与开源书/权威来源对应
- leetcode-master 不同路径 III/状压 TSP。
- Bellman 1962 DP 状态定义思想。

## 八、面试题
1. TSP 状压 DP 的状态与转移？
2. 为何只在 n 较小可行？

## 九、演进与趋势
TSP 是 NP-hard，研究聚焦于近似、分支定界与启发式（遗传/模拟退火）。

## 十、小结
TSP 状压 DP 用 `dp[mask][i]` 表达部分路径，指数级但远优于暴力。
