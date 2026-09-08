# RSM快照与日志压缩

> 对应 Ongaro & Ousterhout 2014（Raft 快照）与 DDIA 第3章（存储引擎）。

## 一、背景与挑战
命令日志只增不减，长期运行会膨胀，重放变慢、存储吃紧。快照（snapshot）把某一点的状态持久化，之后日志可截断到该点。难点是「何时快照」「快照与日志如何衔接」「恢复时如何合并」。

## 二、核心原理
当日志长度超阈值，副本对当前状态做快照并记下 `last_included_index` 或 `term`。更早的日志可删除。恢复时先加载快照得基准状态，再 apply 快照点之后的日志项。

## 三、形式化与数学基础
设快照覆盖 \\([1, k]\\)，则恢复状态
\\[
S = \delta(snapshot, L[k+1..commit])
\\]
日志只需保留 \\(>k\\) 部分。压缩比取决于状态大小与日志增长率。

## 四、代码实现
```python
def take_snapshot(sm, log, last_idx, last_term):
    snap = serialize(sm.state)
    persist(snap, last_idx, last_term)
    del log[:last_idx]   # 截断已快照部分

def restore(snap, log):
    sm = RSM(deserialize(snap.state))
    for entry in log:   # 仅 apply 快照之后
        sm.apply(entry.cmd)
```

## 五、与其他技术对比
LSM-tree 的 compaction 是存储层压缩，RSM 快照是状态层压缩；二者可并存。WAL 截断类似但无显式状态点。

## 六、常见误区
1. 快照未记录 last_included_index：恢复无法对齐日志。
2. 边写边快照不加锁：状态不一致，需写时复制或冻结。
3. 频繁快照：IO 抖动，应阈值驱动。

## 七、与开源书/权威来源对应
Raft 论文「Log Compaction」一节专讲快照；etcd 或 TiKV 均实现之；DDIA 第3章讲存储压缩。

## 八、面试题
问：快照后日志如何截断？
答：保留 last_included_index 之后的日志项，之前的可删，恢复时先载快照再 apply 余下日志。

## 九、演进与趋势
增量快照、与 RocksDB checkpoint 结合降低开销。

## 十、小结
快照把「重放全日志」变为「基准加增量」，是 RSM 长期运行的必要压缩手段。
