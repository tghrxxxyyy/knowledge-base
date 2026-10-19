# DFS 后序逆序与环检测

> 对应 CLRS《Introduction to Algorithms》第 22.3–22.4 节（DFS 与拓扑排序）、Tarjan 1972（"Depth-first search and linear graph algorithms"），以及 youngyangyang04/leetcode-master 拓扑排序 DFS 写法。

## 一、背景与挑战

Kahn 用入度队列"剥洋葱"排出拓扑序，但工程里还有一类需求：既要得到顺序，又想知道**依赖链本身**——比如构建失败时打印"谁循环依赖了谁"，或者在深度优先的代码生成/IR 遍历中天然按 DFS 顺序处理。DFS 后序逆序（reverse postorder）恰好同时满足这两点：一次深度优先遍历即可产出拓扑序，而且递归路径本身就是候选的依赖链，后向边直接指向环。

朴素 DFS 不加区分地"访问过就跳过"是不够的。无向图的 visited 标记在有向图里会误判：一个节点可能在**当前递归栈上**（是祖先，存在后向边=环），也可能只是**另一条分支上已访问完**（横叉边/正向边，不是环）。如果只用两个状态（访问过/没访问过），横叉边会被当成环，或者后向边被漏掉。因此必须引入**三色标记**：白（未入）、灰（在当前 DFS 栈上，探索中）、黑（已完全结束）。

三色法是所有 DFS 图算法的底座：拓扑排序判环、Tarjan 求强连通分量、求桥/割点、判断二分图、记忆化搜索的"计算中"哨兵，全靠灰/黑区分"栈上"与"已完成"。面试里"DFS 拓扑为什么逆后序""如何打印环""横叉边是不是环"是经典追问，答不上来就暴露只背了模板。

## 二、核心原理

DFS 离开节点时把节点压入栈（**后序完成序**，postorder）。最终把栈整体反转，就得到一个合法拓扑序。机制可以这样理解：当 DFS 从 $u$ 退出时，它已经遍历完 $u$ 能到达的所有后继；若图无环，这些后继会在 $u$ 之前完成，于是后序中后继在前、$u$ 在后——反转后 $u$ 在前、后继在后，正好满足"前驱在前"的拓扑约束。

**三色不变量**：
- 白：尚未发现；
- 灰：已发现、仍在当前递归路径（栈）上，它的部分后继可能还没遍历完；
- 黑：已完全结束，它的全部可达点都已处理完毕。

**环检测规则**：遍历 $u$ 的邻接点 $v$ 时——
- $v$ 是白：树边，递归进入；
- $v$ 是灰：**后向边**，$v$ 是 $u$ 的祖先，$u\to v$ 与树上 $v\rightsquigarrow u$ 合成环；
- $v$ 是黑：横叉边或正向边，**不是环**，直接跳过。

关键是把"灰"当成"在栈上"。后向边是环的充要特征：DAG 的 DFS 中不存在后向边；有向图有环 $\iff$ DFS 中存在后向边（在该 DFS 森林里）。

**为何是逆后序而非前序**：前序（进入时记录）满足的是"父亲在儿子前"，但兄弟子树之间没有相对约束，兄弟 A 完全可能指向兄弟 B，此时前序无法保证 A 在 B 前。后序的"离开才记录"天然让**所有后代先于祖先完成**；对于跨子树的边 $u\to v$，若 $v$ 是 $u$ 的后代，后序保证 $v$ 先完成；若 $v$ 已是黑（别的分支），说明 $v$ 已先完成；若 $v$ 是灰则是环。因此反转后序总能给出拓扑序（无环时）。

**边界条件**：森林（多个连通分量）要对每个未访问的白点起跑 DFS，不能只从 0 开始；孤立点也要入栈；自环 $v\to v$ 在访问 $v$ 的邻接时会看到自己是灰，判为环；递归深度可达 $O(V)$，长链会爆栈，生产代码可改显式栈（但显式栈要小心"灰/黑"的维护时机，需用"迭代加深/两阶段出栈"技巧）。

**打印环路径**：发现后向边 $u\to v$（$v$ 灰）时，从 $u$ 沿 parent/递归栈回溯到 $v$，这段路径再加上 $v\to\cdots\to u$ 就是环。实现上可在递归栈里维护 `path` 列表，遇到灰邻接时切片 `path[idx(v):] + [v]`。

## 三、形式化与数学基础

**定理（逆后序 = 拓扑序）**：设 $G$ 为 DAG，$u \to v \in E$。DFS 后序完成时间满足 $finish(v) < finish(u)$（$v$ 先完成）。证明分三种情况：
1. DFS 先访问到 $v$：则 $u$ 在 $v$ 的 DFS 树子树外或之后；若 $u$ 在 $v$ 之后才被发现，$v$ 必已黑，$finish(v) < finish(u)$；
2. DFS 先访问到 $u$：由于 $u\to v$，$v$ 是 $u$ 的后代（或已黑）。若是后代，递归完成时 $v$ 先于 $u$ 完成；若已黑，$finish(v)$ 已定且更早；
3. 不可能出现 $finish(u) < finish(v)$ 且 $u\to v$ 而无环：否则 $v$ 完成时 $u$ 必须是灰（$u$ 在栈上未完成）但边是 $u\to v$，意味着 $u$ 仍在探索 $v$ 的祖先路径上…详细地：若 $finish(u) < finish(v)$，则 $u$ 先完成；当 $u$ 完成时 $v$ 要么已黑（$finish(v) < finish(u)$，矛盾）要么仍白/灰。若白，从 $u$ 沿边会访问 $v$，$v$ 成 $u$ 后代，$finish(v) < finish(u)$，矛盾；若灰，$u\to v$ 是后向边，$G$ 有环，矛盾。

因此 DAG 中 $u\to v \Rightarrow finish(v) < finish(u)$，按完成时间降序（即逆后序）排列即得拓扑序。

**环与后向边等价**：$G$ 有环 $\iff$ 某次 DFS 出现后向边。($\Leftarrow$) 后向边 $u\to v$ 加上树路径 $v\rightsquigarrow u$ 成环。($\Rightarrow$) 设环 $v_1\to\cdots\to v_k\to v_1$，考虑 DFS 中最早被发现的环上点 $v_i$，从它出发沿环走一圈，必在某条边上撞到仍为灰的祖先，即后向边。

**三色与 DFS 树边分类**：树边（白→进入）、后向边（灰，指向祖先）、正向边（黑，指向后代）、横叉边（黑，指向其他子树）。DAG 的 DFS 树只有树边、正向边、横叉边，无后向边。

**复杂度**：每个顶点变灰/黑各一次，每条边在邻接扫描时被检查一次，$O(V+E)$；递归栈 $O(V)$。Tarjan 同框架可求 SCC，缩点后得 DAG 再拓扑，是处理"有环依赖簇"的标准管线。

## 四、代码实现

```python
import sys
sys.setrecursionlimit(1_000_000)


def topo_dfs(n, edges):
    """DFS 后序逆序拓扑排序。有环返回 None，否则返回拓扑序。"""
    adj = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)

    WHITE, GRAY, BLACK = 0, 1, 2
    color = [WHITE] * n
    order = []          # 后序完成序
    cycle = []          # 若有环，存一条环路径

    path = []           # 当前递归栈
    on_stack_index = {}

    def dfs(u):
        color[u] = GRAY
        on_stack_index[u] = len(path)
        path.append(u)
        for v in adj[u]:
            if color[v] == GRAY:
                # 后向边 -> 找到环
                i = on_stack_index[v]
                cycle.extend(path[i:] + [v])
                return True
            if color[v] == WHITE and dfs(v):
                return True
        path.pop()
        del on_stack_index[u]
        color[u] = BLACK
        order.append(u)  # 后序
        return False

    for i in range(n):
        if color[i] == WHITE:
            if dfs(i):
                return None  # 有环
    order.reverse()          # 逆后序 = 拓扑序
    return order


def has_cycle(n, edges):
    """只判环（可打印环路径）"""
    adj = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)
    color = [0] * n
    parent = [-1] * n

    def dfs(u):
        color[u] = 1
        for v in adj[u]:
            if color[v] == 1:
                return True
            if color[v] == 0:
                parent[v] = u
                if dfs(v):
                    return True
        color[u] = 2
        return False

    return any(color[i] == 0 and dfs(i) for i in range(n))


def topo_dfs_iterative(n, edges):
    """显式栈版，避免深递归爆栈。返回拓扑序或 None。"""
    adj = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)

    WHITE, GRAY, BLACK = 0, 1, 2
    color = [WHITE] * n
    order = []

    for start in range(n):
        if color[start] != WHITE:
            continue
        # stack 元素: (node, next_child_index)
        stack = [(start, 0)]
        color[start] = GRAY
        while stack:
            u, i = stack[-1]
            if i < len(adj[u]):
                stack[-1] = (u, i + 1)
                v = adj[u][i]
                if color[v] == GRAY:
                    return None  # 环
                if color[v] == WHITE:
                    color[v] = GRAY
                    stack.append((v, 0))
            else:
                stack.pop()
                color[u] = BLACK
                order.append(u)

    order.reverse()
    return order


if __name__ == "__main__":
    edges = [(1, 0), (2, 0), (3, 1), (3, 2)]
    seq = topo_dfs(4, edges)
    assert seq is not None
    # 校验拓扑性质
    pos = {x: i for i, x in enumerate(seq)}
    assert all(pos[u] < pos[v] for u, v in edges)

    assert topo_dfs(3, [(0, 1), (1, 2), (2, 0)]) is None
    assert topo_dfs_iterative(3, [(0, 1), (1, 2), (2, 0)]) is None

    # 横叉边不是环: 0->1, 0->2, 1->2
    assert topo_dfs(3, [(0, 1), (0, 2), (1, 2)]) is not None

    # 孤立点
    assert sorted(topo_dfs(3, [])) == [0, 1, 2]
    print("all tests passed")
```

## 五、与其他技术对比

| 维度 | DFS 三色后序逆序 | Kahn 入度 BFS | 并查集 |
|---|---|---|---|
| 时间 | $O(V+E)$ | $O(V+E)$ | 近 $O(\alpha(n))$/边 |
| 判环 | 后向边（灰遇灰） | 输出数 $<$ $V$ | 只适合无向连通 |
| 环路径 | 天然递归路径可打印 | 需残余图再 DFS | 不适用 |
| 爆栈风险 | 递归版有，需改迭代 | 无 | 无 |
| 输出顺序 | 与 DFS 起点/出边序相关 | 队列可控，堆可字典序 | 无序 |
| 附带能力 | 正向/横叉边分类、SCC 前奏 | 并行分层直观 | 连通分量 |

取舍：要**环的具体链路**、要继续做 **Tarjan SCC / 桥**，用 DFS；要**稳定字典序**、要**并行层**、怕爆栈，用 Kahn。两者输出可以不同但都合法。面试中若被追问"如何不用递归"，给上面显式栈版本，并指出灰/黑必须在出栈时才标黑，否则横叉边会误判。

## 六、常见误区

1. **两色 visited 代替三色**：把"已访问"混成一种状态，会把横叉边/正向边当后向边误报环（例如菱形 $0\to1,0\to2,1\to3,2\to3$ 会在 2→3 处误判）。正确做法是区分"在栈上（灰）"与"已完成（黑）"。
2. **忘记逆序**：后序直接输出是"逆拓扑"（后继在前）。用它当依赖顺序会先编译依赖者、后编译被依赖者，构建必挂。务必 `order.reverse()`。
3. **只从 0 号点 DFS**：多连通分量时漏掉其他分量，结果不完整甚至误判无环。必须 `for i in range(n)` 起跑。
4. **把黑点再当环**：访问到黑邻接时直接跳过即可；若对黑点再递归或报环，复杂度退化且结果错误。
5. **打印环时只输出两个端点**：后向边 $u\to v$ 只是环的一条边，必须沿递归栈从 $u$ 回溯到 $v$ 才是完整环；只打印 "u->v 有环" 对调试构建几乎没用。

## 七、与开源书/权威来源对应

- CLRS 第 22.3 节（DFS）与 22.4 节（拓扑排序）：递归后序压栈反转的标准写法，及边分类讨论。
- R. Tarjan, *Depth-first search and linear graph algorithms*, SIAM J. Computing, 1972：DFS 时间戳、低点、SCC 与环结构的奠基论文。
- Sedgewick & Wayne, *Algorithms*, Section 4.2：Digraph DFS、有向环检测 `DirectedCycle` 的完整实现。
- youngyangyang04/leetcode-master「拓扑排序」：DFS 版课程表解法与环检测模板。

## 八、面试题

**1. DFS 拓扑排序为何要逆后序？**  
DFS 离开节点时，其全部后代（后继）都已完成；后序保证后代在前、祖先在后。反转后祖先在前，对 DAG 的每条边 $u\to v$ 都有 $u$ 在 $v$ 前，故是拓扑序。

**2. 如何区分后向边与横叉边？**  
用三色：目标是 GRAY（在当前递归栈上）才是后向边，构成环；目标是 BLACK（其他分支已完成）则是横叉边或正向边，不是环。两色标记无法区分这两种情况。

**3. 如何输出一条具体的环路径？**  
递归时维护当前路径（栈）。遇到 GRAY 邻接 $v$ 时，从路径中 $v$ 的位置切片到末尾再加上 $v$，就是环。Kahn 判环后也可在残余子图上再跑一次 DFS 找后向边。

**4. 深图递归爆栈怎么办？**  
改显式栈模拟 DFS，维护 `(node, child_index)` 与颜色；出栈时才标 BLACK 并记入后序。Python 里也可 `sys.setrecursionlimit`，但生产上更推荐显式栈或改用 Kahn。

## 九、演进与趋势

三色 DFS 是通往更高级算法的入口：**Tarjan SCC**（用 `dfn/low` 在同一 DFS 里求强连通分量）可把依赖环压缩成点，得到 condensation DAG 再拓扑，用于包管理器容忍"循环依赖簇"；**桥/割点、双连通分量**同样基于 DFS 时间戳；**记忆化搜索**里"计算中"状态就是灰色，防止递归死循环（如带环状态图的 DP）。工程上，webpack/Rustc 的模块图、数据库查询计划的表达式 DAG、数据流分析的基本块序，都常用 DFS 后序做求值顺序；而在需要给出用户可读错误时，"打印灰路径切片"就是循环依赖报告的核心。

## 十、小结

DFS 后序逆序在一趟 $O(V+E)$ 遍历中同时给出拓扑序与环检测：离开时入栈、反转得序，三色标记下"灰遇灰"即后向边成环。它与 Kahn 各有所长——DFS 贴近依赖链、易打印环、可扩展 SCC；理解后序为何正确、横叉边为何不是环，才算真正掌握拓扑排序的 DFS 视角。
