# Boruvka算法

> 对应 Borůvka《O jistém problému minimálním》(1926)；Tarjan 关于并行 MST 与 Boruvka 的论述；现代并行图算法（Filter-Kruskal、GraphIt）实践。

## 一、背景与挑战

Prim 与 Kruskal 都是**串行**算法：一步只加入一个顶点或一条边。当图规模到 $10^8$ 边、要吃满多核与分布式集群时，串行贪心就成了瓶颈。我们需要一种**天然并行**的 MST 算法：每一轮，所有连通分量同时工作、同时收缩，轮数只要 $O(\log V)$。

Boruvka 算法（1926 年由 Otakar Borůvka 在研究摩拉维亚电网建设时提出，是最早的 MST 算法，比 Prim/Kruskal 还早）正好满足：每轮让**每个连通分量独立选出一条最小出边**，然后把这些边同时并入并收缩分量。因为每轮分量数至少减半，只需 $O(\log V)$ 轮；每轮扫描所有边 $O(E)$，总时间 $O(E\log V)$，且每轮内可并行、可分布式。

它也是现代超大规模 MST 的基础：**Filter-Kruskal**（先 Boruvka 抽出分量、过滤掉跨分量的大边，再 Kruskal）、GPU MST、分布式 MST 都以 Boruvka 为核心骨架。面试中「Boruvka 为什么每轮分量减半」「如何与 Kruskal 结合」是区分度很高的进阶题。

## 二、核心原理

**算法骨架。**

1. 初始化并查集：每个顶点自成一个连通分量；`best[comp]` 记录该分量目前找到的最小出边。
2. **每轮**：
   - **选边**：扫描所有边 $(u,v,w)$，设 $cu=find(u), cv=find(v)$；若 $cu\neq cv$，分别更新 `best[cu]` 与 `best[cv]` 为更小的 $(w,u,v)$。
   - **并边**：把 `best` 中记录的边（去重后）用并查集合并两端分量，计入 MST 总权。若本轮没有任何边可加，算法结束。
3. 结束时并查集各连通分量内即为最小生成树（森林）。

**为什么每轮至少减半。** 考察收缩后的分量图 $H$：每个分量至少有一条最小出边指向别的分量，把这些边看作分量之间的「指针」。$H$ 中每个点出度 $\ge 1$（指向另一分量），且我们同时加入这些边——形成的结构中，每个连通块至少包含 2 个原分量（否则边会指回自己，矛盾）。因此分量数 $c$ 变为 $\le c/2$，每轮至少减半。

**为什么正确（切割性质）。** 对每个分量 $C$，选出的最小出边是切割 $(C, V\setminus C)$ 的最小横边，必属于某棵 MST。一轮并入的所有边都是「各自切割的最小边」，且合并后不破坏 MST 存在性（交换论证与 Prim/Kruskal 相同）。收缩后对子图递归正确，故整体正确。

**去重。** 一条边可能同时被两个分量选为 `best`（互相最小），并入时用并查集 `union` 判重复，避免同一边计两次或形成环。

**边界条件。** 图不连通时得到最小生成森林；权相等时 `best` 取任意最小边，总权仍对；`best` 初始化为 `None`/`inf`；每轮结束后要清空或重新计算 `best`（分量已变）；终止条件是「本轮 added == 0」。

**与并查集的配合细节。** 每轮选边阶段并查集保持不变，只读 `find` 结果，因此「分量代表元」在同一轮内是稳定的，`best` 字典可以安全地按代表元归约。并边阶段才执行 `union`，且合并顺序不影响正确性（切割性质对每条边独立成立）。若用并行实现，选边阶段可对边数组做并行 map-reduce（每个线程维护局部 `best`，再归约合并），并边阶段则需要并行并查集或按「不会冲突的边子集」分批合并，这是工程实现的主要难点。

**为什么名字叫 Boruvka 而不是更晚的 Prim/Kruskal。** 历史细节值得了解：1926 年 Borůvka 为解决摩拉维亚地区电网铺设的最小成本问题独立提出该算法，比 1957 年的 Prim、1956 年的 Kruskal 都早。它一度被遗忘，直到并行计算兴起才重新被重视——因为它的「分量同时收缩」正是并行的天然形态。面试中若能点出这段历史与并行动机，往往比背复杂度更能让面试官眼前一亮。

## 三、形式化与数学基础

**轮数。** 设第 $t$ 轮开始时分量数 $c_t$，则 $c_{t+1} \le \lceil c_t/2 \rceil$，故

$$t \le \lceil \log_2 V \rceil.$$

**复杂度。** 每轮扫全部边 $O(E)$ + 并查集操作 $O(E\,\alpha(V))$，共 $O(\log V)$ 轮：

$$T = O(E \log V).$$

与 Kruskal 同阶，但**无排序**，因此常数与并行性更好；与堆 Prim 的 $O((E+V)\log V)$ 相比，省去了优先队列。

**并行时间。** 每轮的「选边」可对边数组并行归约（每个分量取 min）；「并边」用并行并查集或染色收缩。理想 PRAM 下每轮 $O(\log E)$，总 $O(\log E \cdot \log V)$；工程上多核实测接近线性加速。

**与拟阵。** 每轮加入的是「各切割最小边」，在 graphic matroid 上贪心正确；Boruvka 可看作「同时对多个切割执行贪心」，比 Prim/Kruskal 的单切割贪心更并行。

**分量图收缩。** 收缩把已并入的分量视作超级结点，递归求解子图 MST，正确性由「子问题 MST 并上本轮边 = 原图 MST」保证（本轮边权不超过任何跨分量替代边，交换论证）。

## 四、代码实现

完整可运行的 Boruvka（并查集 + 每轮最小出边 + 去重合并）：

```python
def boruvka(n, edges):
    """
    n: 顶点数 0..n-1
    edges: [(u, v, w), ...]
    返回 (总权, MST边列表, 是否连通)
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
            ra, rb = rb, ra
        parent[rb] = ra
        if rank[ra] == rank[rb]:
            rank[ra] += 1
        return True

    total = 0
    mst = []
    components = n

    while True:
        # best[comp] = (w, u, v) 该分量当前最小出边
        best = {}
        for u, v, w in edges:
            ru, rv = find(u), find(v)
            if ru == rv:
                continue
            for comp, other in ((ru, (w, u, v)), (rv, (w, u, v))):
                if comp not in best or w < best[comp][0]:
                    best[comp] = other

        added = 0
        for w, u, v in best.values():
            if union(u, v):          # 去重：同一边可能被两侧都记录
                total += w
                mst.append((u, v, w))
                added += 1
                components -= 1

        if added == 0:
            break                    # 无边可加：已是最小生成森林

    connected = components == 1
    return total, mst, connected


if __name__ == "__main__":
    edges = [
        (0, 1, 1),
        (0, 2, 4),
        (1, 2, 2),
        (1, 3, 5),
        (2, 3, 1),
    ]
    total, mst, ok = boruvka(4, edges)
    print("MST total =", total, "mst =", mst, "connected =", ok)
    assert total == 4 and ok

    # 不连通：两个三角
    e2 = [(0, 1, 1), (1, 2, 1), (0, 2, 2), (3, 4, 5)]
    total2, mst2, ok2 = boruvka(5, e2)
    print(total2, ok2)               # 7 False（森林）
    assert total2 == 7 and not ok2
```

## 五、与其他技术对比

| 维度 | Boruvka | Kruskal | 堆 Prim | 朴素 Prim |
|------|---------|---------|---------|-----------|
| 时间 | $O(E\log V)$ | $O(E\log E)$ | $O((E+V)\log V)$ | $O(V^2)$ |
| 轮数/结构 | $\log V$ 轮并行 | 全局排序 | 优先队列 | 线性扫 |
| 并行性 | 天然 | Filter-Kruskal 可 | 难 | 难 |
| 分布式 | 易（分量收缩） | 中 | 难 | 难 |
| 实现复杂度 | 中 | 低 | 中 | 低 |
| 适合 | 超大图、并行、多核 | 边列表、通用 | 在线、稀疏 | 稠密矩阵 |

**Filter-Kruskal**：先 Boruvka 若干轮把分量收缩到 $V/2^k$，只保留分量间边，再 Kruskal；理论 $O(E\log V)$，实测比纯 Kruskal 快。

## 六、常见误区

1. **同一边被两侧选中导致重复计入。** 两个分量可能同时把 $(u,v)$ 记为 `best`，并入时必须 `union` 判重，否则总权算两次或出现环。
2. **忘记清空/重建 `best`。** 分量收缩后 `find` 结果变了，`best` 必须每轮重算；沿用上一轮会连错边。
3. **终止条件写错。** 应是「本轮没有任何边被成功 union」；若写成「边扫完」会死循环或过早退出。
4. **以为 Boruvka 每轮分量减半是「严格」的。** 是「至少减半」（$\le \lceil c/2\rceil$）；有些轮可能减更多。
5. **权相等时认为结果与 Kruskal 完全一致。** 总权相同，边集可能不同；Boruvka 的 `best` 选边顺序与排序顺序不同。
6. **忽略图不连通的输出语义。** Boruvka 天然返回最小生成森林；需要唯一 MST 时先检查连通性。

## 七、与开源书/权威来源对应

- Borůvka, O. *O jistém problému minimálním* (1926). 原始论文（捷克语），现代综述见 Graham & Hell, *On the History of the Minimum Spanning Tree Problem* (1985).
- Tarjan, R. E. *Data Structures and Network Algorithms*（并行 MST 与 Boruvka 分析）。
- Chong & Sahai, *Parallel Algorithms for Minimum Spanning Tree*；现代实现见 NetworKit、GraphIt。
- GitHub：`networkit` 的 `SpanningForest`、`TheAlgorithms/Python` 的 `boruvka.py`。

## 八、面试题

**1. Boruvka 为什么每轮分量数至少减半？**
参考答案：每个分量选出最小出边指向其他分量，把这些边同时加入后，每个新连通块至少包含两个原分量，故 $c_{t+1}\le c_t/2$，$O(\log V)$ 轮结束。

**2. Boruvka 时间复杂度？为什么比 Kruskal 适合并行？**
参考答案：$O(E\log V)$。每轮扫边与并查集可并行归约，无全局排序；Kruskal 的排序是串行瓶颈（虽可并行排序但合并仍是）。

**3. 如何把 Boruvka 与 Kruskal 结合？**
参考答案：Filter-Kruskal——先跑 Boruvka 一轮或多轮收缩分量，丢弃分量内边，对剩余稀疏边做 Kruskal。实测在超大图上优于单一算法。

**4. 一条边被两个分量同时选为最小出边怎么办？**
参考答案：正常现象（互相最小）。并入时用并查集 `union` 判重，第二次 union 会失败从而跳过，保证不成环、不重复计权。

## 九、演进与趋势

- **并行与 GPU MST**：Boruvka 的轮结构适合 MapReduce/GraphX/GraphIt；GPU 上用桶选边 + 并查集压缩，处理亿级边。
- **分布式 GHS 算法**：消息传递下的 Boruvka 变体，用于传感器网络、数据中心拓扑规划。
- **Filter-Kruskal 与混合策略**：生产图库按规模自动切换：小图 Kruskal、大图 Boruvka+Kruskal。
- **近似与动态**：超大规模上可接受近似 MST（如 sketch + Boruvka）；动态图用 Boruvka 骨架做局部重算。
- **教学价值**：Boruvka 补全了 MST「点增长 / 边增长 / 分量收缩」三种视角，是理解并行贪心与图收缩的范本。

## 十、小结

Boruvka 让每个连通分量并行选出最小出边并同步收缩，每轮分量至少减半，$O(E\log V)$ 求出 MST；它无须排序、天然并行，是超大规模与分布式 MST 的基石，也是 Filter-Kruskal 等混合算法的核心组件。
