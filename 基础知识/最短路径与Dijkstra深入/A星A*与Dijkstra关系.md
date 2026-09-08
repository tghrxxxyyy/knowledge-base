# A星A*与Dijkstra关系

> 对应 youngyangyang04/leetcode-master。

## 一、背景与挑战
单源到单目标的最短路，Dijkstra 会扩展过多无关节点。A* 用启发函数引导搜索方向。

## 二、核心原理
A* 把优先队列键值改为 $f(n)=g(n)+h(n)$，$g$ 为已走距离、$h$ 为到目标的估计。取 $h=0$ 即退化为 Dijkstra。若 $h$ 可采纳（不高估）且一致，则 A* 最优。

## 三、形式化与数学基础
Dijkstra 扩展所有 $f=g$ 节点；A* 在一致启发下只扩展必要节点，扩展数 $\le$ Dijkstra：
$T=O(E)$ 次堆操作，常数更小。

## 四、代码实现
```python
import heapq
def astar(graph, src, dst, h):
    pq = [(h(src), 0, src)]
    g = {src: 0}
    while pq:
        f, cost, u = heapq.heappop(pq)
        if u == dst:
            return cost
        for v, w in graph[u]:
            ng = cost + w
            if ng < g.get(v, float("inf")):
                g[v] = ng
                heapq.heappush(pq, (ng + h(v), ng, v))
    return float("inf")
```

## 五、与其他技术对比
相比 Dijkstra 盲目扩展，A* 借启发更快到达目标；相比贪心最佳优先（只用 $h$），A* 在可采纳启发下保证最优。

## 六、常见误区
用不可采纳的 $h$（高估）会丢失最优性；曼哈顿/欧氏距离需匹配移动模型（四连通用曼哈顿）。

## 七、与开源书/权威来源对应
youngyangyang04/leetcode-master 第 126、127、A* 题；CLRS 第 24 章注记。

## 八、面试题
A* 何时最优？h=0 为何等于 Dijkstra？

## 九、演进与趋势
双向 A*、ALT（ landmarks + 三角不等式）在路网/游戏寻路大幅加速。

## 十、小结
A* 是带启发 $h$ 的 Dijkstra，$h=0$ 时完全等价；可采纳且一致的 $h$ 保证最优且更少扩展。
