# 离线LCA

> 对应 Tarjan《Depth-First Search and Linear Graph Algorithms》(1972) 的离线 LCA 算法，以及 CLRS 相关习题、《算法竞赛进阶指南》树上问题章节。

## 一、背景与挑战

最近公共祖先（Lowest Common Ancestor, LCA）定义：树中结点 $u,v$ 的 LCA 是同时是 $u,v$ 祖先、且深度最大的结点。它是树上距离、路径聚合（min/max/异或）、倍增、树链剖分的基石。一次询问求 LCA 有多种在线方法：朴素爬到同深度再一起爬 $O(n)$；倍增预处理 $O(n\log n)$、询问 $O(\log n)$；RMQ+欧拉序 $O(n)$ 预处理 $O(1)$ 询问。

但若**一次性给出全部 $q$ 对询问**，且只要答案不要交互，Tarjan 的**离线 LCA** 可在

$$O(n + q\,\alpha(n))$$

内回答所有询问——比倍增常数更小，实现也只需 DFS + 并查集。它把「树上祖先关系」与「并查集等价类」完美结合，是「离线 + 并查集」思想的典范。

工程位置：编译器支配树分析、族谱/组织架构批量查询、版本控制 DAG 的公共祖先、图论题预处理所有点对距离时，只要查询全知，离线 LCA 常数优势明显。它也是「DFS 时序 + 并查集等价类」这一组合技的代表作，学会它之后再看 Tarjan 离线求割点、求双连通分量会顺畅很多。面试常考「Tarjan 离线 LCA 怎么做」「为什么并查集找的就是 LCA」「与倍增怎么选」，答不出正确性直觉往往会被追问到底。

## 二、核心原理

### 2.1 DFS 与「子树聚合」

对树做深度优先遍历。维护并查集：每个结点初始自成集合。DFS 过程中：

1. 递归处理完 $u$ 的所有子树后，把各子树的根**合并到 $u$**（`parent[child_root] = u`）；
2. 此时以 $u$ 为根的子树内，所有结点的并查集代表元都是 $u$；
3. 标记 `visited[u] = True`；
4. 检查 $u$ 的所有询问对 $(u,v)$：若 `visited[v]` 已为真，说明 $v$ 所在子树已经处理完并挂到了某个祖先上，此时 `find(v)` 就是 $u$ 与 $v$ 的 LCA。

### 2.2 为什么 `find(v)` 是 LCA

考虑询问 $(u,v)$，在访问到 $u$ 时回答。分情况：

- 若 $v$ 是 $u$ 的**后代**，则 $v$ 尚未 `visited`（DFS 还没到 $v$）——此时**不能**回答，应等 DFS 到 $v$ 时再处理对称询问。所以协议是：只在**两端都已 visited** 时回答，或把询问存成无向对，在先 visited 的那个端点检查另一端。
- 若 $v$ 不在 $u$ 的子树内，且 `visited[v]` 为真，则 $v$ 的子树已经完成并查集合并。$v$ 所在集合的代表元，正是「$v$ 的子树往上贴到的、目前深度最小的已完成祖先」——恰好是 $u$ 与 $v$ 的分岔点，即 LCA。

更严谨地：DFS 完结点 $x$ 后 `union` 到父，使得「已完成结点集合」的代表元深度单调变浅。当 $u$ 被访问、$v$ 已完成时，$v$ 被挂到的根是 $v$ 的祖先，且是「尚未被更高祖先合并掉」的那一层——就是 $u$ 与 $v$ 的最近公共祖先。

### 2.3 算法步骤（标准写法）

1. 建树邻接表，任选根（如 0 或 1）。
2. 预处理询问表：`qmap[u].append((v, id))`，`qmap[v].append((u, id))`。
3. DFS(u, parent)：
   - 对每个子结点 `dfs(v, u)`，然后 `parent[v] = u`（并查集 union）；
   - `visited[u] = True`；
   - 对 `qmap[u]` 中每对 `(v, id)`：若 `visited[v]`，`ans[id] = find(v)`。
4. 根的 LCA 自己是根；注意所有询问都要被恰好回答一次。

### 2.4 边界与陷阱

- **只在一端 visited 时不能答**：否则可能把「尚未进入的子树」误判。标准做法是把询问存成无向对，两端都出现一次，谁先完成谁触发检查。
- **并查集 union 方向**：子树并到当前结点（深度小的当根），使 `find` 返回的是「最高的已完成点」。方向写反（父挂子）会让答案跑到后代。
- **根的选择**：无根树先定根；森林则每个连通块跑一遍，或加超级源点。
- **重复结点**：$u == v$ 时 LCA 是自己，应在代码里特判或自然到达（`visited[u]` 刚为真，`find(v)` 就是自己）。
- **递归深度**：链状树 DFS 深度 $O(n)$，Python 递归会爆栈，生产实现用显式栈或提高递归上限并压测。

### 2.5 与倍增的语义差异

倍增不仅能求 LCA，还能求「$u$ 的第 $k$ 级祖先」、做树上差分与静态路径聚合；Tarjan 离线只回答 LCA 本身，但常数小、代码短。若后续还要 $k$ 级祖先，直接上倍增更省事；若只是批量求 LCA 后算距离或聚合，离线 Tarjan 更划算。

## 三、形式化与数学基础

DFS 每个结点进出一次，$O(n)$。每个询问在两端的 `qmap` 各存一份，回答一次，$O(1)$ 次 `find`。并查集操作共 $O(n + q)$ 次 `find/union`，用路径压缩 + 按秩合并：

$$T = O(n + (n+q)\,\alpha(n)) = O(n + q\,\alpha(n)).$$

对比倍增：预处理 $O(n\log n)$，询问 $O(\log n)$，总 $O(n\log n + q\log n)$；RMQ：$O(n)$ 预处理 + $O(q)$，但欧拉序与 ST 表常数大、代码长。

正确性证明草图（不变量）：

1. DFS 后序 `union` 后，$x$ 的并查集根是「$x$ 的已处理祖先中最浅的」；
2. 当 $u$ 访问时，$v$ 已 visited，则 $v$ 的根 $\mathrm{find}(v)$ 是 $u$ 与 $v$ 的公共祖先；
3. 若有更深公共祖先 $w$，则 $w$ 在 $u$ 或 $v$ 的子树 DFS 中尚未完成 `union` 到上层，$\mathrm{find}(v)$ 不会越过 $w$——故 $\mathrm{find}(v)$ 是**最近**的。

空间：邻接表 $O(n)$，询问表 $O(q)$，并查集 $O(n)$。

## 四、代码实现

Tarjan 离线 LCA 完整实现（含路径压缩与按秩合并），并附倍增对照与经典用例。

```python
class DSU:
    def __init__(self, n):
        self.p = list(range(n))
        self.r = [0] * n

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union_to(self, child, parent):
        """把 child 所在集合挂到 parent 下（parent 当根）。"""
        rc = self.find(child)
        if rc == parent:
            return
        self.p[rc] = parent


def tarjan_lca(n, adj, queries):
    """queries: [(u, v)]，返回 ans[i] 为第 i 个询问的 LCA（结点编号 0..n-1）。"""
    dsu = DSU(n)
    visited = [False] * n
    ans = [None] * len(queries)
    qmap = [[] for _ in range(n)]
    for i, (u, v) in enumerate(queries):
        qmap[u].append((v, i))
        qmap[v].append((u, i))

    sys_set = None  # 不依赖 sys.setrecursionlimit 的显式栈版本见下
    def dfs(u, parent):
        for w in adj[u]:
            if w == parent:
                continue
            dfs(w, u)
            dsu.union_to(w, u)  # 子树并到 u
        visited[u] = True
        for v, idx in qmap[u]:
            if visited[v]:
                ans[idx] = dsu.find(v)

    dfs(0, -1)
    return ans


def tarjan_lca_iter(n, adj, queries):
    """迭代 DFS 版，避免深递归爆栈。"""
    dsu = DSU(n)
    visited = [False] * n
    ans = [None] * len(queries)
    qmap = [[] for _ in range(n)]
    for i, (u, v) in enumerate(queries):
        qmap[u].append((v, i))
        qmap[v].append((u, i))

    parent = [-1] * n
    order = []
    stack = [(0, -1, 0)]  # (node, parent, state) 0=进入 1=离开
    while stack:
        u, p, state = stack.pop()
        if state == 0:
            parent[u] = p
            stack.append((u, p, 1))
            for w in adj[u]:
                if w != p:
                    stack.append((w, u, 0))
        else:
            if p != -1:
                dsu.union_to(u, p)
            visited[u] = True
            for v, idx in qmap[u]:
                if visited[v]:
                    ans[idx] = dsu.find(v)
    return ans


# ---------- 对照：倍增 LCA ----------
class BinLiftLCA:
    def __init__(self, n, adj, root=0):
        self.LOG = (n + 1).bit_length()
        self.up = [[-1] * n for _ in range(self.LOG)]
        self.depth = [0] * n
        self.adj = adj
        self.n = n
        self.root = root
        self._build()

    def _build(self):
        stack = [(self.root, -1)]
        order = [self.root]
        self.up[0][self.root] = self.root
        while stack:
            u, p = stack.pop()
            for w in self.adj[u]:
                if w == p:
                    continue
                self.depth[w] = self.depth[u] + 1
                self.up[0][w] = u
                stack.append((w, u))
                order.append(w)
        for k in range(1, self.LOG):
            for v in range(self.n):
                self.up[k][v] = self.up[k - 1][self.up[k - 1][v]]

    def lca(self, u, v):
        if self.depth[u] < self.depth[v]:
            u, v = v, u
        diff = self.depth[u] - self.depth[v]
        for k in range(self.LOG):
            if diff >> k & 1:
                u = self.up[k][u]
        if u == v:
            return u
        for k in range(self.LOG - 1, -1, -1):
            if self.up[k][u] != self.up[k][v]:
                u = self.up[k][u]
                v = self.up[k][v]
        return self.up[0][u]


if __name__ == "__main__":
    # 树：
    #       0
    #      / \
    #     1   2
    #    / \   \
    #   3   4   5
    n = 6
    adj = [[] for _ in range(n)]
    for u, v in [(0, 1), (0, 2), (1, 3), (1, 4), (2, 5)]:
        adj[u].append(v)
        adj[v].append(u)

    queries = [(3, 4), (3, 5), (4, 5), (3, 3), (1, 5), (0, 5)]
    expect = [1, 0, 0, 3, 0, 0]
    assert tarjan_lca(n, adj, queries) == expect
    assert tarjan_lca_iter(n, adj, queries) == expect

    bl = BinLiftLCA(n, adj)
    assert [bl.lca(u, v) for u, v in queries] == expect

    # 更大随机树对拍
    import random
    random.seed(1)
    N = 80
    adj2 = [[] for _ in range(N)]
    for i in range(1, N):
        j = random.randrange(i)
        adj2[i].append(j)
        adj2[j].append(i)
    qs = [(random.randrange(N), random.randrange(N)) for _ in range(50)]
    a1 = tarjan_lca_iter(N, adj2, qs)
    a2 = BinLiftLCA(N, adj2)
    assert a1 == [a2.lca(u, v) for u, v in qs]
    print("tarjan offline lca ok")
```

要点：`union_to(w, u)` 保证「子并父」；回答时机是「两端都 visited」；`u == v` 时 `find(v)` 返回自己，语义正确。迭代版用显式栈防爆。

## 五、与其他技术对比

| 维度 | Tarjan 离线 LCA | 倍增 LCA | RMQ+欧拉序 | 树链剖分 | 朴素爬 |
|------|-----------------|----------|------------|----------|--------|
| 预处理 | $O(n)$ | $O(n\log n)$ | $O(n)$ | $O(n)$ | 无 |
| 询问 | $O(\alpha(n))$ | $O(\log n)$ | $O(1)$ | $O(\log n)$ | $O(n)$ |
| 在线 | 否 | 是 | 是 | 是 | 是 |
| 实现 | DFS+并查集 | 中 | 中 | 中高 | 极简 |
| 附加信息 | 一般只有 LCA | 可求 k 级祖先 | 可求路径聚合 | 路径修改 | 无 |

**取舍**：查询全知 → Tarjan 离线最快最短；要在线/要 $k$ 级祖先 → 倍增；要 $O(1)$ 询问 → RMQ；要路径修改 → 树剖。树上距离 `dist[u]+dist[v]-2*dist[lca]` 三种都能做。

## 六、常见误区

**误区一：一端 visited 就回答。** 若 $v$ 是 $u$ 的未访问后代，会误答。必须两端都 visited，或显式处理祖先关系。

**误区二：并查集挂接方向错误（父挂子）。** 必须把已完成子树并到当前结点，`find` 才能返回「最浅已完成点」。方向反了 LCA 会跑到子树。

**误区三：询问只存单向。** 要存无向对，否则后访问的端点无法触发回答。

**误区四：递归 DFS 爆栈。** 链树 $10^5$ 时 Python 递归炸，用迭代栈或 `setrecursionlimit` + 风险自担。

**误区五：忘记回答 `u == v` 或未连接点。** $u==v$ 时 LCA 是自身；不同树（森林）需定义或保证同树。

## 七、与开源书/权威来源对应

1. **Tarjan (1972). Depth-First Search and Linear Graph Algorithms. SIAM J. Comput.** —— 离线 LCA 原始论文。
2. **CLRS** 图算法与并查集章节（DFS + 不相交集合的结合思想）。
3. **《算法竞赛进阶指南》树上问题 / LCA 章节** —— 竞赛向模板与例题。
4. **OI Wiki「最近公共祖先」** —— 倍增/树剖/Tarjan 对比。

## 八、面试题

**Q1：Tarjan 离线 LCA 的复杂度与流程？**
A：$O(n + q\alpha(n))$。DFS 后序把子树并查集合并到当前结点；访问 $u$ 时若 $v$ 已 visited，`find(v)` 即 LCA。

**Q2：为什么 `find(v)` 就是 LCA？**
A：已完成结点的并查集根是「最浅的已完成祖先」；当 $u$ 访问且 $v$ 已完成，该根恰是 $u,v$ 的分岔点。

**Q3：和倍增怎么选？**
A：查询全知选 Tarjan（常数小）；要在线或 $k$ 级祖先选倍增；要 $O(1)$ 询问选 RMQ。

**Q4：如何求树上两点距离？**
A：先 `lca = LCA(u,v)`，`dist[u] + dist[v] - 2*dist[lca]`，`dist` 为 DFS 深度或边权前缀。

## 九、演进与趋势

**树上莫队**、**离线树上路径聚合**复用同一套「DFS + 并查集」。**动态树 LCA**（Link-Cut）支持加边在线。**RMQ+欧拉序+ST表**是静态 $O(1)$ 标准。**树链剖分**支持路径修改与 LCA 二合一。工程里 LCA 用于**版本控制（git commit DAG）、族谱、路由拓扑**；批量分析时离线 Tarjan 仍是常数之王。面试趋势是「说清正确性 + 复杂度 + 与倍增取舍」，而非只背模板。

## 十、小结

Tarjan 离线 LCA 把 DFS 后序与并查集结合：子树合并到当前结点后，已完成端的 `find` 就是最近公共祖先。总代价 $O(n + q\alpha(n))$，是批量 LCA 的最优工程解。正确性依赖「两端 visited 才答」与「子并父」方向；与倍增/RMQ/树剖的取舍取决于是否在线与是否要路径操作。它也是「离线 + 并查集」思想的最佳入门范例。
