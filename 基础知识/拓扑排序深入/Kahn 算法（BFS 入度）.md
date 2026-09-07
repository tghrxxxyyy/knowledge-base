# Kahn 算法（BFS 入度）

> 对应 Tarjan 1972（强连通分量相关）与 CLRS 第 22.4 章（拓扑排序），及 youngyangyang04/leetcode-master。

## 一、背景与挑战
对有向无环图（DAG）求一个线性序，使所有边 $u\to v$ 满足 $u$ 在 $v$ 前。用于编译依赖、任务调度。

## 二、核心原理
不断取入度为 0 的节点加入结果，删除其出边（邻接点入度减 1）。队列空时若仍有未访问节点，则存在环。

## 三、形式化与数学基础
每步选 $v$ 使 $indeg(v)=0$。删除 $v$ 后对所有 $(v,u)$ 执行 $indeg(u)\leftarrow indeg(u)-1$。若最终输出数 $< |V|$，图含环。

## 四、代码实现
```python
from collections import deque, defaultdict

def kahn(n, edges):
    indeg = [0] * n
    adj = defaultdict(list)
    for u, v in edges:
        adj[u].append(v)
        indeg[v] += 1
    q = deque(i for i in range(n) if indeg[i] == 0)
    order = []
    while q:
        u = q.popleft()
        order.append(u)
        for v in adj[u]:
            indeg[v] -= 1
            if indeg[v] == 0:
                q.append(v)
    return order if len(order) == n else None  # None 表示有环
```

## 五、与其他技术对比
DFS 后序逆序也能拓扑排序；Kahn 更直观且在输出同时检测环，无需递归栈。

## 六、常见误区
- 邻接表建错方向（入度应加在终点）。
- 用 Kahn 得到多种合法序时误认为"唯一"。

## 七、与开源书/权威来源对应
- CLRS 22.4 给出 Kahn（BFS）拓扑排序。
- leetcode-master 课程表/拓扑排序。

## 八、面试题
1. 如何用 Kahn 检测有向图是否有环？
2. 拓扑序是否唯一？什么条件下唯一？

## 九、演进与趋势
带权任务的拓扑排序扩展为关键路径（见后续文档）；并行调度用层序。

## 十、小结
Kahn = 反复取入度 0 节点并删边，输出数不足即存在环。
