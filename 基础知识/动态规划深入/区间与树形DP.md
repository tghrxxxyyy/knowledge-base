# 区间与树形DP

> 对应 CLRS《Introduction to Algorithms》第 15.2 节矩阵链乘法，以及树形依赖问题的标准解法（《算法竞赛进阶指南》树形 DP 章节）。

## 一、背景与挑战

许多问题的最优解具有「区间」或「树形」的自然结构。**区间 DP** 处理「把相邻段合并」或「在区间内选断点」的问题：矩阵链乘法、石子合并、多边形三角剖分、括号化、回文分割。**树形 DP** 处理树上的依赖决策：树的独立集（打家劫舍 III）、树的直径、树形背包、最小顶点覆盖、换根求每个点的答案。二者共享「结构化状态空间」，但计算顺序与合并方式不同。

朴素做法为什么不行？矩阵链若暴力枚举所有加括号方式，是 Catalan 数 $\Omega(4^n / n^{3/2})$；石子合并若每次贪心合并最小的两堆，会在「只能合并相邻两堆」的约束下错解（贪心不成立，必须区间 DP）。树上若用全局暴力枚举每点选或不选，$2^n$ 爆炸；但树的父子依赖恰好给出后序合并的最优子结构，$O(n)$ 或 $O(n^2)$ 即可。

在工程与面试里，区间 DP 是「合并类问题」的标准模板，树形 DP 是「树上选点/选边」的标准模板。面试官常考「矩阵链乘法」「石子合并」「二叉树中的最大路径和」「打家劫舍 III」。读完本篇，你应能写出区间递推、说明按长度递增的原因，写出树形后序合并、并知道换根（rerooting）如何在 $O(n)$ 求出以每个点为根的答案。

## 二、核心原理

**区间 DP：长度递增 + 枚举断点**。设 $f[i][j]$ 为区间 $[i,j]$ 的最优值。转移枚举最后一步的断点 $k$：
$$
f[i][j] = \mathrm{opt}_{i \le k < j} \big( f[i][k] + f[k+1][j] + \mathrm{cost}(i,k,j) \big).
$$
计算顺序必须**按区间长度 $L = j-i+1$ 从小到大**，保证 $f[i][k]$ 与 $f[k+1][j]$ 已算好。边界是长度 1（$f[i][i]$）。

**树形 DP：后序合并子树**。设 $dp[u][s]$ 为以 $u$ 为根的子树、$u$ 处于状态 $s$（如选/不选）的最优值。用 DFS 后序遍历，先递归子树 $v$，再合并：
$$
dp[u][1] = val_u + \sum_{v \in child(u)} dp[v][0], \qquad
dp[u][0] = \sum_{v \in child(u)} \max(dp[v][0], dp[v][1]).
$$
（树的独立集：$u$ 选则子点必不选，$u$ 不选则子点可选可不选。）

**区间 DP 的正确性**。最优加括号/合并序列的「最后一次操作」把区间分成两段，两段各自必须最优（剪贴论证）。枚举最后断点覆盖所有可能，取 $\min/\max$ 得全局最优。

**树形 DP 的正确性**。树的子树之间无边相连，决策相互独立；$u$ 的状态一旦固定，各子树子问题独立且最优可加/可 max 合并。后序保证子树先算完。

**换根（rerooting）**。先任选根做一遍 DP 得「向下」信息；第二遍 DFS 把「向上」信息传给子节点，从而得到以每个点为根的答案，总 $O(n)$。常用于树的重心、每点作为根时的深度和、每点作为根时的直径。

**边界条件**。区间 DP 的 $f[i][i]$ 要初始化为 $0$ 或 $val_i$，视题意。树形 DP 的叶子节点 $dp[\text{leaf}]$ 是平凡值。空区间 $i>j$ 要定义为 0 或 $+\infty$，避免越界。

## 三、形式化与数学基础

**矩阵链乘法**。维度 $p_0 \times p_1, \ldots, p_{n-1} \times p_n$，$m[i][j]$ 为 $A_i \cdots A_j$ 的最小乘法次数：
$$
m[i][i] = 0, \qquad
m[i][j] = \min_{i \le k < j} \big( m[i][k] + m[k+1][j] + p_{i-1} p_k p_j \big).
$$
时间 $O(n^3)$、空间 $O(n^2)$。断点 $k$ 处最后一次乘法把维度变成 $p_{i-1} \times p_k \times p_j$ 的标量乘。

**石子合并（环形或直线）**。直线版：$f[i][j]$ 合并 $[i,j]$ 的最小代价，$\mathrm{cost}$ 为区间和：
$$
f[i][j] = \min_{i \le k < j} \big( f[i][k] + f[k+1][j] + sum(i,j) \big).
$$
$sum(i,j)$ 用前缀和 $O(1)$ 得到，总 $O(n^3)$。环形石子可用断环成链或四边形不等式优化到 $O(n^2)$。

**树的独立集（House Robber III）**。设 $f(u)$ 返回 $(not\_take, take)$：
$$
\begin{aligned}
take(u) &= val_u + \sum_{v} not\_take(v), \\
not\_take(u) &= \sum_{v} \max(take(v), not\_take(v)).
\end{aligned}
$$
线性时间 $O(n)$。

**树的直径（树形 DP）**。设 $down[u]$ 为 $u$ 向下最长链，$ans$ 为全局直径：
$$
down[u] = val_u + \max_{v} down[v], \qquad
ans = \max_u \big( down[u] + \text{second\_best} \big).
$$
一次 DFS 即可。

**换根公式（典型）**。设 $f[u]$ 为以 $u$ 为根时子树代价（如深度和）。第一遍算出 $f$。第二遍：
$$
f'[v] = f[v] + (n - 2 \cdot size[v]),
$$
用于「每个点作为根时的深度和」——$v$ 的子树贡献不变，子树外的点深度各 +1，故加 $n - 2 size[v]$。

**复杂度总结**。区间 DP 一般 $O(n^3)$（可四边形不等式/单调队列优化到 $O(n^2)$）；树形 DP 一般 $O(n)$ 或 $O(n^2)$（树上背包）；换根 $O(n)$。

## 四、代码实现

三个完整例子：矩阵链乘法、石子合并、树的独立集 + 换根深度和。

```python
"""区间 DP 与树形 DP。"""
from __future__ import annotations

import sys
from collections import defaultdict
sys.setrecursionlimit(100000)


# ---------- 1. 矩阵链乘法 ----------
def matrix_chain(p: list[int]) -> tuple[int, list[list[int]]]:
    n = len(p) - 1
    m = [[0] * (n + 1) for _ in range(n + 1)]
    s = [[0] * (n + 1) for _ in range(n + 1)]
    for length in range(2, n + 1):
        for i in range(1, n - length + 2):
            j = i + length - 1
            m[i][j] = float("inf")
            for k in range(i, j):
                cost = m[i][k] + m[k + 1][j] + p[i - 1] * p[k] * p[j]
                if cost < m[i][j]:
                    m[i][j] = cost
                    s[i][j] = k
    return m[1][n], s


# ---------- 2. 石子合并（直线，最小代价） ----------
def stone_merge(stones: list[int]) -> int:
    n = len(stones)
    if n <= 1:
        return 0
    prefix = [0] * (n + 1)
    for i in range(n):
        prefix[i + 1] = prefix[i] + stones[i]
    f = [[0] * n for _ in range(n)]
    for length in range(2, n + 1):
        for i in range(n - length + 1):
            j = i + length - 1
            total = prefix[j + 1] - prefix[i]
            f[i][j] = min(f[i][k] + f[k + 1][j] for k in range(i, j)) + total
    return f[0][n - 1]


# ---------- 3. 树的独立集（打家劫舍 III） ----------
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


def rob_tree(root: TreeNode | None) -> int:
    def dfs(u: TreeNode | None) -> tuple[int, int]:
        if u is None:
            return 0, 0  # (not_take, take)
        lt, tt = dfs(u.left)
        rt, rtake = dfs(u.right)
        take = u.val + lt + rt
        not_take = max(lt, tt) + max(rt, rtake)
        return not_take, take

    not_take, take = dfs(root)
    return max(not_take, take)


# ---------- 4. 换根：每个点为根时的深度和 ----------
def depth_sum_reroot(n: int, edges: list[tuple[int, int]]) -> list[int]:
    g = defaultdict(list)
    for a, b in edges:
        g[a].append(b)
        g[b].append(a)
    size = [1] * n
    down = [0] * n

    def dfs1(u: int, p: int) -> None:
        for v in g[u]:
            if v == p:
                continue
            dfs1(v, u)
            size[u] += size[v]
            down[u] += down[v] + size[v]

    def dfs2(u: int, p: int) -> None:
        for v in g[u]:
            if v == p:
                continue
            # 把 v 换成根：v 的子树外各点深度 +1
            down[v] = down[u] + (n - 2 * size[v])
            dfs2(v, u)

    dfs1(0, -1)
    dfs2(0, -1)
    return down


if __name__ == "__main__":
    dims = [10, 30, 5, 60, 25]
    cost, s = matrix_chain(dims)
    assert cost == 5250
    print("matrix chain:", cost)

    assert stone_merge([4, 1, 3, 1, 5]) == 27  # 经典例
    print("stone:", stone_merge([4, 1, 3, 1, 5]))

    # 构造二叉树：1 / \ 2 3；偷 1+? 不，独立集 1+3=4 或 2+3=5
    root = TreeNode(1, TreeNode(2), TreeNode(3))
    # 2 无子，3 无子。take 1 = 1+0+0=1; not_take = max(2,0)+max(3,0)=5 → 5? 
    # 独立集是树，不是二叉树限制；2 与 3 是兄弟，可都偷：2+3=5
    assert rob_tree(root) == 5
    print("rob:", rob_tree(root))

    # 一条链 0-1-2-3，换根深度和
    edges = [(0, 1), (1, 2), (2, 3)]
    res = depth_sum_reroot(4, edges)
    print("reroot depth sums:", res)
    assert res == [6, 4, 4, 6]
    print("all ok")
```

矩阵链 5250、石子合并 27、独立集 5、链上换根深度和 $[6,4,4,6]$ 都是经典值，可对照验证。

## 五、与其他技术对比

| 维度 | 区间 DP | 树形 DP | 分治 | 贪心 | 换根 |
|------|---------|---------|------|------|------|
| 状态 | `f[i][j]` | `dp[u][s]` | 子问题 | 无表 | `down/up` |
| 顺序 | 长度递增 | 后序 DFS | 分治递归 | 一次扫描 | 两遍 DFS |
| 复杂度 | $O(n^3)$ 或 $O(n^2)$ | $O(n)$~$O(n^2)$ | 视递归 | $O(n\log n)$ | $O(n)$ |
| 典型 | 矩阵链、石子合并 | 独立集、直径、树上背包 | 归并、最近点对 | 活动选择 | 每点为根深度和 |
| 陷阱 | 断点范围 `k<j` | 遍历顺序 | 子问题不重叠 | 无最优子结构 | 方向写反 |

与分治对比：区间 DP 的子区间**重叠**，必须缓存；分治子问题不重叠，无需缓存。与树上贪心对比：树形 DP 允许子树间通过父节点状态耦合，贪心只看局部。与暴力搜索对比：区间 DP 把 $Catalan$ 爆炸压成 $n^3$，树形 DP 把 $2^n$ 压成 $n$。

## 六、常见误区

**断点枚举范围写错**。矩阵链 `for k in range(i, j)` 若写成 `range(i, j+1)`，会出现空区间 `f[k+1][j]` 越界或 `f[i][k]` 非法。后果是运行错误。正确是 $i \le k < j$。

**区间 DP 没按长度递增**。先填 `f[0][n-1]` 再填小区间，依赖未就绪，用到 0。后果是答案为 0 或错。外层循环必须是长度。

**树形 DP 没后序**。父节点在子节点前计算，读到未算的子树值（默认 0）。后果是答案偏小。必须递归子树后再合并。

**树上背包复杂度误判**。朴素对每对 (点, 容量) 转移是 $O(nC)$，但若对每个子节点枚举所有容量再枚举所有分配，会退化到 $O(n^2 C)$。需用「子树大小」做上界优化。

**换根时忘记减去子树贡献**。直接 `down[v] = down[u] + n` 会重复加。正确公式是 $down[v] = down[u] + n - 2 size[v]$。后果是深度和偏大。

## 七、与开源书/权威来源对应

- **CLRS《Introduction to Algorithms》Ch.15.2**：矩阵链乘法的标准区间 DP。
- **《算法竞赛进阶指南》（李煜东）树形 DP / 换根 DP 章节**：树的独立集、直径、每点为根。
- **《算法竞赛入门经典》石子合并 / 多边形三角剖分**：区间 DP 经典题。
- **LeetCode 337 打家劫舍 III / 543 二叉树直径 / 968 监控二叉树**：面试题源。
- **OI Wiki「区间 DP」「树形 DP」**：中文讲义与例题索引。

## 八、面试题

**1. 石子合并为什么不能贪心？**
参考答案：约束是只能合并**相邻**两堆，贪心「每次合并最小的两堆」可能把两堆很近的小石子隔开，导致后续合并代价暴涨。必须区间 DP：$f[i][j] = \min_k (f[i][k]+f[k+1][j]) + sum(i,j)$，按长度递增填表。

**2. 二叉树中的最大路径和怎么做？**
参考答案：树形 DP。`dfs(u)` 返回「以 $u$ 为端点的向下最大路径和」，全局 `ans` 更新 `u.val + left + right`（经过 $u$ 的路径）。注意负贡献要截断为 0。$O(n)$。

**3. 矩阵链乘法的状态与转移？**
参考答案：`m[i][j]` 为 $A_i..A_j$ 最小乘法次数，`m[i][j] = min_k(m[i][k]+m[k+1][j]+p_{i-1}p_k p_j)`，$i \le k < j$。按长度递增，$O(n^3)$。

**4. 换根 DP 的思路？**
参考答案：第一遍任选根算「向下」信息（子树大小、深度和、最长链）；第二遍 DFS 把「向上」信息传给子节点，得到每个点作为根的答案。深度和公式 $down[v] = down[u] + n - 2 size[v]$。总 $O(n)$。

## 九、演进与趋势

**四边形不等式与单调队列优化**。矩阵链、石子合并的决策点单调，可把 $O(n^3)$ 降到 $O(n^2)$。

**虚树与树上启发式合并**。把关键点抽出虚树再 DP，或用 DSU on tree 合并子树信息，处理树上查询。

**树上背包与依赖背包**。选子必选父的约束用树上分组背包，复杂度 $O(nC)$（用子树大小上界）。

**换根 + 边权/点权**。求每点为根时的直径、最小深度、重心，工业上用于分布式根选择、文件树布局。

**树链剖分 / LCT 上的 DP**。动态树、链上最值与路径聚合，把树形 DP 从静态推广到动态。

## 十、小结

区间 DP 的关键是「长度递增 + 枚举断点」，把合并类问题从指数压到 $O(n^3)$；树形 DP 的关键是「后序合并 + 状态刻画根的约束」，把选点类问题压到 $O(n)$。换根 DP 两遍 DFS 得到每个点为根的答案。二者都建立在最优子结构与结构化状态上：区间有重叠、树有父子耦合，缓存与顺序至关重要。掌握矩阵链、石子合并、独立集、换根这四个代表，就掌握了合并与树形依赖的标准解法。
