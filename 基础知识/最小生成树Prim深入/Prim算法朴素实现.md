# Prim算法朴素实现

> 对应 Tarjan。

## 一、背景与挑战
最小生成树（MST）在连通带权图中选出总权最小的边集连通所有点。Prim 从一点出发逐步长树。

## 二、核心原理
维护已选集合，每一步从未选点中选「到已选集合距离最小」的点加入，距离即连到树的最小边权。

## 三、形式化与数学基础
稠密图用邻接矩阵，每次线性扫描选最小 key，共 $V$ 轮：
$T=O(V^2)$，适合 $E\approx V^2$ 的稠密图。

## 四、代码实现
```python
def prim_naive(graph):
    n = len(graph)
    key = [float("inf")] * n
    key[0] = 0
    in_mst = [False] * n
    total = 0
    for _ in range(n):
        u = min((key[i], i) for i in range(n) if not in_mst[i])[1]
        in_mst[u] = True
        total += key[u]
        for v in range(n):
            if graph[u][v] > 0 and not in_mst[v] and graph[u][v] < key[v]:
                key[v] = graph[u][v]
    return total
```

## 四之外的补充
`min` 扫描在 $V$ 轮内进行，每轮 $O(V)$；更新邻居 key 也 $O(V)$，合计 $O(V^2)$。

## 五、与其他技术对比
稠密图下 Prim $O(V^2)$ 优于 Kruskal $O(E\log E)$；稀疏图则 Kruskal/堆优化 Prim 更优。

## 六、常见误区
把 0 权边当作不连通（邻接矩阵应以 `inf` 表示无边）；未把选中点的 key 累加进 total 导致结果错误。

## 七、与开源书/权威来源对应
Tarjan 关于 MST 与并查集的论述；CLRS 第 23 章。

## 八、面试题
证明 Prim 贪心正确性（切分性质）；稠密图为何用朴素 Prim？

## 九、演进与趋势
斐波那契堆可把 Prim 降到 $O(E+V\log V)$；工程上二叉堆已足够。

## 十、小结
朴素 Prim 每次选离树最近的点，稠密图 $O(V^2)$，核心是切分性质保证最优。
