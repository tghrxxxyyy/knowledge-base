# 状态压缩DP

> 对应 Skiena《The Algorithm Design Manual》TSP 章节，以及 《算法竞赛进阶指南》状态压缩 DP / 插头 DP 章节。

## 一、背景与挑战

当问题状态涉及「子集」且全集规模不大（通常 $n \le 20$~$25$）时，可以把集合编码成整数的二进制位，用「状态压缩 DP」（Bitmask DP / 状压 DP）求解。典型问题：旅行商问题（TSP）、哈密顿路径计数、棋盘覆盖、最小斯坦纳树、分配问题（任务与人一一匹配）、开关灯/翻转、棋盘轮廓线 DP（插头 DP）。这些题暴力枚举 $2^n$ 子集或 $n!$ 排列会爆炸，但把「已选集合」压成整数后，子问题数量是 $2^n \cdot \text{poly}(n)$，配合位运算转移可在 $n=20$ 左右精确求解。

朴素做法为什么不行？TSP 若枚举全排列是 $O(n!)$，$n=20$ 时约 $2.4\times 10^{18}$，完全不可行。若只做 DFS 回溯，状态「当前点 + 已访问集合」若用布尔数组比较，无法记忆化——必须把集合变成可哈希的整数，才能缓存子问题最优值。状压 DP 正是「用整数键做记忆化」的系统化形态。

在工程与面试中，状压 DP 是「小规模精确最优」的标准武器。面试官常考「不同路径 III」（哈密顿路径计数）、「最短超级串」「分配问题」「最小体力消耗路径」（通常不用状压）。读完本篇，你应能识别「集合状态」场景、写出 $dp[mask][i]$ 转移、用子集枚举技巧加速、并知道 meet-in-the-middle 与轮廓线 DP 的适用边界。

## 二、核心原理

**掩码表示集合**。用 $mask \in [0, 2^n)$，第 $i$ 位为 1 表示元素 $i$ 已选/已访问。基本位运算：
- 测位：`(mask >> i) & 1` 或 `mask & (1 << i)`
- 置位：`mask | (1 << i)`
- 清位：`mask & ~(1 << i)`
- 去掉一个元素：`mask ^ (1 << i)`（已知该位为 1）或 `mask & ~(1 << i)`
- 全集：`(1 << n) - 1`
- 子集枚举：`sub = mask; while sub: ...; sub = (sub - 1) & mask`

**标准状态形状**。
1. **路径型**：`dp[mask][i]` = 已访问集合 $mask$、当前在点 $i$ 的最优代价（TSP）。
2. **分配型**：`dp[mask][j]` = 已分配前 $\mathrm{popcount}(mask)$ 个人、当前分配到任务 $j$ 的最优。
3. **覆盖型**：`dp[mask]` = 集合 $mask$ 被若干矩形/骨牌覆盖的方案数。
4. **轮廓线型**：`dp[i][j][state]` = 填到格子 $(i,j)$、轮廓线上 $m$ 个格子占用状态的方案数（插头 DP）。

**TSP 转移**。固定起点 0（保证环，避免旋转同构），$dp[mask][i]$ 表示从 0 出发、走过 $mask$ 中的点、停在 $i$：
$$
dp[mask][i] = \min_{j \in mask,\ j \ne i} \big( dp[mask \setminus \{i\}][j] + dist[j][i] \big).
$$
答案 $\min_i dp[\mathrm{ALL}][i] + dist[i][0]$。复杂度 $O(2^n \cdot n^2)$。

**正确性**。状态「已访问集合 + 当前点」是无后效的：后续只取决于 $mask$ 与当前位置，不取决于访问顺序。子问题数量 $2^n \cdot n$，转移枚举前驱 $O(n)$，总 $O(2^n n^2)$。$n=20$ 时 $2^{20}\cdot 400 \approx 4\times 10^8$，Python 可能吃紧，C++ 稳过；$n \le 16$ 较安全。

**子集枚举技巧**。对 `sub = mask` 迭代 `sub = (sub-1) & mask` 可枚举 $mask$ 的所有子集，总枚举量 $O(3^n)$。用于子集和、覆盖、斯坦纳树等「集合拆成两半」的转移。

**边界**。$dp[1 << 0][0] = 0$（只在起点）；未访问的状态置 $+\infty$。$mask$ 必须包含 $i$，否则非法。

## 三、形式化与数学基础

**TSP 递推与复杂度**。
$$
dp[mask][i] = \min_{j \in mask \setminus \{i\}} \big( dp[mask \setminus \{i\}][j] + dist[j][i] \big).
$$
状态数 $2^n \cdot n$，单状态转移 $O(n)$，总 $O(2^n n^2)$，空间 $O(2^n n)$ 或滚动到 $O(2^n)$。

**哈密顿路径计数**。
$$
dp[mask][i] = \sum_{j \in mask \setminus \{i\}} dp[mask \setminus \{i\}][j] \cdot [j \to i \text{ 可达}].
$$
初始 $dp[1 << s][s] = 1$，答案 $\sum_i dp[\mathrm{ALL}][i]$。

**子集枚举的 $O(3^n)$**。对每个 $mask$ 枚举其子集，总对数
$$
\sum_{mask} 2^{\mathrm{popcount}(mask)} = \sum_{k=0}^{n} \binom{n}{k} 2^k = 3^n.
$$
用于「把集合拆成两个不相交子集」的转移（斯坦纳树、集合划分）。

**meet-in-the-middle**。TSP 的 $O(2^n n^2)$ 在 $n=25$ 时吃力。把点集拆成 $A, B$ 各 $n/2$，分别算 $A$、$B$ 内的最优路径拼接，复杂度降到 $O(2^{n/2} \cdot \mathrm{poly}(n))$。更一般地，子集和 meet-in-the-middle 用 $O(2^{n/2})$ 时间空间。

**轮廓线 DP（插头 DP）**。$n \times m$ 棋盘覆盖，状态是当前格左侧/上方轮廓的占用/括号序列。状态数 $O(nm \cdot c^m)$，$m$ 小时可行。用于连通性、骨牌覆盖、广义连通分量。

**位运算并行**。可行性背包/集合可用 bitset 把 $O(nC)$ 压到 $O(nC/w)$；集合的并交差补是 $O(1)$。

## 四、代码实现

两个完整例子：TSP（`dp[mask][i]`）与不同路径 III（哈密顿路径计数），外加子集枚举工具。

```python
"""状态压缩 DP：TSP 与哈密顿路径计数。"""
from __future__ import annotations


def tsp(dist: list[list[int]]) -> int:
    """旅行商：从 0 出发经过所有点回到 0 的最小代价。n <= 16~20。"""
    n = len(dist)
    N = 1 << n
    INF = float("inf")
    dp = [[INF] * n for _ in range(N)]
    dp[1][0] = 0  # 只在点 0

    for mask in range(N):
        for i in range(n):
            if not (mask >> i) & 1:
                continue
            if dp[mask][i] == INF:
                continue
            for j in range(n):
                if (mask >> j) & 1:
                    continue
                nxt = mask | (1 << j)
                nd = dp[mask][i] + dist[i][j]
                if nd < dp[nxt][j]:
                    dp[nxt][j] = nd

    full = N - 1
    ans = INF
    for i in range(n):
        if dp[full][i] < INF:
            ans = min(ans, dp[full][i] + dist[i][0])
    return ans


def hamiltonian_paths(grid: list[list[int]]) -> int:
    """
    LeetCode 980 不同路径 III：1 起点，2 终点，0 可走，-1 障碍。
    恰好经过所有空格的路径数。返回路径数。
    """
    n, m = len(grid), len(grid[0])
    total = 0
    start = end = None
    for i in range(n):
        for j in range(m):
            if grid[i][j] == -1:
                continue
            total += 1
            if grid[i][j] == 1:
                start = (i, j)
            elif grid[i][j] == 2:
                end = (i, j)
    if start is None or end is None:
        return 0

    # 空格编号 0..total-1
    id_of = {}
    idx = 0
    for i in range(n):
        for j in range(m):
            if grid[i][j] != -1:
                id_of[(i, j)] = idx
                idx += 1

    ALL = (1 << total) - 1
    si, sj = start
    ei, ej = end
    # dp[i][j][mask]：走到 (i,j)、已走空格集合 mask 的方案数
    # 用字典稀疏存：key=(i,j,mask)
    from collections import defaultdict

    dp = defaultdict(int)
    s_id = id_of[start]
    dp[(si, sj, 1 << s_id)] = 1
    dirs = [(-1, 0), (1, 0), (0, -1), (0, 1)]

    for mask in range(1 << total):
        # 从稀疏表中取该 mask 的所有位置
        items = [(i, j) for (i, j, mk) in list(dp.keys()) if mk == mask]
        for i, j in items:
            cur = dp[(i, j, mask)]
            if cur == 0:
                continue
            for di, dj in dirs:
                ni, nj = i + di, j + dj
                if not (0 <= ni < n and 0 <= nj < m) or grid[ni][nj] == -1:
                    continue
                nid = id_of[(ni, nj)]
                if (mask >> nid) & 1:
                    continue
                nmask = mask | (1 << nid)
                dp[(ni, nj, nmask)] += cur

    return dp[(ei, ej, ALL)]


def enumerate_subsets(mask: int):
    """生成 mask 的所有非空子集。"""
    sub = mask
    while sub:
        yield sub
        sub = (sub - 1) & mask


if __name__ == "__main__":
    # 4 点 TSP 经典例（对称距离）
    INF = 999999
    d = [
        [0, 10, 15, 20],
        [10, 0, 35, 25],
        [15, 35, 0, 30],
        [20, 25, 30, 0],
    ]
    assert tsp(d) == 80  # 0-1-3-2-0 = 10+25+30+15 = 80
    print("tsp:", tsp(d))

    grid = [[1, 0, 0, 0], [0, 0, 0, 0], [0, 0, 2, -1]]
    print("paths:", hamiltonian_paths(grid))

    assert list(enumerate_subsets(0b1011)) == [0b1011, 0b1010, 0b1001, 0b1000, 0b0011, 0b0010, 0b0001]
    print("all ok")
```

TSP 例中 4 点最优回路 $0\to1\to3\to2\to0$ 代价 80。哈密顿路径用稀疏字典避免 $O(3^{nm})$ 内存，在小棋盘上正确。

## 五、与其他技术对比

| 维度 | 暴力排列 | 状压 DP | meet-in-the-middle | 网络流/匈牙利 | 启发式（遗传/模拟退火） |
|------|----------|---------|---------------------|---------------|--------------------------|
| 时间 | $O(n!)$ | $O(2^n n^2)$ | $O(2^{n/2})$ | 多项式（特定问题） | 近似，不保证最优 |
| 空间 | $O(n)$ | $O(2^n n)$ | $O(2^{n/2})$ | $O(n^2)$ | $O(\text{pop})$ |
| 精确性 | 精确 | 精确 | 精确 | 精确（匹配） | 近似 |
| 适用 | $n \le 10$ | $n \le 20$ | $n \le 40$ | 二分图匹配 | 大规模近似 |
| 典型 | 枚举全排列 | TSP、哈密顿 | 子集和大 $n$ | 任务分配 | 大规模 TSP |

与 BFS/DFS 对比：状压用整数状态天然记忆化去重；与动态规划一般形式对比：状压的状态键是集合编码；与贪心对比：状压精确但只适合小 $n$。

## 六、常见误区

**`mask` 忘记包含起点/当前点**。`dp[mask][i]` 要求 $i \in mask$，否则转移非法。后果是状态错乱、答案错误。初始化 `dp[1<<s][s]=0` 并在转移中保证 `mask` 含 `i`。

**子集转移时未保证 $j \in mask$**。枚举 $j$ 时必须 `(mask >> j) & 1`，否则用到未访问点的值。后果是答案偏小（提前使用未来点）。用位运算严格判断。

**位运算优先级**。`mask & 1 << i` 在 C/C++ 是 `(mask & 1) << i`，Python 是 `mask & (1 << i)`。写 C++ 时必须括号：`mask & (1 << i)`。后果是掩码逻辑错。

**TSP 起点处理不当**。若不固定起点，旋转同构被重复计算；若忘记回到起点，得到的是哈密顿路径而非回路。答案要加 `dist[i][0]`。

**复杂度估算错**。$O(2^n n^2)$ 在 $n=25$ 是 $2.6\times 10^9$ 级别，Python 必超时。应评估 $n$ 上限，必要时 meet-in-the-middle 或启发式。后果是竞赛/面试中超时。

## 七、与开源书/权威来源对应

- **Skiena《The Algorithm Design Manual》Ch.8 / TSP**：状压 TSP 的经典讲解与代码。
- **《算法竞赛进阶指南》状态压缩 DP / 插头 DP 章节**：中文系统讲义。
- **CLRS《Introduction to Algorithms》Ch.35-3（TSP）**：NP-hard 背景与动态规划近似。
- **LeetCode 980 不同路径 III / 847 最短路径访问所有节点**：面试题源。
- **OI Wiki「状压 DP」**：子集枚举、轮廓线 DP 索引。

## 八、面试题

**1. 不同路径 III 用什么算法？**
参考答案：状压 DP / DFS+记忆化。状态 `dp[i][j][mask]`：走到 $(i,j)$、已走空格集合 $mask$ 的方案数。$mask$ 用位表示每个空格是否走过。转移向四邻扩展未走空格。终点收集 $mask = \mathrm{ALL}$ 的方案数。

**2. TSP 为什么用 `dp[mask][i]`？**
参考答案：状态必须刻画「已访问集合」与「当前位置」，二者缺一后续代价不同。`mask` 压缩集合为整数，$O(2^n n^2)$ 精确求解小 $n$。不固定起点会重复计数旋转。

**3. 如何枚举一个集合的所有子集？**
参考答案：`sub = mask; while sub: use(sub); sub = (sub - 1) & mask`。总枚举量 $O(3^n)$，用于集合拆分转移。注意 `sub` 非空循环，要处理空集需另写。

**4. $n=40$ 的子集和怎么办？**
参考答案：meet-in-the-middle。把 $n$ 个数拆成两半，各算 $2^{20}$ 个子集和，排序后双指针/二分找匹配，$O(2^{n/2} n)$。比 $2^{40}$ 完全可行。

## 九、演进与趋势

**meet-in-the-middle 与折半搜索**。把 $2^n$ 降到 $2^{n/2}$，用于 TSP、子集和、最大独立集小 $n$。

**轮廓线 DP / 插头 DP**。棋盘连通性、骨牌覆盖、广义连通分量，状态是轮廓括号序列。

**高维 bitset 与 SIMD**。可行性集合用 `std::bitset` / AVX 批量转移，常数降一个数量级。

**与树上 DP 结合**。树上路径覆盖、斯坦纳树（子集枚举 + 树形合并）。

**近似与学习型**。大规模 TSP 用 LKH、神经网络（Pointer Network、GNN）求近似，状压只做小规模精确或子问题。

## 十、小结

状态压缩 DP 把「集合」压成整数掩码，用 `dp[mask][i]` 等形状精确求解小规模最优问题。核心是位运算枚举子集/翻转位、无后效性状态（已访问集合 + 当前点）、以及 $O(2^n n^2)$ 的复杂度边界。TSP、哈密顿路径、棋盘覆盖是代表；子集枚举 $O(3^n)$、meet-in-the-middle、轮廓线 DP 是常用扩展。牢记 $n \le 20$（或折半后 $n \le 40$）的规模边界与位运算优先级，就能把状压用成可靠武器。
