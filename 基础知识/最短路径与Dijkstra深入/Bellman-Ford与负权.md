# Bellman-Ford与负权

> 对应 Sedgewick《Algorithms》。

## 一、背景与挑战
存在负权边时 Dijkstra 失效。Bellman-Ford 允许负权，通过对所有边反复松弛求最短路。

## 二、核心原理
最多 $V-1$ 轮，每轮松弛全部边；第 $k$ 轮后，所有最多经过 $k$ 条边的最短路已确定。

## 三、形式化与数学基础
每轮 $O(E)$，共 $V-1$ 轮：
$T=O(VE)$，支持负权但不允许负权环（否则无最短路）。

## 四、代码实现
```python
def bellman_ford(edges, n, src):
    dist = [float("inf")] * n
    dist[src] = 0
    for _ in range(n - 1):
        for u, v, w in edges:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
    return dist
```

## 五、与其他技术对比
相比 Dijkstra，Bellman-Ford 支持负权但慢；相比 SPFA，最坏同为 $O(VE)$ 但更稳定可分析。

## 六、常见误区
只松弛 $V-1$ 轮；若存在负权环则最短路无界，需额外检测（见负权环检测）。

## 七、与开源书/权威来源对应
Sedgewick《Algorithms》最短路径；CLRS 第 24.1 节。

## 八、面试题
为什么是 $V-1$ 轮？Bellman-Ford 能否处理负权环？

## 九、演进与趋势
SPFA 为队列优化版，平均快但最坏仍 $O(VE)$；在差分约束系统中常用。

## 十、小结
Bellman-Ford 以 $V-1$ 轮全边松弛求含负权的最短路，复杂度 $O(VE)$。
