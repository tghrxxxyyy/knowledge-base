# 离线LCA

> 对应 Tarjan《Depth-First Search and Linear Graph Algorithms》(1972) 离线 LCA 算法。

## 一、背景与挑战
求树上多对结点的最近公共祖先。离线 Tarjan 算法一次 DFS 用并查集在 O(n+αq) 内回答所有询问。

## 二、核心原理
DFS 过程中，把已访问子树内的结点用并查集并到当前根；当碰到某询问对 (u,v) 且 v 已访问，则 LCA 为 find(v)。

## 三、形式化 / 数学基础
遍历到 u 时，已完成的子树被 union；v 所在的并查集代表即当前 LCA。复杂度 $O(n + q\cdot\alpha(n))$。

## 四、代码实现
```python
def tarjan_lca(n, adj, queries):
    parent = list(range(n))
    visited = [False] * n
    ans = {}
    qmap = {i: [] for i in range(n)}
    for u, v in queries:
        qmap[u].append(v)
        qmap[v].append(u)
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    def dfs(u, p):
        for v in adj[u]:
            if v == p:
                continue
            dfs(v, u)
            parent[v] = u
        visited[u] = True
        for v in qmap[u]:
            if visited[v]:
                ans[(u, v)] = find(v)
    dfs(0, -1)
    return ans
```

## 五、与其他技术对比
与倍增/RMQ 在线 LCA 相比，Tarjan 离线更快但需预先知道全部询问；无法支持动态加询问。

## 六、常见误区
并查集 union 方向错（应把子树并到当前 u）；未标记 visited 导致提前应答；用错根。

## 七、与开源书 / 权威来源对应
- Tarjan 1972
- CS-Notes: https://github.com/CyC2018/CS-Notes

## 八、面试题
「树上两点距离」先求 LCA；「祖孙询问」。

## 九、演进与趋势
倍增 LCA（O(n log n) 预处理，O(log n) 查询）；树剖 / RMQ 解法。

## 十、小结
离线 LCA 用 DFS + 并查集在线性时间内回答全部询问，是「离线 + 并查集」思想的典范。
