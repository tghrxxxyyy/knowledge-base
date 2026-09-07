# 最短路径 Dijkstra 的贪心本质

> 对应 Dijkstra 1959（Numerische Mathematik）与 CLRS 第 24 章（单源最短路径）。

## 一、背景与挑战
给定非负权有向图与源点 $s$，求到所有点的最短距离。暴力松弛无法保证效率，负权还需 Bellman-Ford。

## 二、核心原理
维护已确定最短距离的集合 $S$。每步从"未完成"点中取距离最小者 $u$ 加入 $S$，并松弛其出边。关键：一旦 $u$ 出堆，其 $dist[u]$ 已是最优。

## 三、形式化与数学基础
贪心选择性质：对非负权图，当前距离最小且未确定的点 $u$ 满足 $dist[u]=\delta(s,u)$。证明用反证：若存在更短路径必经过某未确定点，但其距离更大，矛盾。

## 四、代码实现
```python
import heapq

def dijkstra(graph, s):
    n = len(graph)
    dist = [float('inf')] * n
    dist[s] = 0
    pq = [(0, s)]
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
Bellman-Ford 可处理负权但 $O(VE)$；Dijkstra 在非负权下 $O((V+E)\log V)$。A* 在 Dijkstra 上加启发式。

## 六、常见误区
- 在含负权边图上使用 Dijkstra（结果错误）。
- 忘记"出堆即确定"的剪枝（d>dist[u] 跳过）。

## 七、与开源书/权威来源对应
- Dijkstra 1959 原始论文提出该算法。
- CLRS 24.3 节给出正确性证明。
- leetcode-master 最短路专题含堆优化模板。

## 八、面试题
1. Dijkstra 为什么要求非负权？
2. 如何用优先队列实现 $O((V+E)\log V)$？

## 九、演进与趋势
Dijkstra 衍生出斐波那契堆理论界、双向 Dijkstra、Contraction Hierarchies（地图导航）。

## 十、小结
Dijkstra 是对"当前最近点"的贪心，正确性依赖非负权与"出堆即确定"。
