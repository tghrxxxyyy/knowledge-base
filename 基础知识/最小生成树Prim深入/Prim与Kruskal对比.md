# Prim与Kruskal对比

> 对应 CLRS 第 23 章两算法对比；Sedgewick《Algorithms》第 4.3 节选择建议；网络流与图算法工程实践综述。

## 一、背景与挑战

最小生成树有两个几乎同等地位的经典解法：Prim「从点长树」，Kruskal「从边选边」。教科书常常各讲一遍便结束，但工程选型却有现实差异：同样 $10^6$ 顶点的图，邻接矩阵存不存得下？边列表排一遍序会不会成为瓶颈？要不要在分布式环境各算一块再合并？面试里也常被追问「到底哪个快」「为什么结果不一样（或一样）」。

更深层的挑战是：两者都基于贪心，都依赖切割性质，为什么复杂度形态不同？**Prim 的代价主要在「找最近的未入点」**，**Kruskal 的代价主要在「全局排序」**。图的稠密度 $E/V^2$ 直接决定谁更优；输入是矩阵还是边列表也影响常数。本文系统对比机制、复杂度、实现与选型，并给出可运行对照代码。

## 二、核心原理

**Prim：点增量。** 维护已生成树顶点集 $S$，每步选离 $S$ 最近的顶点并入。关键操作：

- 选点：朴素线性扫 $O(V)$ / 二叉堆 $O(\log V)$；
- 松弛：更新邻居 `key`。

它天然适合**邻接表/矩阵**，适合「从源点长树」「增量加点」，也容易与 Dijkstra 共用模板。对稠密图，$O(V^2)$ 与 $E$ 无关，是理论与实测双优。

**Kruskal：边增量。** 全局按权排序边，用并查集判环，两端不连通则收边。关键操作：

- 排序：$O(E\log E)$，是主要成本；
- 判环：并查集 $O(\alpha)$。

它适合**边列表**、离线批处理、流式输入（边排序后可一遍扫完）、分布式（分片排序 + 并查集合并）。对稀疏图 $E=O(V)$，总代价 $O(V\log V)$，与堆 Prim 打平甚至更好写。

**共同点：切割性质。** 二者都是「每次选横跨某切割的最小边」，因此都是 MST，且**总权相同**。权互异时边集也相同；权有相等时边集可能不同但总权相等（见唯一性篇）。

**差异本质。**

| 维度 | Prim | Kruskal |
|------|------|---------|
| 增长单位 | 顶点 | 边 |
| 数据结构 | 邻接 + 优先队列 | 排序 + 并查集 |
| 主成本 | 选点/松弛 | 全局排序 |
| 稠密图 | $O(V^2)$ 优 | $O(V^2\log V)$ 差 |
| 稀疏图 | $O((V+E)\log V)$ | $O(E\log E)$ |
| 在线增量 | 易 | 需重跑或动态 MST |
| 并行 | 难 | 中（Filter-Kruskal） |
| 分布式 | 难 | 易 |

**输入形态如何影响选型。** 若图以邻接矩阵给出（例如稠密的距离矩阵、相似度矩阵），朴素 Prim 可直接原地读取，既省去建边表的 $O(V^2)$ 拷贝，又能连续扫描内存，实测常数极小。若图以边列表给出（例如 CSV 导出的链路表、爬虫抓到的引用边），Kruskal 只需排序 + 一遍扫，无需重建邻接结构。若图以邻接表给出且需要从源点增量长树（例如模拟网络逐步铺设），堆优化 Prim 更顺手。工程上还常考虑内存占用：邻接矩阵是 $O(V^2)$，亿级顶点根本存不下，此时只能走边列表路线，即 Kruskal 或 Boruvka。

**常数与缓存。** 渐进复杂度之外，实际性能常被缓存行为主导。朴素 Prim 的两层循环访问矩阵是局部连续的，分支预测友好；Kruskal 的排序是随机访问比较，但现代并行基数排序可把整型权值排序压到线性；堆 Prim 的堆操作指针跳转多，小图上可能反而不如朴素 Prim。因此「理论同阶」的堆 Prim 与 Kruskal，往往要靠基准测试定夺，而不是只看 $O$ 记号。

**增量与动态场景。** 若图随时间缓慢增边，Prim 可以保留已有树，对新点/新边做局部松弛；Kruskal 若要支持动态 MST，需要重跑或借助动态 MST 数据结构（如 Eppstein、HDLT）。若图是批量一次性给出的静态图，则两者都可以直接全量计算，选型回到密度与实现成本。

## 三、形式化与数学基础

**复杂度对比（$n=V$, $m=E$）。**

朴素 Prim：

$$T_P^{\text{naive}} = O(n^2).$$

堆 Prim：

$$T_P^{\text{heap}} = O((n+m)\log n).$$

Kruskal：

$$T_K = O(m\log m) = O(m\log n).$$

**临界点。** 当 $m = \Theta(n^2)$（稠密），

$$T_P^{\text{naive}} = O(n^2),\quad T_K = O(n^2\log n),\quad T_P^{\text{heap}} = O(n^2\log n).$$

朴素 Prim 胜。当 $m = \Theta(n)$（稀疏），

$$T_P^{\text{naive}} = O(n^2),\quad T_P^{\text{heap}} = O(n\log n),\quad T_K = O(n\log n).$$

堆 Prim 与 Kruskal 同阶，常数与实现决定胜负。

**更细的比较。** 假设 $m = n\cdot d$（平均度 $d$）：

- 堆 Prim：$O((n + nd)\log n) = O(nd\log n)$；
- Kruskal：$O(nd\log n)$（排序主导）。

排序常数较大（比较 + 内存随机访问），所以**实现良好时堆 Prim 在中等稀疏图常更快**；但 Kruskal 代码更短、更易验证，边已有序或可并行排序时 Kruskal 反超。

**结果等价性证明。** 设 $T_P, T_K$ 为两算法得到的树。由切割性质，二者都是 MST，故 $w(T_P)=w(T_K)$。若边权互异，MST 唯一，$T_P=T_K$；否则可通过交换论证证明边集可能不同但权相等。

**与 Boruvka 的三角关系。** Boruvka 每轮各分量选最小出边，$O(m\log n)$ 且易并行，可视为「并行 Kruskal」；Filter-Kruskal = Boruvka 预处理 + Kruskal 收尾。

## 四、代码实现

同一图分别用朴素 Prim / 堆 Prim / Kruskal 求 MST，验证总权一致：

```python
import heapq


def prim_naive_matrix(graph):
    """graph: n x n，INF 表示无边"""
    n = len(graph)
    INF = float("inf")
    key = [INF] * n
    key[0] = 0
    in_mst = [False] * n
    total = 0
    for _ in range(n):
        u, best = -1, INF
        for i in range(n):
            if not in_mst[i] and key[i] < best:
                u, best = i, key[i]
        if u == -1:
            break
        in_mst[u] = True
        total += best
        for v in range(n):
            if not in_mst[v] and graph[u][v] < key[v]:
                key[v] = graph[u][v]
    return total


def prim_heap_adj(adj):
    """adj: 邻接表"""
    n = len(adj)
    vis = [False] * n
    pq = [(0, 0)]
    total = 0
    while pq:
        d, u = heapq.heappop(pq)
        if vis[u]:
            continue
        vis[u] = True
        total += d
        for v, w in adj[u]:
            if not vis[v]:
                heapq.heappush(pq, (w, v))
    return total


def kruskal_edges(n, edges):
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
            ra, rb = rb, ra
        parent[rb] = ra
        if rank[ra] == rank[rb]:
            rank[ra] += 1
        return True

    total = 0
    for u, v, w in sorted(edges, key=lambda e: e[2]):
        if union(u, v):
            total += w
    return total


def choose(n, m):
    """工程选型建议（启发式）"""
    if m > n * n // 4:
        return "prim_naive"
    return "kruskal_or_prim_heap"


if __name__ == "__main__":
    INF = float("inf")
    g = [
        [0, 1, INF, 4],
        [1, 0, 3, 2],
        [INF, 3, 0, 5],
        [4, 2, 5, 0],
    ]
    adj = [[] for _ in range(4)]
    edges = []
    for i in range(4):
        for j in range(4):
            if g[i][j] != INF and i != j:
                adj[i].append((j, g[i][j]))
                if i < j:
                    edges.append((i, j, g[i][j]))
    a = prim_naive_matrix(g)
    b = prim_heap_adj(adj)
    c = kruskal_edges(4, edges)
    print(a, b, c)          # 6 6 6
    assert a == b == c == 6
    print(choose(4, len(edges)))
```

## 五、与其他技术对比

| 算法 | 时间 | 适合 | 优点 | 缺点 |
|------|------|------|------|------|
| 朴素 Prim | $O(V^2)$ | 稠密、矩阵 | 常数小、实现短 | 稀疏图慢 |
| 堆 Prim | $O((V+E)\log V)$ | 稀疏、邻接表 | 在线、可增量 | 堆实现略繁 |
| Kruskal | $O(E\log E)$ | 稀疏、边列表 | 最简、易并行 | 排序贵、稠密差 |
| Boruvka | $O(E\log V)$ | 并行、超大图 | 天然并行 | 轮次开销 |
| 斐波那契堆 Prim | $O(E+V\log V)$ | 理论 | 渐进最优 | 常数大、少用 |
| Filter-Kruskal | 实测优 | 分布式/超大图 | 混合优势 | 实现较繁 |

**结果一致性**：所有算法给出相同总权；权互异时边集唯一相同。

## 六、常见误区

1. **认为 Prim 与 Kruskal 结果一定不同（或一定相同）。** 总权一定相同；边集是否相同取决于权是否互异。这是面试高频坑。
2. **用「顶点数」判断谁快，忽略边密度。** 关键指标是 $E/V^2$ 与输入表示；$E$ 未知时先估平均度。
3. **Kruskal 忘记并查集路径压缩。** 表面上能跑出正确结果，大数据超时。
4. **把 Prim 的 key 当最短路距离。** 与 Dijkstra 混淆会用累加松弛，得到错误结构。
5. **在稠密图上盲目用堆 Prim。** 堆常数大，$E=\Theta(V^2)$ 时 $O(V^2\log V)$ 不如朴素 $O(V^2)$。
6. **忽略图不连通时的语义。** 两者都返回最小生成森林；需要「必须连通」时先查并查集连通分量是否为 1。

## 七、与开源书/权威来源对应

- Cormen et al., *Introduction to Algorithms*, Ch. 23（贪心 MST、Prim 与 Kruskal、切割与环性质）。
- Sedgewick & Wayne, *Algorithms* 4th ed., §4.3（选型建议与代码对比）。
- Tarjan, *Data Structures and Network Algorithms*（复杂度）。
- GitHub：`networkx/algorithms/tree/minimum_spanning_tree.py`、`boost/graph/kruskal_min_spanning_tree.hpp`。

## 八、面试题

**1. Prim 和 Kruskal 怎么选？**
参考答案：看图稠密度与输入形态。稠密矩阵 → 朴素 Prim；稀疏邻接表 → 堆 Prim 或 Kruskal；边列表/离线/要并行 → Kruskal；要在线长树 → Prim。

**2. 两算法结果是否相同？**
参考答案：总权相同。权互异时 MST 唯一，边集也相同；权有相等时边集可能不同，但总权相等。

**3. 为什么 Prim 稠密图更快？**
参考答案：朴素 Prim $O(V^2)$ 不随 $E$ 增长；Kruskal 与堆 Prim 在 $E=\Theta(V^2)$ 时都有 $\log$ 因子，且排序/堆常数大。

**4. 能否在同一个函数里用 $E$ 大小自动切换？**
参考答案：可以。启发式：若 $E > c V^2$ 用朴素 Prim，否则 Kruskal 或堆 Prim；生产库常按「矩阵 vs 边列表」接口让用户自选，或运行时估密度。

## 九、演进与趋势

- **混合算法**：Filter-Kruskal、Boruvka + Kruskal 分阶段，兼顾并行与简单。
- **并行图框架**：GraphX、GraphIt、NetworKit 把 MST 作为模板算子，按图规模自动调度 Prim/Kruskal/Boruvka。
- **动态 MST**：边权变化时维护 MST（Eppstein、HDLT）用于网络仿真与增量拓扑。
- **NVM/GPU**：内存带宽成为瓶颈后，常数与顺序访问比渐进复杂度更重要；边排序的并行 radix sort 使 Kruskal 在现代硬件上重新有竞争力。
- **教学与面试**：两者对比仍是图论必考；近年更强调「切割性质统一视角」与「实现选型」，而非死记复杂度。

## 十、小结

Prim 与 Kruskal 共享切割性质、给出相同 MST 总权，但成本形态不同：Prim 靠选点（稠密图 $O(V^2)$ 最优），Kruskal 靠排序（稀疏图/边列表/并行友好）。理解稠密度、输入结构与实现常数，才能在工程与面试中给出有说服力的选型。
