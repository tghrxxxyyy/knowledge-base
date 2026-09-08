# Boruvka算法

> 对应 Tarjan。

## 一、背景与挑战
需要并行或天然多组件增长的 MST 算法时，Boruvka 每轮让每个连通分量选最小出边，快速收缩。

## 二、核心原理
每轮：每个连通分量找连向外的最小权边，把所有选出的边加入（不形成环的），然后收缩分量。每轮分量数至少减半。

## 三、形式化与数学基础
每轮扫所有边 $O(E)$，轮数 $O(\log V)$：
$T=O(E\log V)$，天然适合并行。

## 四、代码实现
```python
def boruvka(edges, n):
    parent = list(range(n))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    total = 0
    while True:
        best = {}  # 分量 -> (权, u, v)
        for u, v, w in edges:
            ru, rv = find(u), find(v)
            if ru == rv:
                continue
            for comp, other in ((ru, (w, u, v)), (rv, (w, u, v))):
                if comp not in best or w < best[comp][0]:
                    best[comp] = (w, u, v)
        added = 0
        for w, u, v in best.values():
            ru, rv = find(u), find(v)
            if ru != rv:
                parent[ru] = rv
                total += w
                added += 1
        if added == 0:
            break
    return total
```

## 五、与其他技术对比
相比 Prim/Kruskal，Boruvka 每轮批量收缩、可并行；常与 Kruskal 混用（Filter-Kruskal）。

## 六、常见误区
每组件可能选出同一条边被两侧计入，需按并查集去重；忽略轮数终止条件会死循环。

## 七、与开源书/权威来源对应
Boruvka 1926 原始算法；Tarjan 并行 MST 论述。

## 八、面试题
Boruvka 为何每轮分量减半？如何与 Kruskal 结合？

## 九、演进与趋势
现代大规模图 MST 多用 Boruvka + 滤波 + 并行。

## 十、小结
Boruvka 每轮各分量选最小出边并收缩，$O(E\log V)$ 且易并行，是大规模 MST 基础。
