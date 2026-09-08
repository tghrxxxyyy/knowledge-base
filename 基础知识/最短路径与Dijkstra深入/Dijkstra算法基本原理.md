# Dijkstra算法基本原理

> 对应 Dijkstra 1959。

## 一、背景与挑战
单源最短路径在非负权图中是基础设施。Dijkstra 以贪心每次确定离源最近的点。

## 二、核心原理
维护距离数组，每轮从未确定点中选 dist 最小者，标记确定并松弛其出边。非负权保证一旦确定即最终最短路。

## 三、形式化与数学基础
稠密图用线性扫描选最小，每轮 $O(V)$、松弛 $O(V)$：
$T=O(V^2)$，要求边权非负。

## 四、代码实现
```python
def dijkstra_naive(graph, src):
    n = len(graph)
    dist = [float("inf")] * n
    dist[src] = 0
    done = [False] * n
    for _ in range(n):
        u = min((dist[i], i) for i in range(n) if not done[i])[1]
        done[u] = True
        for v in range(n):
            if graph[u][v] > 0 and not done[v]:
                dist[v] = min(dist[v], dist[u] + graph[u][v])
    return dist
```

## 五、与其他技术对比
相比 Bellman-Ford（支持负权），$O(V^2)$ 在正权图更快；稀疏图应换堆优化。负权会使 Dijkstra 失效。

## 六、常见误区
存在负权边时 Dijkstra 错误（已确定点可能被更短路径更新）；`graph[u][v] > 0` 仅适用于 0 表无边。

## 七、与开源书/权威来源对应
Dijkstra 1959 原始论文；CLRS 第 24 章。

## 八、面试题
为什么 Dijkstra 要求非负权？它与 Prim 的相似与不同？

## 九、演进与趋势
与 A*、堆优化结合；在路网中用双向 Dijkstra、ALT 加速。

## 十、小结
Dijkstra 以非负权下的贪心确定最短路，朴素实现 $O(V^2)$，是单源最短路基石。
