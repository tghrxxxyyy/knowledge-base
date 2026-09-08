# HLC在分布式事务中的应用

> 对应 CockroachDB 工程实践与 HLC 论文（Kulkarni et al. 2014）。

## 一、背景与挑战
分布式数据库需要为事务分配全局可比较的时间戳，以支持 MVCC 快照隔离与外部一致性。若用物理时钟，漂移会导致「后发生的事务拿到更小时间戳」；若用纯逻辑时钟，无法支持「读已提交时刻的快照」。HLC 恰到好处。

## 二、核心原理
每个事务开始时取本地 HLC 作为读时间戳；提交时取 HLC 作为提交时间戳，并保证提交时间戳严格大于所有已见时间戳（因果加物理）。Snapshot 读用小于自身时间戳的最新已提交版本。

## 三、形式化与数学基础
设事务 T 见过的 HLC 集合为 \\(S_T\\)，其提交时间戳 \\(ts(T)\\) 满足
\\[
ts(T) > \max_{(l,c)\in S_T}(l,c)
\\]
快照隔离要求读看到的版本满足 \\(ts(v)\le ts_{read}(T)\\)。

## 四、代码实现
```python
def assign_commit_ts(seen_max_l, seen_max_c, local_l, local_c, pt):
    l_new, c_new = recv(local_l, local_c, seen_max_l, seen_max_c, pt)
    # 保证严格大于本地已见
    return l_new, c_new + 1
```

## 五、与其他技术对比
Spanner 用 TrueTime 等待 \\(\epsilon\\) 实现外部一致性；CockroachDB 用 HLC 加跨范围「不确定性重试」近似；纯逻辑时钟无法做快照读。

## 六、常见误区
1. 认为 HLC 自动保证线性一致：还需提交等待或冲突重试。
2. 忽略跨节点不确定性窗口：仍可能需读重试。
3. 把 HLC 当精确时间做 TTL：应使用物理时钟加 TTL 机制配合。

## 七、与开源书/权威来源对应
CockroachDB 文档详述 HLC 用于 MVCC；DDIA 第7章讲快照隔离与 MVCC。

## 八、面试题
问：HLC 如何支持快照读？
答：事务以 HLC 为读时间戳，读取所有提交时间戳不大于它的已提交版本。

## 九、演进与趋势
HLC 与时钟同步服务深度结合，成为 NewSQL 默认时间戳方案。

## 十、小结
HLC 为分布式事务提供有界、可比较、保因果的时间戳，是 MVCC 的关键基础设施。
