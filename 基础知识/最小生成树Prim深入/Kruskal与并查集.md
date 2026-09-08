# Kruskal与并查集

> 对应 Cormen 等。

## 一、背景与挑战
Kruskal 按边权升序考虑，若两端不连通就选入。判断是否成环依赖并查集（Union-Find）。

## 二、核心原理
边排序后贪心加入；并查集用路径压缩与按秩合并，使连通性查询近常数。最终选 $V-1$ 条边即 MST。

## 三、形式化与数学基础
排序 $O(E\log E)$，并查集操作近乎 $O(\alpha(V))$：
$T=O(E\log E)$（即 $O(E\log V)$），适合稀疏图。

## 四、代码实现
```python
def find(u, parent):
    while parent[u] != u:
        parent[u] = parent[parent[u]]
        u = parent[u]
    return u
def kruskal(edges, n):
    edges.sort(key=lambda e: e[2])
    parent = list(range(n))
    mst = 0
    for u, v, w in edges:
        ru, rv = find(u, parent), find(v, parent)
        if ru != rv:
            parent[ru] = rv
            mst += w
    return mst
```

## 五、与其他技术对比
相比 Prim，Kruskal 边排序一次、实现极简，稀疏图更快；稠密图边多则排序昂贵。

## 六、常见误区
漏写路径压缩导致退化成 $O(E\cdot V)$；并查集未正确合并两棵树。

## 七、与开源书/权威来源对应
Cormen 等第 21 章并查集、第 23 章 Kruskal；Tarjan 并查集平摊分析。

## 八、面试题
并查集路径压缩复杂度？Kruskal 为何正确？

## 九、演进与趋势
按秩/大小合并 + 路径压缩使并查集近乎常数，支撑大规模 MST。

## 十、小结
Kruskal 排序边 + 并查集判环，$O(E\log E)$ 求 MST，是实现最简单的 MST 算法。
