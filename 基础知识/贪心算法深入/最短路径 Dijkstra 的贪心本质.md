# 最短路径 Dijkstra 的贪心本质

> 对应 Edsger W. Dijkstra, *A Note on Two Problems in Connexion with Graphs*, Numerische Mathematik, 1959；与 CLRS 第 24.3 节、Sedgewick & Wayne《Algorithms》。

## 一、背景与挑战

单源最短路径是图算法的"水电煤"：导航算路、网络路由（OSPF 链路状态）、BGP 度量、机器人规划、游戏寻路都依赖它。给定有向图 $G=(V,E,w)$ 与源点 $s$，要求 $\delta(s,v)$（$s$ 到 $v$ 的最短距离）与路径。边权可负时问题变难（Bellman-Ford、SPFA、差分约束），非负时 Dijkstra 以 $O((V+E)\log V)$ 成为事实标准。

难点在于**贪心为何正确**。朴素"每次走最短出边"是错的（局部最短不是全局最短）；"每次把距离最小的未确定点定下来"才是 Dijkstra。负权会破坏"出堆即确定"：已经确定的点可能因为后面的负边被更新，导致答案错。另一个工程难点是优先队列实现：朴素数组 $O(V^2)$、二叉堆 $O((V+E)\log V)$、斐波那契堆 $O(E+V\log V)$ 理论最优但常数大、Radix Heap 在整数权时更快。

面试里 Dijkstra 是"贪心 + 堆"的标准题：为什么非负、为什么出堆即确定、复杂度怎么来、与 BFS/Bellman-Ford 的分界、如何打印路径、A* 与双向 Dijkstra 的优化。答错"负权也能用"或忘记懒删除（`d > dist[u]` 跳过）会直接挂。

工程落地还有几层细节容易被低估。一是图的规模：城市级路网上千万节点，朴素 $O(V^2)$ 扫数组不可接受，必须堆优化，甚至上 Contraction Hierarchies 这类预处理；二是查询延迟：导航要求毫秒级返回，双向搜索、目标点提前终止、缓存热点路径都是标配；三是权重语义：时间、费用、距离、跳数是不同的权，改一次权就要重算（或用 CRP 定制化路由）。理解算法骨架只是起点，选对数据结构与预处理才是性能关键。

## 二、核心原理

**算法骨架**：维护距离估计 $dist[v]$ 与已确定集合 $S$。初始 $dist[s]=0$，其余 $\infty$。每步从 $V\setminus S$ 中取 $dist$ 最小的点 $u$，把 $u$ 加入 $S$（其距离被确定为最终值），并**松弛** $u$ 的出边：若 $dist[u]+w(u,v) < dist[v]$ 则更新。

**贪心选择**：每次取"当前估计距离最小的未确定点"。直觉是：经由其他未确定点绕路只会更长（非负权），所以当前最小的那个不可能再被改小。

**出堆即确定（关键不变量）**：$u$ 出堆时 $dist[u] = \delta(s,u)$。证明用反证：若存在更短路径 $s \rightsquigarrow x \to y \rightsquigarrow u$ 使 $\delta < dist[u]$，设 $x$ 是路径上第一个不在 $S$ 的点，则 $dist[x] \le \delta(s,x) \le \delta(s,u) < dist[u]$，与"每次取最小"矛盾（$x$ 应先于 $u$ 被取出）。

**松弛的最优子结构**：最短路的子路径也是最短路（无负环时）。$dist[v]$ 维护"当前已知最短"，每次用 $u$ 改进。

**懒删除**：堆中同一 $v$ 可能有多个条目（旧的较大距离）。出堆时若 $d > dist[v]$ 跳过。这保证摊还正确，不必支持 decrease-key。

**负权为何失败**：出堆后 $u$ 可能被负边更新，"确定"失效。反例：$s\to a$ 权 2，$s\to b$ 权 5，$b\to a$ 权 $-4$。Dijkstra 先确定 $a$ 为 2，但真实最短是 $s\to b\to a = 1$。故负权用 Bellman-Ford。

**与 BFS 的统一视角**：把边权全看成 1，优先队列退化为普通队列，Dijkstra 就是 BFS。权为 0/1 时可用双端队列 0-1 BFS（0 权推队首、1 权推队尾），$O(V+E)$ 且无堆开销。权为小整数时可用 Dial/桶队列（Radix Heap），常数更优。

**边界条件**：不可达点保持 $\infty$；自环非负可忽略；重边取最小；路径重建用 parent 数组；零权边不影响正确性；源点到自身距离为 0；图为空或 $n=1$ 时直接返回。实现上还要注意：有向边只 `adj[u].append((v,w))`，无向图才两边都加；Python 中 `float('inf')` 比较安全，C++ 要用 `LLONG_MAX/2` 防加法溢出。

**变体**：A* 加启发 $h(v)$，估价 $f = g+h$，$h$ 可采纳（不高估）则最优；双向 Dijkstra 从两端相遇；目标点单收时可提前终止；大图用 Contraction Hierarchies、ALT 等预处理加速。

## 三、形式化与数学基础

**贪心正确性**：设 $S_k$ 为第 $k$ 次确定后的集合。断言 $\forall u \in S_k,\ dist[u]=\delta(s,u)$。归纳：$S_0=\{s\}$ 成立。设 $u$ 为下一个取出的点（$dist[u]$ 最小）。任一 $s\to u$ 路径离开 $S$ 的第一条边为 $(x,y)$，$x\in S, y\notin S$。则
$$\delta(s,u) \ge \delta(s,x)+w(x,y) \ge dist[x]+w(x,y) \ge dist[y] \ge dist[u]$$
（非负权保证绕路不短）。故 $\delta(s,u) = dist[u]$。

**复杂度**：
- 朴素（数组取最小）：$O(V^2 + E)$；
- 二叉堆：$O((V+E)\log V)$（每边可能入堆一次，每点出堆）；
- 斐波那契堆：$O(E + V\log V)$（decrease-key 摊还 $O(1)$）。

空间 $O(V+E)$。

**与 BFS 的关系**：边权全为 1 时 Dijkstra 退化为 BFS；双端队列 0-1 BFS 处理权 0/1，$O(V+E)$。

**差分约束**：$x_j - x_i \le w$ 可转成边 $i\to j$ 权 $w$，求最短路即解约束系统；有负环则无解。

**最短路 DAG 与多解**：最短路可能不唯一。按 $dist$ 值对边 $(u,v)$ 检查 $dist[u]+w(u,v)=dist[v)$，得到的子图是 DAG（距离严格递增），其上任一 $s\to t$ 路径都是最短路。要字典序最小的最短路，松弛时用 $(dist, path)$ 的字典序比较。

**与 Prim 的形似与神离**：两者都是"堆 + 最近点扩展"，但 Prim 的键是到树的单边权，Dijkstra 的键是到源点的路径权累加。混用会算错：Prim 不能求最短路，Dijkstra 不能求 MST（反例：三点三角，边权 1、1、3）。

**近似保证**：非负权下 Dijkstra 精确最优；带启发的 A* 在可采纳启发下仍最优，否则得到有界次优。

## 四、代码实现

```python
import heapq


def dijkstra(n, edges, src, dst=None):
    """
    非负权单源最短路。edges: [(u, v, w)] 有向。
    返回 (dist, parent)。dst 非 None 时可提前终止。
    """
    adj = [[] for _ in range(n)]
    for u, v, w in edges:
        if w < 0:
            raise ValueError("Dijkstra requires non-negative weights")
        adj[u].append((v, w))

    dist = [float("inf")] * n
    parent = [-1] * n
    dist[src] = 0
    pq = [(0, src)]
    done = [False] * n

    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:      # 懒删除: 过期条目
            continue
        done[u] = True
        if dst is not None and u == dst:
            break
        for v, w in adj[u]:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                parent[v] = u
                heapq.heappush(pq, (dist[v], v))

    return dist, parent


def shortest_path(n, edges, src, dst):
    dist, parent = dijkstra(n, edges, src, dst)
    if dist[dst] == float("inf"):
        return float("inf"), []
    path = [dst]
    while path[-1] != src:
        path.append(parent[path[-1]])
    path.reverse()
    return dist[dst], path


def dijkstra_undirected(n, edges, src):
    """无向图版本"""
    adj = [[] for _ in range(n)]
    for u, v, w in edges:
        adj[u].append((v, w))
        adj[v].append((u, w))
    dist = [float("inf")] * n
    dist[src] = 0
    pq = [(0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        for v, w in adj[u]:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                heapq.heappush(pq, (dist[v], v))
    return dist


def bellman_ford(n, edges, src):
    """对照: 可含负权的最短路（检测负环）"""
    dist = [float("inf")] * n
    dist[src] = 0
    for _ in range(n - 1):
        updated = False
        for u, v, w in edges:
            if dist[u] != float("inf") and dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                updated = True
        if not updated:
            break
    for u, v, w in edges:
        if dist[u] != float("inf") and dist[u] + w < dist[v]:
            raise ValueError("negative cycle detected")
    return dist


if __name__ == "__main__":
    edges = [(0, 1, 1), (1, 2, 2), (0, 2, 5)]
    dist, parent = dijkstra(3, edges, 0)
    assert dist == [0, 1, 3]
    d, path = shortest_path(3, edges, 0, 2)
    assert d == 3 and path == [0, 1, 2]

    # 负权反例: Dijkstra 会错, Bellman-Ford 对
    neg = [(0, 1, 2), (0, 2, 5), (2, 1, -4)]
    try:
        dijkstra(3, neg, 0)
        assert False
    except ValueError:
        pass
    bf = bellman_ford(3, neg, 0)
    assert bf[1] == 1  # 0->2->1 = 1

    # 不可达
    d2, _ = dijkstra(3, [(0, 1, 1)], 0)
    assert d2[2] == float("inf")
    print("all tests passed")
```

## 五、与其他技术对比

| 维度 | Dijkstra | BFS | Bellman-Ford | SPFA | A* |
|---|---|---|---|---|---|
| 权值 | 非负 | 全 1 | 可负 | 可负 | 非负+启发 |
| 复杂度 | $O((V+E)\log V)$ | $O(V+E)$ | $O(VE)$ | 期望快最坏差 | 依赖 $h$ |
| 负环 | 不支持 | 不适用 | 可检测 | 可检测 | 不支持 |
| 用途 | 导航、路由 | 无权 | 差分约束 | 竞赛常数优 | 寻路 |

取舍：**非负权用 Dijkstra + 堆**；**无权用 BFS**；**负权用 Bellman-Ford/SPFA**；**已知终点且有启发用 A\***；**大图静态路网用 CH/ALT 预处理**。

## 六、常见误区

1. **在含负权图上用 Dijkstra**：出堆确定失效，结果可错。必须非负，或改 Bellman-Ford。
2. **忘记懒删除跳过过期堆条目**：同一节点多次入堆导致超时或错误松弛。出堆时 `if d > dist[u]: continue`。
3. **数组实现当 $E$ 很小时仍用堆**：稀疏小图朴素 $O(V^2)$ 可能更慢常数；要按密度选实现。
4. **路径重建只存 dist 不存 parent**：无法输出路线，只能给距离。
5. **0-1 BFS / 双向优化误用**：权只有 0/1 才用双端队列；双向 Dijkstra 需处理相遇判断，实现细节多，别随手套。

## 七、与开源书/权威来源对应

- Dijkstra 1959, *A Note on Two Problems in Connexion with Graphs*, Numerische Mathematik：原始论文。
- CLRS 第 24.3 节：Dijkstra 正确性证明与复杂度。
- Sedgewick & Wayne, *Algorithms* 4.4：最短路径族与堆优化实现。
- Fredman & Tarjan 1984：Fibonacci heaps 与 $O(E+V\log V)$ 界。

## 八、面试题

**1. Dijkstra 为什么要求非负权？**  
非负才能保证"当前最小的未确定点不可能再被改进"。负边可能在确定后更新该点，贪心失效。反例：$s\to a=2, s\to b=5, b\to a=-4$。

**2. 如何用优先队列实现 $O((V+E)\log V)$？**  
二叉堆存 `(dist, v)`，松弛时 push 新估计；出堆若 `d > dist[v]` 跳过（懒删除）。每边至多入堆一次量级，总 $O((V+E)\log V)$。

**3. 如何输出最短路径本身？**  
松弛成功时记录 `parent[v] = u`。到达终点后沿 parent 回溯到源点再反转。

**4. 与 Bellman-Ford 如何选择？**  
边权非负 → Dijkstra（快）；可能负权或需检测负环 → Bellman-Ford/SPFA。竞赛中 SPFA 期望快但最坏 $O(VE)$，要注意卡 SPFA 的数据。

## 九、演进与趋势

Dijkstra 的工程谱系很宽：**A\*、IDA\*** 用于游戏与机器人；**双向 Dijkstra、ALT、Contraction Hierarchies、Customizable Route Planning** 支撑地图导航毫秒级；**OSPF/IS-IS** 链路状态路由直接跑 Dijkstra；**多源、时变、时间窗**（交通）是研究热点；**动态图最短路**、**近似最短路**、**并行/分布式 Dijkstra（Δ-stepping）** 应对超大图；**学习型 A\*** 用神经网络学启发函数。GPU 图计算（Gunrock）与向量化堆也在演进。

实际系统还有一串"算法之外"的演进：路由协议把 Dijkstra 嵌进洪泛与 LSA 更新，做增量 SPF，只重算受影响区域；导航引擎用分层图（高速优先）与收缩层级把查询压到亚毫秒；游戏寻路常用 JPS（Jump Point Search）在均匀网格上跳过冗余扩展；网络测量里权重随 RTT 动态变化，需要限速重算防止震荡。这些实现都保留"贪心确定最近点"的内核，只在外围做加速、稳定化与增量维护。

## 十、小结

Dijkstra 的本质是"每次贪心确定当前估计距离最小的点"，非负权保证出堆即最终最短，懒删除堆实现 $O((V+E)\log V)$。它是导航与路由的基石；认清负权的边界与堆细节，再延伸到 A* 与预处理加速，就能覆盖从面试到工业路网的全部场景。
