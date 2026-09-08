# Prim与Kruskal对比

> 对应 Sedgewick《Algorithms》。

## 一、背景与挑战
两种经典 MST 算法如何选？取决于图稠密程度、是否需要边列表与具体场景。

## 二、核心原理
Prim 以点为中心逐步长树，适合边多的稠密图；Kruskal 以边为中心按权增长，适合边少的稀疏图。二者都基于「切分性质」的贪心。

## 三、形式化与数学基础
Prim（堆）：$O((V+E)\log V)$；Kruskal：$O(E\log E)$。稠密图 $E\approx V^2$ 时 Prim 更优，稀疏图 Kruskal 更优。

## 四、代码实现
```python
# Prim 关注点集合与 key，Kruskal 关注排序边与并查集
# 选择依据：E 的大小与是否已有边列表
def choose_mst(graph, n):
    E = sum(len(graph[u]) for u in range(n)) // 2
    return "prim" if E > n * n // 4 else "kruskal"
```

## 五、与其他技术对比
Prim 需邻接结构、利于稠密；Kruskal 只需边列表、便于流式/分布式；Boruvka 在并行场景更友好。

## 六、常见误区
认为二者结果不同：MST 权值和唯一（若存在唯一 MST 则边集也唯一）；否则边集可能不同但总权相同。

## 七、与开源书/权威来源对应
Sedgewick《Algorithms》第 4 章最小生成树；CLRS 对比两算法。

## 八、面试题
何时选 Prim 何时选 Kruskal？MST 是否唯一？

## 九、演进与趋势
混合算法、并行 MST（如 Filter-Kruskal）应对超大规模图。

## 十、小结
Prim 适合稠密图、Kruskal 适合稀疏图，二者同为贪心 MST，复杂度随边密度此消彼长。
