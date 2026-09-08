# Prim二叉堆优化

> 对应 CLRS。

## 一、背景与挑战
稀疏图下 $O(V^2)$ 太慢。用最小堆维护候选点，把选最小 key 降到对数级。

## 二、核心原理
堆中存 `(key[u], u)`；弹出最小即下个入树点（懒删除跳过已处理）。松弛邻居时若更小则入堆。

## 三、形式化与数学基础
每点最多入堆一次，每次 `heappop`/`heappush` $O(\log V)$：
$T=O((V+E)\log V)$。

## 四、代码实现
```python
import heapq
def prim_heap(graph):
    n = len(graph)
    visited = [False] * n
    pq = [(0, 0)]
    total = 0
    while pq:
        w, u = heapq.heappop(pq)
        if visited[u]:
            continue
        visited[u] = True
        total += w
        for v, wt in graph[u]:
            if not visited[v]:
                heapq.heappush(pq, (wt, v))
    return total
```

## 五、与其他技术对比
相比朴素 $O(V^2)$，堆优化在稀疏图大幅提速；与 Kruskal 同为 $O(E\log V)$ 量级，Prim 对边稀疏更稳。

## 六、常见误区
未做懒删除（vis 跳过）会让同一点多次处理；用 `(w,u)` 元组需保证 w 可比。

## 七、与开源书/权威来源对应
CLRS 第 23.2 节 Prim 的堆实现。

## 八、面试题
写堆优化 Prim；懒删除的作用？

## 九、演进与趋势
斐波那契堆理论更优但常数大；工程多选二叉堆。

## 十、小结
堆优化 Prim 以最小堆选点，稀疏图 $O((V+E)\log V)$，是通用 MST 实现。
