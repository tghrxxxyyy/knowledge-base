# 最小生成树：Kruskal 与 Prim

> 对应 Kruskal 1956（Proc. AMS）与 Prim 1957（Bell Syst. Tech. J.），综述见 CLRS 第 23 章。

## 一、背景与挑战
连通无向图 $G=(V,E)$ 中，求总权最小的生成树。应用包括网络布线、聚类。暴力枚举所有生成树不可行（$V^{V-2}$ 量级）。

## 二、核心原理
两者都是贪心，但贪心视角不同：
- Kruskal：按边权升序，用并查集跳过成环的边。
- Prim：从某点出发，每次把离当前树最近的顶点并入。

## 三、形式化与数学基础
切割性质：对图的任意切割，跨切割的最小权边必属于某棵 MST。即若 $S\subset V$，则 $\min\{w(u,v)\mid u\in S,v\notin S\}$ 落在某 MST 中。

## 四、代码实现
```python
def kruskal(edges, n):
    # edges: list of (weight, u, v)
    parent = list(range(n))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    edges.sort()
    total = 0
    for w, u, v in edges:
        ru, rv = find(u), find(v)
        if ru != rv:
            parent[ru] = rv
            total += w
    return total
```

## 五、与其他技术对比
Kruskal 适合稀疏图（$O(E\log E)$）；Prim 配二叉堆 $O(E\log V)$，用斐波那契堆可达 $O(E+V\log V)$，适合稠密图。

## 六、常见误区
- 误以为"最小边"任意选都不会错（需配合无环检查）。
- 忘记处理不连通图（此时无生成树，应判无解）。

## 七、与开源书/权威来源对应
- Kruskal 1956 原始论文给出按权排序思想。
- CLRS 23 章证明切割性质与算法正确性。
- leetcode-master 最小生成树专题含模板。

## 八、面试题
1. 为什么 Kruskal 用并查集？并查集路径压缩对复杂度影响？
2. 如何用 MST 做 K 聚类（Kruskal 反向）？

## 九、演进与趋势
MST 扩展到斯坦纳树（NP-hard）、动态图 MST、分布式/流式环境下近似 MST。

## 十、小结
Kruskal 与 Prim 都是基于切割性质的贪心；稀疏用 Kruskal，稠密用 Prim。
