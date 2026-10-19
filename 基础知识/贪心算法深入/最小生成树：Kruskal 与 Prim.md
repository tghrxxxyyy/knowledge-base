# 最小生成树：Kruskal 与 Prim

> 对应 J. B. Kruskal, *On the Shortest Spanning Subtree of a Graph and the Traveling Salesman Problem*, Proc. AMS, 1956；R. C. Prim, *Shortest Connection Networks and Some Generalizations*, Bell Syst. Tech. J., 1957；综述见 CLRS 第 23 章与 Borůvka 1926。

## 一、背景与挑战

最小生成树（MST）是连通无向赋权图 $G=(V,E,w)$ 中总权最小的生成树：连接全部 $n$ 个顶点、恰好 $n-1$ 条边、无环，且 $\sum w(e)$ 最小。应用包括网络布线（光纤、管网）、聚类（单链接层次聚类）、近似旅行商、电路设计、图像分割。

为什么难？生成树数量是 $n^{n-2}$（Cayley），枚举不可行。贪心直觉很多但会错："每次选最小边"可能成环；"每次选离树最近点"要证明最近的是对的。好在 MST 有一个非常强的结构性质——**切割性质（Cut Property）与环性质（Cycle Property）**——使 Kruskal 与 Prim 两条贪心路线都能严格证明。

面试与工程中的位置：MST 是"贪心正确"的经典，和 Dijkstra 并列。常问：Kruskal 为什么用并查集、Prim 与 Kruskal 的复杂度与取舍、切割性质是什么、不连通图怎么办、如何求次小生成树、K 聚类怎么用 MST。工程上，网络路由的最小代价骨干、传感器网络拓扑、聚类算法都直接用 MST。

另一个常被忽略的角度是：MST 与最短路、TSP 近似的关系。MST 是 TSP 的 $\frac{3}{2}$ 近似（Christofides 更好）的基石；单链接聚类就是 MST 去掉最长边的语义。面试里若被追问"和 Dijkstra 的区别"，要点在于 Prim 扩展的是"到树的距离"，不是到源点的距离——两者骨架相似，语义完全不同。

## 二、核心原理

**切割性质**：对任意切割 $(S, V\setminus S)$，横跨切割的最小权边 $e$ 必属于某棵 MST。直觉是：任何生成树都要连通 $S$ 与外部，至少用一条跨割边；用最小的那条不会差。

**环性质**：环上权严格最大的边一定不在任何 MST 中（若在，可换成环上更小的边，总权减小）。

**Kruskal**：把边按权升序排序，依次考虑；若两端不在同一连通分量（并查集），则加入；否则跳过（会成环）。等价于"每次选当前最小的、不成环的边"。每条边决策一次，用 Union-Find 判环。

**Prim**：从任意点出发维护"已在树中"集合 $S$；每次选横跨 $(S, V\setminus S)$ 的最小权边，把对应点并入。用最小堆/邻接表维护候选边。切割性质保证每次选的边属于某 MST。

**不变量**：
- Kruskal：已选边集始终是某棵 MST 的子集（或无环森林）；
- Prim：$S$ 的"连接边"中最小者必在某 MST 中，树始终保持连通。

**为何正确**：切割性质对每步都成立；归纳可得最终边集总权最小。

**边界条件**：
- 图不连通：无生成树；Kruskal 得到的是生成森林，`edge_count < n-1` 判无解；
- 权相等：MST 不唯一，但总权相同；实现结果可能不同，测试应验总权而非具体边集；
- 重边/自环：自环丢弃，重边保留最小或都处理；
- 负权：算法仍正确（只依赖比较）。

**次小生成树**：任一非树边替换树边（替换后仍是树）中权差最小者，可得严格次小。

**K 聚类**：Kruskal 从大到小加边，或从小到大合并直到剩 $k$ 个分量；最大化类间最小距离即"最远的合并先跳过"。

## 三、形式化与数学基础

**切割性质证明**：设 $e=(u,v)$ 是跨割 $(S,V\setminus S)$ 的最小权边，$T$ 为任一 MST。若 $e \notin T$，则 $T \cup \{e\}$ 含唯一环，环上必有另一条跨割边 $e'$（否则 $u,v$ 连通矛盾）。由 $e$ 最小，$w(e) \le w(e')$；用 $e$ 替换 $e'$ 得 $T'$，$w(T') \le w(T)$，故 $T'$ 也是 MST 且含 $e$。

**Kruskal 正确性**：归纳边序。设当前选的边 $e$ 是不成环的最小边。若 $e$ 不在最优 $T^*$ 中，则 $T^* \cup \{e\}$ 有环，环上有边 $e'$ 连通同样两分量；由 $e$ 的选择时机（当时 $e'$ 未被考虑或更贵），$w(e) \le w(e')$，替换得不更差的解。

**Prim 正确性**：每步选的边是跨割最小边，由切割性质属于某 MST；归纳得整棵树最小。

**复杂度**：
- Kruskal：排序 $O(E\log E)$，并查集近 $O(E\alpha(V))$，总 $O(E\log E)$；
- Prim（二叉堆）：$O(E\log V)$；斐波那契堆 $O(E + V\log V)$；稠密图用朴素 $O(V^2)$。

**唯一性**：MST 唯一 $\iff$ 任意环上权最大边唯一（严格大于环上其它边）。否则多棵同权。

**拟阵视角**：图的森林构成拟阵（graphic matroid），MST 即最大权生成拟阵独立集（边权取 $-w$ 或反向排序），故贪心正确。

**次小生成树公式**：设 MST 权为 $W$。对每条非树边 $e=(u,v)$，在树上路径 $u\rightsquigarrow v$ 中取最大权边 $e_{\max}$，候选增量 $w(e)-w(e_{\max})$；严格次小权为
$$W_2 = W + \min_{e \notin T} \big( w(e) - w_{\max}(e) \big)$$
（要求增量 $>0$）。这解释了"次小怎么求"的面试题。

**K 聚类的目标函数**：最大化簇间最小距离等价于求最大生成的 $k$-森林间距。从小到大合并到剩 $k$ 个分量时，最后一次合并前的边权即最优间距；该值也是单链接层次聚类的分裂阈值。

## 四、代码实现

```python
def kruskal(n, edges):
    """
    edges: list of (w, u, v), 无向。
    返回 (total_weight, mst_edges)；不连通抛 ValueError。
    """
    parent = list(range(n))
    rank = [0] * n

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra == rb:
            return False
        if rank[ra] < rank[rb]:
            parent[ra] = rb
        elif rank[ra] > rank[rb]:
            parent[rb] = ra
        else:
            parent[rb] = ra
            rank[ra] += 1
        return True

    mst = []
    total = 0
    for w, u, v in sorted(edges):
        if union(u, v):
            mst.append((w, u, v))
            total += w

    if len(mst) != n - 1:
        raise ValueError("graph is not connected")
    return total, mst


def prim(n, edges, start=0):
    """Prim + 二叉堆。返回 (total, mst_edges)。"""
    import heapq
    adj = [[] for _ in range(n)]
    for w, u, v in edges:
        adj[u].append((w, v))
        adj[v].append((w, u))

    in_tree = [False] * n
    heap = [(0, start, -1)]  # (w, to, from)
    total = 0
    mst = []
    taken = 0
    while heap and taken < n:
        w, u, frm = heapq.heappop(heap)
        if in_tree[u]:
            continue
        in_tree[u] = True
        taken += 1
        total += w
        if frm != -1:
            mst.append((w, frm, u))
        for w2, v in adj[u]:
            if not in_tree[v]:
                heapq.heappush(heap, (w2, v, u))

    if taken != n:
        raise ValueError("graph is not connected")
    return total, mst


def max_cluster_spacing(points, k):
    """
    K 聚类: 给定点与距离, 求最大化类间最小距离的划分
    (等价于: Kruskal 从小到大合并, 留下最后 k-1 条未合并前的最大间距)
    """
    import math
    n = len(points)
    edges = []
    for i in range(n):
        for j in range(i + 1, n):
            d = math.dist(points[i], points[j])
            edges.append((d, i, j))
    edges.sort()
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    comps = n
    # 合并直到剩 k 个分量, 记录最后一次合并时的边权即类间最小距离下界
    spacing = 0
    for w, u, v in edges:
        ru, rv = find(u), find(v)
        if ru != rv:
            if comps == k:
                spacing = w
                break
            parent[ru] = rv
            comps -= 1
    return spacing


if __name__ == "__main__":
    # 经典 4 顶点例子
    edges = [(1, 0, 1), (5, 0, 2), (2, 1, 2), (7, 1, 3), (3, 2, 3)]
    t1, m1 = kruskal(4, edges)
    t2, m2 = prim(4, edges, 0)
    assert t1 == t2 == 6  # 1+2+3
    assert len(m1) == len(m2) == 3

    pts = [(0, 0), (1, 0), (5, 0), (6, 0)]
    sp = max_cluster_spacing(pts, 2)
    assert abs(sp - 4.0) < 1e-6
    print("all tests passed")
```

## 五、与其他技术对比

| 维度 | Kruskal | Prim（二叉堆） | Prim（斐波那契堆） | 朴素 Prim |
|---|---|---|---|---|
| 复杂度 | $O(E\log E)$ | $O(E\log V)$ | $O(E+V\log V)$ | $O(V^2)$ |
| 数据结构 | 并查集 | 堆 | 斐波那契堆 | 数组 |
| 稀疏图 | 优 | 优 | 理论最优 | 差 |
| 稠密图 | 一般 | 一般 | 常数大 | 优 |
| 实现难度 | 低 | 低 | 高 | 低 |

取舍：**稀疏用 Kruskal 或堆 Prim**；**稠密用数组 Prim**；**理论追求 $O(E+V\log V)$ 用斐波那契堆**；要**生成森林/连通分量**用 Kruskal 更自然。二者总权相同（若权相同 MST 可能不同）。

## 六、常见误区

1. **"每次选最小边"却不判环**：直接加边会成环，不是树。必须并查集或 in-tree 检查。
2. **忘记处理不连通图**：边数不足 $n-1$ 时应报错或返回森林，不能当成功。
3. **用 Dijkstra 的"最近点"硬套 Prim**：Dijkstra 是到源点距离，Prim 是到当前树的距离；混用会算错（反例：树外点与树内点边权不同）。
4. **断言具体边集等于 MST**：权相等时多棵 MST，测试应验总权，不断言边的顺序。
5. **K 聚类合并方向搞反**：要"最小间距最大"应从小到大合并，或从大到小跳过；方向反了结果完全不同。

## 七、与开源书/权威来源对应

- Kruskal 1956：按权排序贪心的原始论文。
- Prim 1957：最近点贪心与推广。
- CLRS 第 23 章：切割/环性质与两算法正确性。
- Borůvka 1926：最早的 MST 算法（并行友好）；Tarjan 1983 关于 MST 复杂度。

## 八、面试题

**1. 为什么 Kruskal 用并查集？路径压缩影响复杂度吗？**  
并查集高效维护连通分量，判断加边是否成环。路径压缩 + 按秩合并使单次近 $O(\alpha(n))$，几乎常数，总近 $O(E\log E)$（瓶颈在排序）。

**2. 如何用 MST 做 K 聚类？**  
希望类间最小距离最大化：Kruskal 按距离升序合并，直到剩 $k$ 个分量；最后一次合并前的距离即最大间距。或反向：按降序加边，不加会连通已连通分量的边。

**3. Prim 与 Dijkstra 有何不同？**  
Prim 维护"到树的距离"，每次把最近点并入树；Dijkstra 维护"到源点的距离"，每次确定最近点并松弛。堆更新的键语义不同，但骨架相似。

**4. MST 唯一吗？**  
不一定。当存在环上最大边并列时多棵 MST 同权。唯一性条件是任意环上权最大边唯一。

## 九、演进与趋势

MST 的研究与工程持续扩展：**次小生成树、k-MST、斯坦纳树（NP-hard 近似）**；**动态图 MST**（边插入删除在线维护）；**并行/分布式 Borůvka**（适合 MapReduce、GPU）；**流式/半流式 MST**（有限内存）；**近似与鲁棒 MST**（噪声权、不确定权）；**聚类与图像分割**（Felzenszwalb-Huttenlocher 用 MST 语义）。工程上，网络设计、传感器拓扑、VLSI 布线都是 MST 族应用；学习型图算法预测边权做预处理也是新方向。

实际系统里 MST 常与其他结构组合：网络规划用 MST 打底再做容量优化；无线 Mesh 用 MST 保证连通再调功率；图像分割用像素邻接图跑 MST 后剪长边；近似 TSP 用 MST 遍历 + 捷径（$\frac{3}{2}$ 近似）或 Christofides（$\frac{3}{2}$ 更稳）。动态场景（链路增删）催生了链树（link-cut tree）维护的动态 MST 变体。

## 十、小结

MST 由切割性质支撑两条贪心：Kruskal 按边权升序加不成环边（并查集），Prim 按到树最近点扩展。稀疏用 Kruskal/堆 Prim，稠密用数组 Prim，理论极限是斐波那契堆。理解"切割/环性质、并查集判环、不连通与唯一性"，就能正确落地并用于聚类等扩展问题。
