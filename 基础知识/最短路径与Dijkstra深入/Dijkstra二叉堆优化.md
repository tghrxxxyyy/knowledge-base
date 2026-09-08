# Dijkstra二叉堆优化

> 对应 CLRS。

## 一、背景与挑战
稀疏图下 $O(V^2)$ 过慢，用最小堆把「取最小 dist」降到对数级。

## 二、核心原理
堆存 `(dist[u], u)`，弹出最小即确定点（懒删除跳过旧值），松弛邻居时若更短则入堆。

## 三、形式化与数学基础
每点最多入堆一次，每次堆操作 $O(\log V)$：
$T=O((V+E)\log V)$。

## 四、代码实现
```python
import heapq
def dijkstra_heap(graph, src):
    n = len(graph)
    dist = [float("inf")] * n
    dist[src] = 0
    pq = [(0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        for v, w in graph[u]:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                heapq.heappush(pq, (dist[v], v))
    return dist
```

## 五、与其他技术对比
相比朴素 $O(V^2)$，堆优化在稀疏图大幅提速；与 SPFA 比，Dijkstra 稳定 $O((V+E)\log V)$。

## 六、常见误区
未用 `d > dist[u]` 跳过过期堆项会重复处理；负权会使算法不正确。

## 七、与开源书/权威来源对应
CLRS 第 24.3 节 Dijkstra 堆实现。

## 八、面试题
写堆优化 Dijkstra；为何需要懒删除？

## 九、演进与趋势
斐波那契堆理论 $O(E+V\log V)$；工程多用二叉堆。配对堆在路网表现好。

## 十、小结
堆优化 Dijkstra 以最小堆取最近点，稀疏图 $O((V+E)\log V)$，是标准最短路实现。
