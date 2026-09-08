# COPS系统因果写

> 对应 Lloyd et al. 2011（COPS: Consistent Causal Consistency）与 DDIA 第9章。

## 一、背景与挑战
COPS 是首个在地理分布式 KV 存储上提供「因果一致加读己之写加单调读」且保持高可用的系统。其难点在于：写操作如何传播依赖、如何在多数据中心间保持因果，而不引入全局同步。

## 二、核心原理
COPS 为每个写分配一个依赖列表（该写因果依赖的先前版本）。写先在本地数据中心提交并异步复制；复制时按依赖顺序应用，保证目标副本不会「悬空」。读依赖检查如前文所述。为支持「事务」COPS 引入 conservative 模式：写全部依赖后才确认。

## 三、形式化与数学基础
依赖关系构成有向无环图 \\(G=(V,E)\\)，\\(E\\) 为因果边。复制调度必须保证拓扑序：任意 \\(v\\) 的所有前驱先于 \\(v\\) 应用，等价于对 DAG 做拓扑排序。

## 四、代码实现
```python
def apply_in_order(writes):
    # 按依赖拓扑排序后应用
    from collections import deque
    indeg = {w: len(w.deps) for w in writes}
    q = deque([w for w in writes if indeg[w] == 0])
    while q:
        w = q.popleft()
        store.put(w)
        for child in w.children:
            indeg[child] -= 1
            if indeg[child] == 0:
                q.append(child)
```

## 五、与其他技术对比
Dynamo 提供最终一致但无因果保证；Spanner 强一致但需同步等待；COPS 在二者间提供因果一致且高可用。

## 六、常见误区
1. 认为 COPS 是线性一致：它是因果一致，并发写可交错。
2. 忽略依赖传播成本：跨区写延迟受依赖链影响。
3. 混淆 causal 与 conservative 模式：后者提供事务性因果。

## 七、与开源书/权威来源对应
COPS 论文是因果一致系统代表作；DDIA 第9章将其作为一致性层级实例。

## 八、面试题
问：COPS 如何保证副本不悬空？
答：写携带依赖列表，复制时按拓扑序应用，前驱必先于后继落地。

## 九、演进与趋势
因果一致思想融入现代多活数据库与 CRDT 框架。

## 十、小结
COPS 用依赖向量与拓扑复制，在可用性与因果正确间取得实用平衡。
