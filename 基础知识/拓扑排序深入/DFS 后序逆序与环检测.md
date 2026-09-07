# DFS 后序逆序与环检测

> 对应 CLRS 第 22.4 章（拓扑排序的 DFS 法）与 Tarjan 1972（DFS 与环）。

## 一、背景与挑战
用一次 DFS 完成拓扑排序，并顺带检测环。需要三色标记区分未访问/访问中/已访问。

## 二、核心原理
DFS 离开节点时将其压入栈（后序）。最终逆序栈即为拓扑序。若 DFS 中遇到"访问中"节点，说明存在后向边即环。

## 三、形式化与数学基础
后序完成序满足：若 $u\to v$，则 $v$ 先完成（后序中 $v$ 在前），逆序后 $u$ 在前，满足拓扑约束。

## 四、代码实现
```python
def topo_dfs(n, edges):
    adj = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)
    WHITE, GRAY, BLACK = 0, 1, 2
    color = [WHITE] * n
    stack = []
    has_cycle = [False]

    def dfs(u):
        color[u] = GRAY
        for v in adj[u]:
            if color[v] == GRAY:
                has_cycle[0] = True
            elif color[v] == WHITE:
                dfs(v)
        color[u] = BLACK
        stack.append(u)

    for i in range(n):
        if color[i] == WHITE:
            dfs(i)
    if has_cycle[0]:
        return None
    return stack[::-1]
```

## 五、与其他技术对比
Kahn 用入度队列；DFS 法用颜色栈，能精确定位环路径，适合深度优先依赖分析。

## 六、常见误区
- 三色标记用错，导致把横叉边误判为环。
- 忘记逆序栈。

## 七、与开源书/权威来源对应
- CLRS 22.4 DFS 拓扑排序。
- Tarjan 1972 强连通分量（基于 DFS）。

## 八、面试题
1. DFS 拓扑排序为何要逆后序？
2. 如何区分后向边（环）与横叉边？

## 九、演进与趋势
DFS 框架扩展为 Tarjan/SCC、强连通缩点，进而处理带环图的依赖。

## 十、小结
DFS 后序逆序得拓扑序，GRAY 遇 GRAY 即环，三色标记是关键。
