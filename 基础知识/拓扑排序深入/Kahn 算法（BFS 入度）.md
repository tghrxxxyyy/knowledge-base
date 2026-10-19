# Kahn 算法（BFS 入度）

> 对应 CLRS《Introduction to Algorithms》第 22.4 章（Topological Sort）、Kahn 1962（Proc. ACM, "Topological sorting of large networks"），以及 youngyangyang04/leetcode-master 课程表与拓扑排序专题。

## 一、背景与挑战

有向无环图（DAG）上的拓扑排序要输出一个线性序 $v_1, v_2, \dots, v_n$，使得每条边 $u \to v$ 都满足 $u$ 排在 $v$ 前面。这个抽象问题的现实投影非常广：编译器按头文件依赖决定翻译单元的处理顺序，包管理器按依赖决定安装顺序，构建系统（Make、Bazel、Ninja）按目标依赖决定执行顺序，工作流引擎按前置任务决定调度顺序。问题的难点不在"排出一个序"，而在于**图中可能有环**——循环依赖意味着不存在任何合法线性序，系统必须能识别并报告它，而不是无限等待或悄悄漏掉节点。

朴素做法有两类失效路径。第一类是反复扫描：每轮找一个"当前没有未满足前置的节点"输出，然后删掉它的出边，最坏 $O(V\cdot E)$。节点一多（数万模块、数十万依赖边）就不可接受。第二类是 DFS 递归：深度过大时爆栈，而且环的"存在性"与"位置"混在递归回溯里，调试体验差。Kahn 算法（1962）用**入度计数 + 队列**把拓扑排序做成一趟宽度优先的"剥洋葱"：只处理入度已经归零的节点，每个节点、每条边恰好被处理一次，整体 $O(V+E)$，还能顺带检测环。

在工程与面试中，Kahn 是"有向依赖判定"的默认模板。LeetCode 207（课程表）、210（课程表 II）、269（火星词典）、310（最小高度树的反向剥洋葱）都以它为骨架。面试官考察的通常不只是能否默写，而是：入度数组怎么建、什么时候算有环、拓扑序是否唯一、如何输出字典序最小的拓扑序、以及和 DFS 法的取舍。理解 Kahn 的不变量，比背模板更重要。

## 二、核心原理

Kahn 的核心操作是"**反复取出入度为 0 的顶点，输出它，并删除它的全部出边**"。直观上，入度为 0 意味着这个节点的全部前置已经满足，它可以立刻执行/输出；删掉出边相当于"它的后继少了一个前置"，用入度减一来维护。整个过程像剥洋葱：从"没有依赖的外层"一圈圈往里剥。

算法维护三个东西：入度数组 $indeg[\cdot]$、邻接表 $adj$、以及装"当前入度为 0"的队列 $Q$。初始把所有 $indeg[v]=0$ 的点入队。每次出队一个 $u$，追加到结果 $order$，然后对每条出边 $(u,v)$ 执行 $indeg[v] \mathrel{-}= 1$；当 $indeg[v]$ 降到 0 时把 $v$ 入队。

**不变量**（算法全程保持）：
1. $Q$ 中的节点恰是"尚未输出、且当前入度为 0"的节点集合；
2. $order$ 中的节点满足：其所有前驱都已在 $order$ 中（因此 $order$ 前缀始终是合法的偏序延拓前缀）；
3. 对任意未输出节点 $v$，$indeg[v]$ 等于"尚未输出的前驱个数"。

由不变量 2，最终得到的 $order$ 是拓扑序。由不变量 1 和 3，若某时刻队列为空但仍有未输出节点，说明这些节点的入度都至少为 1，即每个未输出节点都还有未输出的前驱——沿着"前驱"回溯必然成环（有限图中"前驱的前驱…"无限后退必然重复）。因此**队列空且 $|order| < |V|$ 等价于存在环**，这是 Kahn 同时完成环检测的原理。

边界条件要盯住几处：孤立点（入度 0 且无出边）一开始就必须进队，否则会误报有环；重边会让入度大于"不同前驱数"，减一时要逐边减，不能按邻接点去重后少减；自环 $(v,v)$ 使 $indeg[v]$ 至少为 1 且永远不会通过"别人出队"归零，会被正确判为环；若图本身是空的（$|V|=0$），结果应是空序而不是环。

Kahn 不保证唯一拓扑序。当队列中同时有多个入度 0 的点时，出队顺序任意，对应不同的合法线性扩展。若要求**字典序最小**的拓扑序，把队列换成最小堆，每次取编号最小的入度 0 点即可（正确性仍由不变量保证，只是在"可输出集合"上做了优先选择）。若要求"尽量按某个顺序"，同理换优先级结构。

## 三、形式化与数学基础

**存在性**：有向图 $G=(V,E)$ 存在拓扑序 $\iff$ $G$ 无环。($\Rightarrow$) 若有环 $v_1\to v_2\to\cdots\to v_k\to v_1$，拓扑序要求 $v_1$ 在 $v_2$ 前、…、$v_k$ 在 $v_1$ 前，矛盾。($\Leftarrow$) 用 Kahn：DAG 必有入度 0 的点（否则沿入度 $\ge 1$ 无限回溯成环），取出后剩下的子图仍是 DAG，归纳可取完全部 $|V|$ 个点。

**复杂度**：建图与入度扫描全部边一次，$O(V+E)$；每个顶点恰好入队/出队一次；每条边恰好触发一次入度递减。故总时间 $O(V+E)$。额外空间为入度数组 $O(V)$、邻接表 $O(V+E)$、队列 $O(V)$。相比 DFS 法的递归栈，Kahn 的空间是显式队列，不会因深度过大爆栈（除非用递归写 Kahn）。

**正确性（不变量 2 的归纳）**：当 $u$ 出队时 $indeg(u)=0$，由不变量 3 其所有前驱均已输出，故把 $u$ 接在 $order$ 末尾不破坏"前驱在前"。初始空序列平凡成立；每步只追加一个满足约束的点，故最终 $order$ 是拓扑序。

**环检测的等价刻画**：令 $S$ 为算法结束时未输出的节点集。若 $S \neq \varnothing$，则 $\forall v\in S,\ indeg_S(v)\ge 1$（在子图 $G[S]$ 上）。在有限有向图中，每个点出度至少为 1 的子图必含环（沿边走 $|S|+1$ 步必重复顶点）。反之若 $G$ 有环，环上任何点都不可能入度归零（环上每个点的环上前驱始终未输出），故不会进入 $order$。

**输出计数与环大小**：$|order|$ 等于 $G$ 中"不在任何环上、且不被环上点'传染'阻塞"的最大可调度集…更准确地说，等于删除所有环后（把 SCC 缩点后无环分量中）能排进合法序的节点数。想精确定位环，Kahn 只能告诉你"有环"，要给出环上路径需在残余子图上再跑一次 DFS。

**字典序最小拓扑序的贪心正确性**：设当前可输出集合为 $Q$（入度 0 的未输出点）。任取一最优字典序解，若其下一个输出点不是 $\min Q$，设为 $x > m=\min Q$。因为 $m$ 此刻可输出，它不依赖 $x$，把 $m$ 提前到 $x$ 前（交换到当前位）不违反任何边约束，且字典序变小或相等，与最优矛盾。故每步取 $\min Q$ 得字典序最小。

## 四、代码实现

```python
from collections import deque, defaultdict
import heapq


def kahn_topo(n, edges):
    """返回拓扑序；若有环返回 None。edges: [(u, v)] 表示 u -> v"""
    indeg = [0] * n
    adj = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)
        indeg[v] += 1

    q = deque(i for i in range(n) if indeg[i] == 0)
    order = []
    while q:
        u = q.popleft()
        order.append(u)
        for v in adj[u]:
            indeg[v] -= 1
            if indeg[v] == 0:
                q.append(v)

    return order if len(order) == n else None


def kahn_lex_min(n, edges):
    """字典序最小的拓扑序；有环返回 None"""
    indeg = [0] * n
    adj = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)
        indeg[v] += 1

    heap = [i for i in range(n) if indeg[i] == 0]
    heapq.heapify(heap)
    order = []
    while heap:
        u = heapq.heappop(heap)
        order.append(u)
        for v in adj[u]:
            indeg[v] -= 1
            if indeg[v] == 0:
                heapq.heappush(heap, v)
    return order if len(order) == n else None


def find_cycle_via_kahn(n, edges):
    """Kahn 判环后，在残余子图上 DFS 找出一条环路径"""
    indeg = [0] * n
    adj = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)
        indeg[v] += 1

    q = deque(i for i in range(n) if indeg[i] == 0)
    alive = [True] * n
    while q:
        u = q.popleft()
        alive[u] = False
        for v in adj[u]:
            indeg[v] -= 1
            if indeg[v] == 0:
                q.append(v)

    if all(not x for x in alive):
        return None  # 无环

    # 在存活节点上 DFS 找环（只走存活边）
    color = [0] * n  # 0 white, 1 gray, 2 black
    parent = [-1] * n
    cycle = []

    def dfs(u):
        nonlocal cycle
        color[u] = 1
        for v in adj[u]:
            if not alive[v]:
                continue
            if color[v] == 1:
                # 回溯出环
                path = [u]
                x = u
                while x != v:
                    x = parent[x]
                    path.append(x)
                path.reverse()
                cycle.extend(path)
                return True
            if color[v] == 0:
                parent[v] = u
                if dfs(v):
                    return True
        color[u] = 2
        return False

    for i in range(n):
        if alive[i] and color[i] == 0:
            if dfs(i):
                break
    return cycle


if __name__ == "__main__":
    # 经典用例：4 门课，先修关系
    # 1->0, 2->0, 3->1, 3->2
    edges = [(1, 0), (2, 0), (3, 1), (3, 2)]
    assert kahn_topo(4, edges) is not None
    assert kahn_lex_min(4, edges) == [3, 1, 2, 0]

    # 有环：0->1->2->0
    assert kahn_topo(3, [(0, 1), (1, 2), (2, 0)]) is None
    cyc = find_cycle_via_kahn(3, [(0, 1), (1, 2), (2, 0)])
    assert cyc is not None and len(cyc) >= 3

    # 孤立点必须入队
    assert kahn_topo(3, []) == [0, 1, 2]
    print("all tests passed")
```

## 五、与其他技术对比

| 维度 | Kahn（BFS 入度） | DFS 后序逆序 | 暴力反复扫描 |
|---|---|---|---|
| 时间 | $O(V+E)$ | $O(V+E)$ | 最坏 $O(V\cdot E)$ |
| 空间 | $O(V)$ 显式队列 | 递归栈 $O(V)$，深图可能爆栈 | $O(V+E)$ |
| 环检测 | 输出数 $<V$ 即有环 | 遇 GRAY 节点 | 扫完找不到可输出点 |
| 环定位 | 需残余图再 DFS | 天然带递归路径 | 麻烦 |
| 有序输出 | 换堆即字典序最小 | 需改出边遍历顺序 | 麻烦 |
| 并行分层 | 同轮入度归零者一层 | 不直观 | 可做 |
| 实现难度 | 低，不易错 | 三色标记易错 | 低但慢 |

工程取舍：需要**稳定/可控输出顺序**（字典序、按优先级）时选 Kahn + 堆；需要**附带环路径**或做深度优先依赖分析（如 Tarjan SCC）时选 DFS；需要**并行调度层**时用 Kahn 的按批入队版本。两者都线性，Kahn 无递归风险，在大规模构建图上更常见。

## 六、常见误区

1. **邻接表方向建反**：边 $u\to v$ 应 `adj[u].append(v)` 且 `indeg[v] += 1`。若把入度加在起点，入度 0 的含义就完全错了，输出序不满足依赖。后果：编译顺序错、或误报环。
2. **孤立点忘入队**：初始化只把"有边的"点入队，孤立模块永远进不了 order，最后被误判为环。必须扫描全部 $0\ldots n-1$。
3. **把 Kahn 的任意序当成唯一序**：Kahn 的序取决于队列/堆的取出顺序。面试中说"拓扑序唯一当且仅当任意时刻可输出集合大小均为 1"，否则会有多个合法序；写测试用例不能断言完整顺序，除非排序策略确定。
4. **有环时返回部分 order 却当成功**：必须检查 `len(order) == n`。只判断"循环里没崩"是不够的，部分顺序里被卡住的环上节点被静默丢掉，会让构建系统漏编译目标。
5. **重边/重复边导致入度多减或少减**：若输入可能有重复边，入度应按边计数（重边多次 +1/-1），或先去重再统一 +1。混用会导致入度永不归零、假环。

## 七、与开源书/权威来源对应

- CLRS 第 22.4 节 "Topological sort"：给出基于 DFS 的拓扑排序，并讨论其与 DAG 的等价性；Kahn 形式常作为练习/补充出现。
- Alfred B. Kahn, *Topological sorting of large networks*, Communications of the ACM, 1962：原始提出入度归零式拓扑排序，并强调大规模网络上的效率。
- Sedgewick & Wayne, *Algorithms* (4th ed.), Section 4.2：Digraphs 中给出 Kahn 式拓扑排序实现与应用。
- youngyangyang04/leetcode-master「拓扑排序」专题：课程表 I/II、火星词典等面试题的入度模板。

## 八、面试题

**1. 如何用 Kahn 检测有向图是否有环？**  
跑完整个入度归零过程后，若 `len(order) < n` 则有环，环上节点全部留在未输出集合里；否则无环，`order` 就是拓扑序。若要给出一条环路径，再在残余子图上 DFS 找后向边。

**2. 拓扑序在什么条件下唯一？**  
当且仅当每一步"入度为 0 的可输出集合"都只有一个元素（等价地，DAG 的哈斯图在任何时刻只暴露一个极小元）。此时 Kahn（任意队列）与 DFS 结果一致。否则存在多解，可用堆约束字典序。

**3. 如何输出字典序最小的拓扑序？**  
把队列换成最小堆，每次取编号最小的入度 0 顶点。复杂度变为 $O((V+E)\log V)$。证明用交换论证：最优字典序解的下一个点必是当前可输出集合的最小者。

**4. 如何求拓扑排序的"并行分层"（每层可同时执行）？**  
按 BFS 批处理：把当前队列里所有入度 0 的点作为一层输出，统一删边后，下一轮新归零的点作为下一层。层内节点无依赖可并行，层数是关键路径长度（各点权为 1 时）。

## 九、演进与趋势

Kahn 的"剥洋葱"思想延伸出很多现代结构：**增量拓扑排序**支持边的插入/删除（构建系统改一个文件只更新受影响子图）；**最小高度树**（LeetCode 310）就是反复剥掉叶子（入度 1 的点的对称版）直到剩 1–2 个点；**SCC 缩点后再 Kahn** 处理允许环的依赖簇（先 Tarjan 把环压成点）；**约束求解与 SAT** 在依赖带版本/条件时取代纯拓扑。工程上，Bazel、Ninja、Turborepo、pnpm workspace 都在用 DAG + 拓扑分层做并行构建与缓存失效传播；Kubernetes 的 CRD 依赖、Terraform 的资源依赖图也是同一模型。并行调度里再配上"层内关键路径优先"，就成了 PERT/CPM 的调度内核。

## 十、小结

Kahn 算法用入度计数与队列，在 $O(V+E)$ 内完成拓扑排序与环检测：入度归零者可立即输出，删边更新后继，输出数不足 $|V|$ 即有环。它空间可控、顺序可控（堆化得字典序）、还能分层并行，是依赖解析与任务调度的默认入口；理解"入度 = 未满足前驱数"这一不变量，就能同时掌握正确性、环判定与各种扩展。
