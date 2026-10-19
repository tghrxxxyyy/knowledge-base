# Kruskal与并查集

> 对应 CLRS《Introduction to Algorithms》第 21 章并查集与第 23.2 节 Kruskal 算法；Tarjan《Data Structures and Network Algorithms》并查集复杂度证明；Union-Find 的按秩合并与路径压缩分析。

## 一、背景与挑战

Kruskal 算法是求最小生成树最「好写」的贪心算法：把所有边按权从小到大排序，依次尝试并入；若该边两端已经在同一个连通分量，跳过（会成环），否则并入。它的全部技术难点压缩到一个子问题上——**高效判断「两个点是否已连通」与「合并两个分量」**。这正是并查集（Union-Find / Disjoint Set Union, DSU）的任务。

并查集不仅是 MST 的配套结构，本身也是图论与算法设计的基础工具：连通性判定、动态图连通、等价类划分、最小生成树唯一性判定、离线 LCA、Kruskal 重构树、好友推荐与连通块统计等。理解「路径压缩 + 按秩合并」为何能达到反阿克曼 $\alpha(n)$ 级近常数复杂度，是数据结构面试的经典考点。

工程上，Kruskal + 并查集几乎是「边列表场景」的默认 MST 实现：只扫一遍边、代码短、易并行/分布式（Filter-Kruskal）、易增量（边排序后流式处理）。

## 二、核心原理

**Kruskal 骨架。**

1. 把 $E$ 条边按权升序排序（相等权任意顺序）。
2. 初始化并查集：每个顶点自成集合。
3. 依次取边 $(u,v,w)$：
   - 若 `find(u) == find(v)`，两端已连通，加入必成环 → 丢弃；
   - 否则 `union(u, v)`，把边计入 MST。
4. 选满 $n-1$ 条边即停（连通图）。

**正确性（切割性质 / 交换论证）。** 考虑当前已选边集 $F$ 构成的森林。边 $e$ 是此时「连接两个不同分量的最小权边」，则存在含 $F\cup\{e\}$ 的 MST。证明与 Prim 相同：对任意 MST，若不含 $e$，则加 $e$ 成环，环上必有另一条连接同样两分量的边 $e'$，由 $w(e)\le w(e')$ 交换即得。Kruskal 按序处理等价于「每次在所有横跨当前切割的边中选最小」。

**并查集操作。**

- `find(x)`：返回 $x$ 所在集合的代表元（根）。
- `union(x, y)`：合并两个集合。
- 路径压缩（path compression）：`find` 途中把沿途结点直接挂到根。
- 按秩/大小合并（union by rank/size）：矮树挂到高树下，防止退化链。

二者同时使用时，单次操作摊还 $O(\alpha(n))$，$\alpha$ 为反阿克曼函数，$n$ 为宇宙大小时 $\alpha(n)\le 4$，实际就是常数。

**环视角。** Kruskal 跳过边的条件是「两端已连通 = 加入成环」，这与**环性质**一致：环上最大权边不应出现在 MST 中——排序保证先收小边，大边自然被跳过。换个角度说：每条被拒绝的边，都是它所在环上权值最大的候选，这正是「最大边不出现在 MST 中」的贪心体现。

**并查集为何必须优化。** 裸的并查集只做 `parent[a]=b` 这种朴素合并，树可能退化成链，单次 `find` 变成 $O(V)$。Kruskal 要做 $O(E)$ 次 `find`/`union`，退化后总代价 $O(E\cdot V)$，在稠密图上不可接受。路径压缩把沿途结点直接挂到根，下次查询几乎一步到位；按秩合并把矮树挂到高树下，保证树高不超过 $O(\log V)$，即便暂时没做压缩也不会崩。两者叠加后的摊还分析用反阿克曼函数描述，实际就是极小的常数。

**Kruskal 的适用画像。** 离线、边数中等、输入就是边列表、希望代码最短最易验证——这是 Kruskal 的甜蜜点。若还要并行，可把边按权分段、各段并行跑并查集再合并（Filter-Kruskal）；若要分布式，各节点排好序后做多路归并即可。正是这种「排序 + 判连通」的清晰分工，让 Kruskal 成为图算法工程实践里最常被复制粘贴的模板。

**边界条件。** 重边按序处理无妨；自环跳过（两端同点）；图不连通时得到最小生成森林；权相等时任意 Kruskal 选择仍得到某棵 MST（总权相同）；并查集必须路径压缩，否则可能退化。

## 三、形式化与数学基础

**复杂度。**

- 排序：$O(E\log E)$。
- 并查集：$O(E \cdot \alpha(V))$。

$$T = O(E\log E) = O(E\log V) \quad (\text{因为 } E \le V^2).$$

稀疏图 $E=O(V)$ 时为 $O(V\log V)$，与堆 Prim 同量级；稠密图 $E=\Theta(V^2)$ 时 $O(V^2\log V)$，输给朴素 Prim 的 $O(V^2)$。

**并查集 $\alpha$ 界（Tarjan 1975 / Ackermann 反函数）。** 仅路径压缩或仅按秩合并均为 $O(\log n)$ 均摊；两者同时使用为 $O(m\,\alpha(n))$ 对 $m$ 次操作。证明用「秩森林 + 拟阵/势能」，Ackermann 逆增长极慢，故实测近常数。

**Kruskal 正确性形式化。** 设边排序 $w(e_1)\le w(e_2)\le\cdots$。定义 $F_k$ 为前 $k$ 条边中被接受的边集。不变量：存在 MST $T\supseteq F_k$。$k=0$ 平凡；若 $e_{k+1}$ 被接受，由切割性质可把 MST 调整为包含它；若被拒绝，已有 MST 不含它（否则成环且权更大可交换）。归纳完成。

**与 Prim 的对偶。** Prim 维护「顶点切割」，Kruskal 维护「森林切割」；二者都是拟阵贪心。

## 四、代码实现

完整可运行的 Kruskal + 并查集（路径压缩 + 按秩合并），含 MST 边集与连通性判断：

```python
class DSU:
    def __init__(self, n):
        self.parent = list(range(n))
        self.rank = [0] * n
        self.count = n          # 连通分量数

    def find(self, x):
        # 路径压缩：沿途结点直接挂根
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x
        # 递归写法： if self.parent[x]!=x: self.parent[x]=self.find(self.parent[x])

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        # 按秩合并：矮树挂高树
        if self.rank[ra] < self.rank[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra
        if self.rank[ra] == self.rank[rb]:
            self.rank[ra] += 1
        self.count -= 1
        return True


def kruskal(n, edges):
    """
    n: 顶点数（0..n-1）
    edges: [(u, v, w), ...]
    返回 (总权, MST边列表, 是否连通)
    """
    edges = sorted(edges, key=lambda e: e[2])
    dsu = DSU(n)
    total = 0
    mst = []
    for u, v, w in edges:
        if u == v:
            continue
        if dsu.union(u, v):
            total += w
            mst.append((u, v, w))
            if len(mst) == n - 1:
                break
    connected = len(mst) == n - 1
    return total, mst, connected


if __name__ == "__main__":
    # 同一经典图：MST 总权 4
    edges = [
        (0, 1, 1),
        (0, 2, 4),
        (1, 2, 2),
        (1, 3, 5),
        (2, 3, 1),
    ]
    total, mst, ok = kruskal(4, edges)
    print("MST total =", total, "edges =", mst, "connected =", ok)
    assert total == 4 and ok

    # 连通分量示例
    dsu = DSU(5)
    dsu.union(0, 1)
    dsu.union(2, 3)
    assert dsu.count == 3
    assert dsu.find(0) == dsu.find(1)
```

## 五、与其他技术对比

| 维度 | Kruskal | 堆 Prim | 朴素 Prim | Boruvka |
|------|---------|---------|-----------|---------|
| 时间 | $O(E\log E)$ | $O((V+E)\log V)$ | $O(V^2)$ | $O(E\log V)$ |
| 核心结构 | 排序 + 并查集 | 二叉堆 | 线性扫 | 并查集 |
| 稀疏图 | 优 | 优 | 差 | 优 |
| 稠密图 | 排序贵 | 一般 | 最优 | 一般 |
| 输入形态 | 边列表 | 邻接表 | 邻接矩阵 | 边列表 |
| 实现难度 | 最低 | 中 | 最低 | 中 |
| 并行/分布式 | Filter-Kruskal 可 | 难 | 难 | 天然 |
| 额外结构 | 无 | 无 | 无 | 轮次收缩 |

取舍：**离线、边列表、要简单** → Kruskal；**邻接表、要在线长树** → Prim；**稠密矩阵** → 朴素 Prim；**并行超大图** → Boruvka 或 Filter-Kruskal（先用 Boruvka 抽出分量、再 Kruskal 连接）。

## 六、常见误区

1. **漏掉路径压缩或按秩合并。** 裸并查集树高可能 $O(n)$，$E$ 条边就 $O(En)$，大数据直接 TLE。两者都写上，才近常数。
2. **`union` 时直接 `parent[ra]=rb` 而不看秩。** 虽仍正确，但退化风险增大；竞赛卡常数或大图会超时。
3. **误以为「排序相等权要稳定排序才正确」。** 权相等时任意顺序仍得某棵 MST，总权相同；只有「唯一性判定」才需谨慎。
4. **把成环判断写成「已选边里有相同顶点」。** 必须用连通性（并查集），因为间接连通（A-B-C 后 A-C）同样成环，靠边集合判断会漏。
5. **忘记 $n-1$ 条边就停。** 继续扫会把更多边试一遍，浪费时间；不连通时用 `count` 或边数判断。
6. **自环与重边处理不当。** 自环永远跳过；重边保留最小者或依赖排序自然先取小。

## 七、与开源书/权威来源对应

- Cormen et al., *Introduction to Algorithms*, Ch. 21 Data Structures for Disjoint Sets（反 Ackermann 分析）、Ch. 23.2 Kruskal.
- Tarjan, R. E. *Efficiency of a Good but Not Linear Set Union Algorithm*. JACM 1975.
- Sedgewick & Wayne, *Algorithms* 4th ed., §1.5 Union-Find、§4.3 Kruskal.
- GitHub：`zephyrproject-rtos`、`networkx` 的 `kruskal_mst_edges`；OI-wiki「并查集」模板。

## 八、面试题

**1. 为什么 Kruskal 正确？**
参考答案：按权排序后，每条被接受的边都是连接两个不同分量的最小横边，由切割性质必在某 MST 中；交换论证维持「存在 MST 包含已选边」不变量，结束得 MST。

**2. 并查集路径压缩 + 按秩合并的复杂度？**
参考答案：$m$ 次操作 $O(m\,\alpha(n))$，$\alpha$ 是反阿克曼函数，实际 $\le 4$。只用其一为 $O(\log n)$ 均摊。

**3. 手写 Kruskal，并处理不连通图。**
参考答案：见上文代码。排序后 `union` 成功才收边；若最终边数 $<n-1$ 或 `dsu.count>1` 则不连通，返回最小生成森林。

**4. Kruskal 与 Prim 怎么选？**
参考答案：稀疏图/边列表/要简单 → Kruskal；稠密矩阵 → 朴素 Prim；邻接表在线 → 堆 Prim。总权结果在权互异时唯一相同。

## 九、演进与趋势

- **Filter-Kruskal**：先用 Boruvka/随机过滤掉大边，再对剩余边跑 Kruskal，常用于超大图与分布式 MST。
- **并查集变体**：带权并查集（偏移量关系）、可撤销并查集（按时间回滚，离线动态图）、Link-Cut 树（动态连通），支撑更复杂的图问题。
- **Kruskal 重构树**：把 Kruskal 过程建成二叉树，支持「两点路径上最大边」等查询，竞赛与网络设计常用。
- **分布式 MST**：消息传递模型下 Kruskal 与 Boruvka 的分布式版本（GHS 算法）用于数据中心与传感器网络。
- **工程现状**：Boost/LEMON/NetworKit 默认提供并查集优化的 Kruskal；大数据框架（GraphX、GraphFrames）用 Boruvka/Filter-Kruskal 并行求 MST。

## 十、小结

Kruskal 按边权升序贪心并入，用并查集 $O(\alpha)$ 判环，$O(E\log E)$ 得到 MST；切割性质与交换论证保证正确，路径压缩与按秩合并保证效率。它是实现最简单、最易并行的 MST 算法，也是理解并查集这一基础结构的最佳入口。
