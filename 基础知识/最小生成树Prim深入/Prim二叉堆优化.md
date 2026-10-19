# Prim二叉堆优化

> 对应 CLRS《Introduction to Algorithms》第 23.2 节 Prim 的堆实现；Sedgewick《Algorithms》第 4.3 节 lazy/eager Prim；Fredman & Tarjan 关于斐波那契堆的讨论。

## 一、背景与挑战

朴素 Prim 用邻接矩阵 + 线性扫描选最小 `key`，时间 $O(V^2)$，在稠密图上很优秀。但现代图几乎都是**稀疏**的：社交网络、道路网、引用网、微服务调用图，$|E|=O(V)$ 甚至更小。此时 $O(V^2)$ 会做大量无效扫描——$10^6$ 个点的稀疏图，朴素实现要 $10^{12}$ 次操作，完全不可接受。

我们需要把「选最小 key」从 $O(V)$ 降到 $O(\log V)$，并只在真正有边的地方松弛。这就是**二叉堆（优先队列）优化的 Prim**：把候选顶点放进最小堆，按当前 `key` 排序；每次弹出最小者并入树。稀疏图下总时间 $O((V+E)\log V)$，与 Kruskal 同量级，但更适合已有邻接表、需要增量长树的场景。

堆优化 Prim 也是面试手写 MST 的高频题：它同时考察优先队列、懒删除、松弛逻辑，以及「为什么每个点最多有效弹出一次」。理解它之后，斐波那契堆的 $O(E+V\log V)$ 只是「换一个更快的优先队列」，Dijkstra 的堆优化更是几乎逐行照搬。

## 二、核心原理

**结构。** 图用邻接表 `graph[u] = [(v, w), ...]`；维护：

- `dist[v]`（或 `key[v]`）：$v$ 到已生成树的最小边权；
- `pq`：最小堆，元素为 `(key[v], v)`；
- `in_mst[v]`：是否已确定入树。

**主循环（懒删除版本，工程最常用）。**

1. 初始 `(0, start)` 入堆，`dist[start]=0`。
2. 当堆非空：弹出 `(d, u)`。
   - 若 `in_mst[u]` 已为真，**跳过**（这是「懒删除」：堆里可能有同一顶点的过期条目）。
   - 否则标记 `in_mst[u]=True`，把 $d$ 计入总权，枚举 $u$ 的邻边 `(v,w)`：若 `v` 未入树且 `w < dist[v]`，更新 `dist[v]=w` 并把 `(w,v)` **新推入堆**（不删旧条目）。

**为什么叫「懒删除」。** 真正的 decrease-key 需要在堆中定位并上浮，二叉堆虽支持但代码繁琐且常数大。实用技巧是**允许多个条目共存**，弹出时用 `in_mst` 过滤过期项。每个顶点可能入堆多次（每次松弛成功都 push），但**有效弹出**（真正标记入树）恰好一次。

**eager 版本。** 每个顶点在堆中只保留一份，松弛时 decrease-key。需要 `heap` + `index` 映射，或可删除堆；理论更干净，工程少用。

**正确性。** 与朴素 Prim 完全一致：弹出的 `key` 最小未入树点，对应切割 $(S, V\setminus S)$ 的最小横边，由切割性质属于 MST。堆只改变了「找最小」的数据结构，不改变贪心选择。

**边界条件。** 起点入堆权 0；不连通图在堆空时若入树点 $<V$ 则为最小生成森林；负权？MST 允许负权，堆不受影响（对比 Dijkstra 不允许负权）；重边/自环在建图或松弛时用 `min` 处理；必须用 `in_mst` 过滤，否则同一顶点会重复计入总权、树变环。

## 三、形式化与数学基础

**复杂度推导。**

- 初始化：$O(V)$（或 $O(1)$ 若只 push 起点）。
- 每条边至多触发一次松弛尝试：$O(E)$ 次 `heappush`（每次成功松弛 push 一条）。
- 每个 `heappush`/`heappop` 代价 $O(\log H)$，堆大小 $H \le O(V + E_{\text{push}})$，故 $O(\log V)$（因为 $\log(V+E)=O(\log V)$ 当 $E=O(V^2)$）。

$$T = O((V+E)\log V).$$

对比：

| 实现 | 时间 | 备注 |
|------|------|------|
| 朴素矩阵 | $O(V^2)$ | 稠密图最优 |
| 二叉堆 | $O((V+E)\log V)$ | 稀疏图实用 |
| 斐波那契堆 | $O(E + V\log V)$ | 理论最优，常数大 |
| Boruvka | $O(E\log V)$ | 可并行 |

**懒删除的均摊。** 若每条边最多 push 一次，则 push 总数 $O(E)$，pop 总数 $O(E)$，故堆操作 $O(E\log V)$。即使 push 多于边数（多点松弛同一顶点），通常仍近线性。最坏（完全图）时懒删除退化为 $O(E\log E)$，与 Kruskal 相当。

**与 Dijkstra 同构。** 堆 Dijkstra 疏松弛 `dist[v]=min(dist[v], dist[u]+w)`，同样用懒删除；二者的堆框架可抽象为 `push/pop/visited` 三件套。

**下界。** 比较模型下 MST 的时间下界为 $\Omega(E\alpha(V))$（与并查集相关）；二叉堆 Prim 已接近实用下界，再优化多半靠缓存与并行。

## 四、代码实现

完整可运行的堆优化 Prim（懒删除），含边集输出与不连通检测：

```python
import heapq


def prim_heap(graph, start=0):
    """
    graph: 邻接表，graph[u] = [(v, w), ...]，无向图两侧都要建边
    返回 (总权, 边列表 [(u,v,w),...])，若不连通则边数 < n-1
    """
    n = len(graph)
    visited = [False] * n
    parent = [-1] * n
    # (key, vertex) 最小堆；key 是到当前 MST 的最小边权
    pq = [(0, start)]
    total = 0
    used = 0

    while pq:
        d, u = heapq.heappop(pq)
        if visited[u]:
            continue          # 懒删除：跳过过期条目
        visited[u] = True
        total += d
        used += 1
        for v, w in graph[u]:
            if not visited[v]:
                # 注意：这里是「插入新条目」而非 decrease-key
                heapq.heappush(pq, (w, v))
                parent[v] = u   # 可能被后来的更小 w 覆盖，等价于松弛

    edges = [(parent[v], v, None) for v in range(n) if parent[v] != -1]
    # 补全边权（若需要）
    wmap = {(min(u, v), max(u, v)): w for u in range(n) for v, w in graph[u]}
    edges = [(u, v, wmap[(min(u, v), max(u, v))]) for u, v, _ in edges]
    return total, edges, used == n


if __name__ == "__main__":
    # 0-1, 0-2(4), 1-2(2), 1-3(5), 2-3(1)  => MST = 1+2+1 = 4
    g = [[] for _ in range(4)]
    def add(u, v, w):
        g[u].append((v, w))
        g[v].append((u, w))
    add(0, 1, 1)
    add(0, 2, 4)
    add(1, 2, 2)
    add(1, 3, 5)
    add(2, 3, 1)
    total, edges, connected = prim_heap(g, 0)
    print("MST total =", total, "connected =", connected)
    assert total == 4 and connected
```

要点注释：`visited` 过滤使每个点只计入一次；`parent` 在松弛时更新，可能被更小权覆盖，这与「key 下降」一致；若要严格的 eager 版，需在堆中 decrease-key 或用 `(key, v, version)` 计数器。

## 五、与其他技术对比

| 维度 | 堆 Prim | 朴素 Prim | Kruskal | Boruvka |
|------|---------|-----------|---------|---------|
| 时间 | $O((V+E)\log V)$ | $O(V^2)$ | $O(E\log E)$ | $O(E\log V)$ |
| 图表示 | 邻接表 | 邻接矩阵 | 边列表 | 边列表 |
| 稀疏图 | 优 | 差 | 优 | 优 |
| 稠密图 | 一般 | 优 | 较差（排序） | 一般 |
| 实现复杂度 | 中（堆+懒删除） | 低 | 低（并查集） | 中 |
| 并行 | 难 | 难 | 较易 | 天然 |
| 增量/在线 | 可增量长树 | 可 | 需重跑 | 需重跑 |

取舍：已有邻接表且要「从某点长树」→ 堆 Prim；只有边列表、离线批处理 → Kruskal；超大规模并行 → Boruvka；稠密小图 → 朴素 Prim。

## 六、常见误区

1. **忘记懒删除过滤。** 弹出已入树的顶点会重复加 `total`、重复松弛，结果不是树而是「森林+环」，权和偏大或逻辑错乱。`if visited[u]: continue` 一行不能省。
2. **以为必须 decrease-key。** 二叉堆 decrease-key 要额外索引，代码复杂；「push 新条目 + 懒删除」在稀疏图同样高效，是工程默认。
3. **`(w, u)` 元组比较当 `w` 相同。** Python 元组会继续比 `u`（顶点编号），一般无害；但若顶点不可比会报错。可写 `(w, i, u)` 加计数器打破平局。
4. **无向图只建单向边。** `graph[u].append((v,w))` 后必须 `graph[v].append((u,w))`，否则某些点永远到不了，MST 不完整。
5. **把堆优化 Prim 用于负权图时以为会错。** MST 允许负权，堆优化仍然正确；只有 Dijkstra 要求非负。
6. **堆里初始塞满所有点的 `inf`。** 会让懒删除条目爆炸；只 push 起点与松弛成功的点即可。

## 七、与开源书/权威来源对应

- Cormen et al., *Introduction to Algorithms*, Ch. 23.2（Prim 的二叉堆与斐波那契堆实现）。
- Sedgewick & Wayne, *Algorithms* 4th ed., §4.3（lazy Prim 与 eager Prim 代码）。
- Fredman & Tarjan, *Fibonacci heaps and their uses in improved network optimization algorithms*, JACM 1987.
- GitHub：`networkx` 的 `minimum_spanning_tree`、`TheAlgorithms/Python` 的堆 Prim 实现。

## 八、面试题

**1. 手写堆优化 Prim，并解释懒删除。**
参考答案：见上文代码。堆存 `(key, v)`，弹出后若已访问则跳过；否则入树并松弛邻居 push 新条目。懒删除避免 decrease-key 的复杂索引，过期条目在弹出时丢弃。

**2. 堆优化 Prim 的复杂度是多少？每个点会入堆几次？**
参考答案：$O((V+E)\log V)$。每条边至多一次成功松弛即一次 push，故 push $O(E)$；有效 pop 恰 $V$ 次，总 pop $O(E)$。不是「每点只入堆一次」——那是 eager 版。

**3. 为什么 MST 允许负权而 Dijkstra 不允许？**
参考答案：Prim/Kruskal 只比较边权、用切割/环性质，与符号无关；Dijkstra 的贪心依赖「已确定最短路不再被负边推翻」，负权会破坏该不变量。

**4. 如何输出 MST 的边集而不只是总权？**
参考答案：松弛成功时记录 `parent[v]=u`（或记录使 key 最小的边）。注意懒删除下 `parent` 会被更小 key 覆盖，最终记录的是入树时的最小横边，正确。

## 九、演进与趋势

- **斐波那契堆与配对堆**：理论把 Prim 降到 $O(E+V\log V)$，但常数与实现复杂度使工程几乎仍用二叉堆；配对堆在某些 decrease-key 密集场景有优势。
- **整数堆与 vEB**：权值范围小时可用 van Emde Boas 树或桶，选点 $O(\log\log W)$；竞赛中常见 `O(E+V\log V)` 的整数优化。
- **并行与 GPU MST**：堆顺序性限制并行，超大规模转向 Boruvka / Filter-Kruskal；GPU 上用桶 Prim（Δ-stepping 风格）批量选点。
- **增量 MST**：边动态增删时维护 MST（Eppstein 等）比每轮重跑更优，用于网络拓扑仿真。
- **工程现状**：Boost Graph Library、LEMON、NetworKit 的 MST 入口默认二叉堆 Prim 或 Kruskal；可视化教学库则优先朴素实现讲清切割性质。

## 十、小结

二叉堆优化的 Prim 用优先队列把「选最小 key」降到 $O(\log V)$，配合懒删除得到稀疏图 $O((V+E)\log V)$ 的 MST；它与朴素 Prim 共享切割性质正确性，与堆优化 Dijkstra 共享代码骨架，是工程与面试中最实用的 MST 实现。
