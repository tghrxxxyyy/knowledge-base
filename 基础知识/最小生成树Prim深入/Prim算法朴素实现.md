# Prim算法朴素实现

> 对应 CLRS《Introduction to Algorithms》第 23 章 Minimum Spanning Tree（贪心策略与 Prim 算法）；Sedgewick《Algorithms》第 4 章最小生成树；Tarjan 关于 MST 贪心正确性的论述。

## 一、背景与挑战

最小生成树（Minimum Spanning Tree, MST）问题：给定连通无向带权图 $G=(V,E,w)$，选出 $V-1$ 条边构成生成树，使总权 $w(T)=\sum_{e\in T} w(e)$ 最小。它的现实形态遍布工程：网络布线、电路板走线、聚类（单链接层次聚类）、图像分割、近似旅行商（TSP 2 近似）等。

朴素做法是枚举所有生成树再比权：$n$ 个结点的生成树数量可达 $n^{n-2}$（Cayley 公式），完全不可行。动态规划与线性规划（割平面）有理论价值但工程过重。我们需要**贪心**：每步只做局部最优选择，却能得到全局最优——这正是 Prim/Kruskal/Boruvka 共享的「切割性质」。

Prim 算法从一个起点出发，像「长树」一样每步把离当前树最近的顶点并入。朴素实现用邻接矩阵 + 线性扫描选最小，代码极短，是教学与面试手写 MST 的首选。理解它也是理解堆优化 Prim、Dijkstra（几乎同构）的基础。

## 二、核心原理

**算法骨架。** 维护：

- $key[v]$：顶点 $v$ 到当前树 $S$ 的最小边权（$v\notin S$）；
- $in[v]$：是否已入树；
- 每轮：在未入树顶点中选 $key$ 最小者 $u$，把 $u$ 与使 $key[u]$ 成立的边并入树，然后用 $u$ 的邻边松弛其他未入点的 $key$。

共 $n$ 轮，每轮加入一点，结束时 $n-1$ 条边构成 MST。

**切割性质（Cut Property）——正确性的灵魂。** 图的一个**切割**是把 $V$ 划分为 $(S, V\setminus S)$。若某条边 $(u,v)$ 是**横跨该切割的所有边中权最小者**，则存在一棵 MST 包含这条边。

Prim 每一步的不变量：$S$ 是当前树的顶点集，$u$ 是 $key$ 最小的未入点，则 $(u,\text{parent}[u])$ 恰好是切割 $(S, V\setminus S)$ 的最小横边（因为 $key[u]$ 就是横边最小权）。由切割性质，该边必属于某棵 MST；不断加入这样的边，最终得到一棵 MST。

**环性质（Cycle Property）。** 任何环上的最大权边一定不被包含在某棵 MST 中（除非权相等需取舍）。它与切割性质互为对偶，是 Kruskal 正确性与「唯一性判定」的基础。

**与 Dijkstra 的同构。** Prim 的 $key$ 更新是 $key[v] = \min(key[v], w(u,v))$（只看边权）；Dijkstra 是 $dist[v] = \min(dist[v], dist[u]+w(u,v))$（累加路径）。骨架相同，语义不同——面试常考这个对比。

**边界条件。** 图必须连通（否则得到最小生成森林）；权可为 0（不能用 `0` 表示无边，应 `inf`）；起点任选（MST 总权相同）；重边取最小；自环忽略；`key[起点]=0` 且第一轮就是起点入树。

## 三、形式化与数学基础

**切割性质证明（交换论证）。** 设 $e^*=(u,v)$ 是切割 $(S,\bar S)$ 的最小横边。取任意 MST $T$：

- 若 $e^*\in T$，得证存在含 $e^*$ 的 MST。
- 若 $e^*\notin T$，则 $T\cup\{e^*\}$ 含唯一环 $C$。环上必有另一条横边 $e'\neq e^*$（否则 $T$ 不连通 $u,v$ 到两侧）。由 $w(e^*)\le w(e')$，交换得 $T' = T - e' + e^*$ 仍是生成树且 $w(T')\le w(T)$。故 $T'$ 是含 $e^*$ 的 MST。

**Prim 正确性归纳。** 不变量：$S_k$（前 $k$ 轮入树点）连通，且已选边集是某棵 MST 在 $S_k$ 上的限制。$k=0$ 显然。由切割性质加入最小横边后不变量保持；$k=n$ 时得到 MST。

**复杂度。** 每轮线性扫 $n$ 点找最小 $key$：$O(n)$；松弛所有邻边：邻接矩阵 $O(n)$，共 $n$ 轮：

$$T_{\text{朴素 Prim}} = O(n^2),\quad \text{与 } |E| \text{ 无关}.$$

因此**稠密图**（$|E|=\Theta(n^2)$）最优；**稀疏图**（$|E|=O(n)$）则 $O(n^2)$ 浪费，应换堆优化。

**与线性规划对偶。** MST 是拟阵（graphic matroid）上的最小权基，贪心算法在拟阵上总最优——这是「为什么贪心对」的代数解释。

## 四、代码实现

完整可运行的朴素 Prim（邻接矩阵），含 `inf` 表示无边、总权与边集输出：

```python
def prim_naive(graph, start=0):
    """
    graph: n x n 邻接矩阵，graph[u][v] = 权，无边/自环用 float('inf') 或 0+inf 约定
    返回 (总权, 边列表 [(u,v,w), ...])
    """
    n = len(graph)
    INF = float("inf")
    key = [INF] * n
    parent = [-1] * n
    in_mst = [False] * n
    key[start] = 0

    for _ in range(n):
        # 1) 线性扫描找最小 key 的未入树点
        u, best = -1, INF
        for i in range(n):
            if not in_mst[i] and key[i] < best:
                u, best = i, key[i]
        if u == -1:
            break  # 图不连通时提前结束（最小生成森林）
        in_mst[u] = True

        # 2) 用 u 松弛邻居
        for v in range(n):
            w = graph[u][v]
            if w == INF or u == v:
                continue
            if not in_mst[v] and w < key[v]:
                key[v] = w
                parent[v] = u

    total = 0
    edges = []
    for v in range(n):
        if parent[v] != -1:
            w = graph[parent[v]][v]
            total += w
            edges.append((parent[v], v, w))
    return total, edges


if __name__ == "__main__":
    # 经典 CLRS 风格小图（4 点）
    INF = float("inf")
    g = [
        [0, 1, INF, 4],
        [1, 0, 3, 2],
        [INF, 3, 0, 5],
        [4, 2, 5, 0],
    ]
    total, edges = prim_naive(g, 0)
    print("MST total =", total)   # 6 = 1+2+3
    print("edges =", edges)
    assert total == 6
```

复杂度注释：外层 $n$ 轮，内层 `min` 扫 $O(n)$，松弛扫 $O(n)$，合计 $O(n^2)$。`min` 扫描是朴素实现的瓶颈，也是堆优化要消掉的部分。

## 五、与其他技术对比

| 算法 | 数据结构 | 时间 | 最适合 | 额外能力 |
|------|----------|------|--------|----------|
| 朴素 Prim | 邻接矩阵 | $O(V^2)$ | 稠密图 | 实现最简 |
| 堆优化 Prim | 邻接表+二叉堆 | $O((V+E)\log V)$ | 稀疏图 | 可扩展 Dijkstra |
| Kruskal | 边表+并查集 | $O(E\log E)$ | 稀疏图/边列表 | 易流式/分布式 |
| Boruvka | 并查集 | $O(E\log V)$ | 并行/超大图 | 天然并行 |
| 斐波那契堆 Prim | 高级堆 | $O(E+V\log V)$ | 理论最优 | 常数大，少用 |

选型：$E \approx V^2$ 用朴素 Prim（常数极小）；$E \ll V^2$ 用堆 Prim 或 Kruskal；并行/分布式用 Boruvka 或 Filter-Kruskal。

## 六、常见误区

1. **用 0 表示「无边」。** 若合法边权可为 0（如免费链路），矩阵里 `0` 既表示无边又表示零权边会彻底搞错。必须用 `inf`（或单独邻接表）表示无边。
2. **把选中点的 `key` 加到 total 时算错起点。** 起点 `key[start]=0`，累加无妨；但若起点 `key` 留 `inf` 或累加了「入树边的 key」与「实际边权」不一致，总权会偏。
3. **认为 Prim 与 Kruskal 算出的边集一定相同。** 权互异时 MST 唯一，边集相同；权有相等时，总权相同但边集可能不同。
4. **图不连通时直接崩。** 朴素 Prim 会选不出 $u$，应检测并返回最小生成森林或报错，而不是死循环/越界。
5. **把 Prim 写成 Dijkstra 的「距离累加」。** `key[v]` 是到树的**边权**，不是路径和；误用累加会得到错误的「最小瓶颈」以外的结构。
6. **重边未取最小。** 邻接矩阵天然覆盖（取 `min`），邻接表则要在建图时保留最小边或松弛时用 `min`。

## 七、与开源书/权威来源对应

- Cormen et al., *Introduction to Algorithms* (CLRS), Ch. 23.2 The algorithms of Prim and Kruskal（切割引理、贪心 MST）。
- Sedgewick & Wayne, *Algorithms* 4th ed., §4.3 Minimum Spanning Trees（Prim 的 eager/lazy 实现）。
- Tarjan, R. *Data Structures and Network Algorithms*（MST 与并查集复杂度）。
- GitHub：`TheAlgorithms/Python` 的 `graphs/minimum_spanning_tree.py`、`kamyu104/LeetCode` 图论模板可对照。

## 八、面试题

**1. 陈述切割性质并用它证明 Prim 正确。**
参考答案：切割的最小横边必在某 MST 中（交换论证）。Prim 每次选的 `key` 最小点对应当前切割的最小横边，故可安全并入；归纳得整棵树是 MST。

**2. 为什么稠密图用朴素 Prim 而不是 Kruskal？**
参考答案：朴素 Prim $O(V^2)$ 与 $E$ 无关；Kruskal 要 $O(E\log E)$，$E\approx V^2$ 时 $O(V^2\log V)$ 更慢，且排序常数大。矩阵实现缓存友好，常数极小。

**3. 手写朴素 Prim，并处理不连通图。**
参考答案：见上文代码。关键点：`inf` 表示无边；每轮线性找最小；若扫不到未入树点则提前退出并判断 `len(edges) < n-1` 即不连通。

**4. Prim 与 Dijkstra 的区别？**
参考答案：骨架都是「选最小 key + 松弛」。Prim 的 key 是到已选顶点集的最小边权，松弛 `key[v]=min(key[v],w)`；Dijkstra 的 dist 是源点最短路，松弛 `dist[v]=min(dist[v],dist[u]+w)`。实现可共用框架，语义与正确性前提不同（Dijkstra 要求非负权）。

## 九、演进与趋势

- **堆优化与懒删除**：二叉堆把选点降到 $O(\log V)$，工程默认；斐波那契堆理论 $O(E+V\log V)$ 但常数大，几乎不用。
- **与 Dijkstra 的统一模板**：生产图库（Boost、LEMON、NetworKit）常把 Prim/Dijkstra 写成同一优先队列框架。
- **近似与分布式**：MST 是 TSP 2 近似、聚类与网络设计的基础；分布式 MST（Gallager-Humblet-Spira）与并行 Boruvka 用于数据中心网络规划。
- **动态 MST**：边权变化时维护 MST（Holm–de Lichtenberg–Thorup 等）是数据结构研究热点，服务于动态网络。
- **工程位置**：理解朴素 $O(V^2)$ 是所有 MST 优化的基线；面试手写、竞赛小规模稠密图、以及「证明贪心正确」都以它为锚点。

## 十、小结

朴素 Prim 每轮线性选出离当前树最近的顶点并松弛邻居，$O(V^2)$ 求出 MST；切割性质（交换论证）保证贪心最优。它是理解堆优化 Prim、Kruskal 与整个 MST 理论的起点，也是稠密图上的实用选择。
