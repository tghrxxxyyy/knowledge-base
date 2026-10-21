# 旅行商问题 TSP

> 对应 Held & Karp (1962) *A Dynamic Programming Approach to Sequencing Problems*、Cormen et al.《算法导论》第 35 章 NP 完全性，以及 L. L. Karp 1972 关于哈密顿回路与 NP 完全性的经典论文。

## 一、背景与挑战

旅行商问题（TSP）：给定 $n$ 座城市与距离矩阵 $d(i,j)$，求一条经过每座城市恰好一次并回到起点的最短回路。它是组合优化的"圣杯"级问题：精确求解是 NP-hard 的，$n=50$ 用整数规划可能要跑很久，$n=1000$ 只能上启发式。但在面试与竞赛中，$n\le 20$ 的小规模 TSP 是必考题——因为它是状压 DP 的教科书范例，能把"状态是集合 + 当前位置"的思想体现得淋漓尽致。

朴素做法为什么不行？枚举全部排列是 $O(n!)$：$n=12$ 就有 $4.8\times 10^8$ 条路径，$n=15$ 已达 $1.3\times 10^{12}$。更糟的是，排列枚举把"已经访问过哪些城市"这一关键信息完全丢失，无法做最优子结构合并。贪心（最近邻）与最小生成树 $2$-近似只能给上界/近似，不能给精确解。于是需要一个既能利用"已访问集合"可合并性、又能在 $n\le 20$ 跑得动的精确算法——这正是 Held-Karp 动态规划。

在工程中，TSP 出现在物流路径规划、电路板钻孔、基因组测序片段排序、集群任务调度等场景。大厂面试里，TSP 状压是"DP 是否真的懂集合状态"的分水岭：能写出 `dp[mask][i]`、说清 $O(n^2 2^n)$、会回溯路径，才算过关。

## 二、核心原理

**状态设计。** 定义 `dp[mask][i]`：已访问城市集合恰好为 `mask`，且当前位于城市 $i$（$i \in mask$）时的最短路径长（从固定起点出发）。这是一个"集合 + 位置"的二维状态，共 $2^n \cdot n$ 个。

**转移。** 最后一步一定是从某个 $j \in mask \setminus \{i\}$ 走到 $i$：

$$
dp[mask][i] = \min_{j \in mask,\, j \neq i} \bigl( dp[mask \setminus \{i\}][j] + d(j, i) \bigr).
$$

即"在访问 i 之前，已访问集合是 mask 去掉 i，且停在 j"。这个转移的合法性依赖最优子结构：最优路径访问到 i 时，其前缀必然是"从起点到 j、访问完 mask\{i\}"的最优路径——否则可以用更优前缀替换，得到更短总路径，矛盾。

**边界。** 从城市 0 出发：`dp[1<<0][0] = 0`，其余初始化 $+\infty$。最终答案：

$$
\min_{i \neq 0} \bigl( dp[(1<<n)-1][i] + d(i, 0) \bigr),
$$

即访问完全体后还要回到起点。

**计算顺序。** 按 `mask` 从小到大枚举；对每个 `mask`，枚举终点 $i$，再枚举前驱 $j$。由于 $mask \setminus \{i\} < mask$，转移只依赖更小的 mask，天然无后效。

**正确性要点。** 每个状态 $(mask, i)$ 对应"某条以 i 结尾、恰好访问了 mask 的路径"中的最短者；任何回路都可以唯一拆成"前缀最优 + 最后一步"，故 DP 一定能捕获全局最优回路。注意：这里求的是**回路**（回到起点），若求哈密顿路径（不回），则答案直接是 $\min_i dp[full][i]$。

**路径还原。** 用 `parent[mask][i]` 记录转移来源 $j$，从最优终点沿 parent 回溯到起点，逆序即得路径。

## 三、形式化与数学基础

**Held-Karp 复杂度。** 状态数 $n \cdot 2^n$；每个状态的转移枚举 $n$ 个前驱，故

$$
T(n) = O(n^2 \cdot 2^n), \quad S(n) = O(n \cdot 2^n).
$$

具体地，$\sum_{mask} \sum_{i \in mask} |mask| = \sum_{k=1}^{n} \binom{n}{k} k \cdot k \le n^2 2^n$。

**空间优化。** 只保留上一轮"少一个元素"的状态时仍需 $O(n 2^n)$；可按 `popcount(mask)` 分层滚动，但 `parent` 数组若要还原路径，仍需 $O(n 2^n)$。极端情况下可只存 `dp` 用迭代加深/二分答案 + 判定，但通常不必。

**与 $O(n!)$ 的比较。**

$$
\frac{n!}{n^2 2^n} \Big|_{n=12} \approx \frac{4.79\times 10^8}{5.9\times 10^5} \approx 800, \quad n=16 \text{ 时比值已超 } 10^5.
$$

**近似与精确的分界。** $n \le 20$：Held-Karp 精确；$20 < n \le 10^3$：Christofides（$3/2$ 近似）、LKH（启发式）；$n > 10^3$：Lin-Kernighan、遗传/蚁群等元启发式。这是工程选型的硬边界。

**对称 TSP 的状态减半技巧。** 若 $d(i,j)=d(j,i)$，回路正反等价，可强制 $i$ 的编号大于 `mask` 中某固定点，或在最终答案处只计正方向，常数减半但不改渐进复杂度。

**判定版本与哈密顿回路。** TSP 的判定形式（是否存在长度 $\le K$ 的回路）是 NP-complete；Held-Karp 在 $O(n^2 2^n)$ 内精确解它，也间接说明了为什么该 DP 跑不了大规模——它正是指数级的。

## 四、代码实现

完整可运行的 Held-Karp，含路径还原与经典用例验证。

```python
# Held-Karp TSP：O(n^2 2^n)
INF = float('inf')


def tsp(dist):
    """dist: n×n 完全图距离（dist[i][i]=0）。返回 (最短回路长, 路径列表)。"""
    n = len(dist)
    size = 1 << n
    dp = [[INF] * n for _ in range(size)]
    parent = [[-1] * n for _ in range(size)]
    dp[1][0] = 0  # 只在城市 0

    for mask in range(size):
        if not (mask & 1):
            continue
        for i in range(n):
            if not (mask >> i) & 1 or dp[mask][i] == INF:
                continue
            # 尝试从 i 走到未访问的 v
            for v in range(n):
                if (mask >> v) & 1:
                    continue
                nxt = mask | (1 << v)
                cand = dp[mask][i] + dist[i][v]
                if cand < dp[nxt][v]:
                    dp[nxt][v] = cand
                    parent[nxt][v] = i

    full = size - 1
    ans, last = INF, -1
    for i in range(1, n):
        cand = dp[full][i] + dist[i][0]
        if cand < ans:
            ans, last = cand, i

    # 回溯
    path = []
    mask = full
    cur = last
    while cur != -1:
        path.append(cur)
        prev = parent[mask][cur]
        if prev == -1:
            break
        mask ^= (1 << cur)
        cur = prev
    path.reverse()       # [0, ..., last]
    route = path + [0]   # 闭合回路
    return ans, route


if __name__ == '__main__':
    d = [
        [0, 10, 15, 20],
        [10, 0, 35, 25],
        [15, 35, 0, 30],
        [20, 25, 30, 0],
    ]
    length, route = tsp(d)
    print(length, route)  # 80, e.g. [0, 1, 3, 2, 0] 的回路长 10+25+30+15=80
```

若只要长度不要路径，可去掉 `parent`，并用两层滚动：

```python
def tsp_length_only(dist):
    n = len(dist)
    size = 1 << n
    dp = [[INF] * n for _ in range(size)]
    dp[1][0] = 0
    for mask in range(1, size):
        if not (mask & 1):
            continue
        for i in range(n):
            if (dp[mask][i] == INF) or not (mask >> i) & 1:
                continue
            for v in range(n):
                if mask & (1 << v):
                    continue
                nxt = mask | (1 << v)
                nd = dp[mask][i] + dist[i][v]
                if nd < dp[nxt][v]:
                    dp[nxt][v] = nd
    full = size - 1
    return min(dp[full][i] + dist[i][0] for i in range(1, n))
```

正确性自检：上例唯一最优回路长 80，代码应输出 `80` 与 `0-1-3-2-0`（或逆序 `0-2-3-1-0`）。

## 五、与其他技术对比

| 方法 | 时间 | 解质量 | 规模 | 场景 |
|------|------|--------|------|------|
| 枚举排列 | $O(n!)$ | 精确 | $n\le 10$ | 仅教学 |
| Held-Karp 状压 | $O(n^2 2^n)$ | 精确 | $n\le 20$ | 面试/竞赛标配 |
| 分支限界 + MST 下界 | 指数，常数小 | 精确 | $n\le 30$ | 可加剪枝 |
| Christofides | $O(n^3)$ | $\le 1.5$ OPT | $n\le 10^4$ | 需要理论保证 |
| LKH / Lin-Kernighan | 近线性 | 启发式极优 | $n\le 10^6$ | 工业物流 |
| 整数规划（Concorde） | 实测很快 | 精确 | $n\le 10^4$ | 竞赛不敢用 |

取舍：$n\le 20$ 必用状压精确解；$n$ 上百且要工程解，用 LKH；要理论保证用 Christofides。面试只考第一行。

## 六、常见误区

1. **状态只写 `dp[mask]`，丢掉"当前位置"。** 后果：无法决定下一步走哪、无法累加距离，转移根本写不出来。TSP 必须是 `dp[mask][i]`。
2. **忘了最后回到起点。** 只输出 `min(dp[full])` 是哈密顿路径长，比回路短。要加 `dist[i][0]`。
3. **起点不固定。** 若从任意点出发都行，可以固定 0 为起点（回路旋转等价），不要真的枚举所有起点再取 min，那是 $n$ 倍常数浪费。
4. **回溯时 `mask` 更新写错。** 常见错误是回溯中不断 `mask = parent` 而没有从 mask 中去掉当前点，导致回溯死循环或路径重复。正确：`prev = parent[mask][cur]; mask ^= (1 << cur); cur = prev`。
5. **把有向 TSP 当对称处理。** $d(i,j)\neq d(j,i)$ 时正反回路不等价，不能减半状态；转移里 `dist[i][v]` 的方向也不能写反。

## 七、与开源书/权威来源对应

- Held, M. & Karp, R. M. (1962). *A Dynamic Programming Approach to Sequencing Problems*, Journal of SIAM.
- Cormen et al. *Introduction to Algorithms* (CLRS) 第 35 章 — NP 完全性与 TSP。
- Karp, R. M. (1972). *Reducibility Among Combinatorial Problems* — 哈密顿回路 NP 完全。
- L. L. LKH 启发式源码库（http://webhotel4.ruc.dk/~keld/research/LKH/）— 工业级 TSP。

## 八、面试题

面试中若被要求解 TSP，先确认 $n$ 的规模：$n\le 20$ 用状压精确解；$n$ 上百则谈近似与启发式。回答时把状态、转移、复杂度、路径还原四件事一次说清，比直接默写代码更能体现理解。

**1. 请写出 TSP 状压 DP 的状态定义与转移，并给出复杂度。**
参考答案：`dp[mask][i]` 为已访问集合 mask、当前在 i 的最短路。转移 $dp[mask][i] = \min_{j \in mask \setminus i} (dp[mask \setminus i][j] + d(j,i))$。时间 $O(n^2 2^n)$，空间 $O(n 2^n)$。

**2. 为什么 TSP 是 NP-hard，状压还能精确解？矛盾吗？**
参考答案：不矛盾。NP-hard 指多项式时间算法（若 P≠NP）不存在；$O(n^2 2^n)$ 是指数时间，只对小 $n$ 有效。状压是"指数级精确"，不是"多项式级精确"。

**3. 如何还原最短回路的具体路径？**
参考答案：记录 `parent[mask][i]` 为转移到 i 时的前驱 j；从最优终点与全集 mask 出发，反复 `prev = parent[mask][cur]; mask ^= (1<<cur); cur = prev` 直到回到起点，逆序即路径。

**4. 若 $n=25$ 且距离对称，还有什么办法？**
参考答案：Held-Karp 已经 $O(25^2 2^{25})$ 过于吃力。可尝试（a）折半枚举：把点集对半分，左右各算"起点到终点 + 覆盖子集"再拼接，$O(2^{n/2})$ 级；（b）分支限界 + 好下界；（c）直接上 LKH 拿近似解。面试答出折半即可加分。

## 九、演进与趋势

TSP 在算法史上的位置很特殊：它是第一批被证明 NP-hard 的问题，也是近似算法、启发式、整数规划与并行计算共同的基准题。小规模精确解与大规模近似解之间的鸿沟，恰好就是 Held-Karp 状压与 LKH 启发式各自存在的理由。

TSP 状压之后有几条成熟演进。**度量 TSP**（三角不等式）下 Christofides 给出 $3/2$ 近似；**LKH** 用 k-opt 交换做到工业最优。**带时间窗 / 容量的 VRP** 是 TSP 的加约束版本，小规模仍用"状态 = (mask, 车剩余容量, 当前点)"的扩展状压。**折半枚举（Held-Karp 的对半版本）** 把 $n$ 推到 40 上下。**量子退火与近似硬件**（D-Wave）也用 TSP 作基准。工程趋势是"精确只留给小实例，大规模全靠启发式 + 局部搜索"，而面试趋势稳定停留在 Held-Karp 与其空间/路径还原变体。

## 十、小结

TSP 的精确小规模解法是 Held-Karp 状压 DP：状态 `dp[mask][i]` 捕获"已访问集合 + 当前位置"，转移 $O(n)$，总复杂度 $O(n^2 2^n)$，可还原最优回路；它把 NP-hard 问题在 $n\le 20$ 打成精确解，是状压 DP 最经典、最能检验功底的应用。
