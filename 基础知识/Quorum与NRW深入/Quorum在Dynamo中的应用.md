# Quorum 在 Dynamo 中的应用

> 对应 DeCandia et al. 2007《Dynamo: Amazon's Highly Available Key-value Store》（N/R/W 与 sloppy quorum）；Kleppmann《Designing Data-Intensive Applications》第 5 章。

## 一、背景与挑战

Dynamo 是 Amazon 为购物车等「永远可写」场景设计的 KV 存储，首要目标是高可用与低延迟，其次才是一致性。它在高可用前提下仍希望多数读能看到一致数据，于是采用可配置的 N/R/W，并在节点故障时用「sloppy quorum（松散法定）」临时放宽到 preference list 后续节点，避免硬法定导致写入不可达。核心张力是：如何在节点频繁上下线、网络分区的现实里，既保可用又尽量保一致。这也是 AP 系统设计的经典范例。

## 二、核心原理

- 默认 $N=3$，可设 $(R,W)$ 为 $(1,1)$、$(2,2)$、$(3,3)$ 等。
- 正常 quorum：满足 $R+W>N$ 时强一致读。
- **Sloppy quorum**：目标节点不可用时，按 preference list 顺延到健康节点（剩余节点）临时接收写入，待原节点恢复后通过 **hinted handoff（提示移交）** 把数据归还，逻辑副本数仍为 $N$。
- 读时向 $R$ 个副本取版本，借助 **vector clock（向量时钟）** 检测并发写冲突，由客户端或后续写合并（last-writer 或业务合并）。
- 后台 **read-repair** 在读取时顺带把最新值写回陈旧副本，逐步收敛。

实例推演：
- 节点 B 宕机，写 key=foo 原本应落 {A,B,C}，现顺延到 D（preference list 下一顺位），记 hint(B)。
- 此时 foo 的逻辑副本仍在 {A,C,D}（含 hint 暂存），满足 $W=2$ 仍可写。
- B 恢复后，D 通过 hinted handoff 把 foo 移交给 B，副本回归 {A,B,C}。
- 期间读若取 {A,C} 已见最新；若取到含 D 的集合同理；handoff 前可能短暂不一致，但终将收敛。

## 三、形式化与数学基础

设 $N=3$。取 $(W=2,R=2)$ 满足 $W+R=4>3$，强一致；取 $(1,1)$ 为最终一致。Sloppy 下实际写入节点集可能超出原始 $N$ 的哈希环位置，但逻辑副本数仍约束为 $N$。收敛条件：在 quiescent 期（无新写且所有 hinted handoff 完成）后，所有 $N$ 个逻辑副本一致：

$$
\forall i,j \in logical\_replicas:\ value_i = value_j
$$

向量时钟 $VC$ 满足：若 $VC_a \prec VC_b$ 则 $a$ 被 $b$ 覆盖；否则并发需合并。

## 四、代码实现

```python
# sloppy 写入：顺延到健康节点（示意）
def write_sloppy(ring, key, val, healthy, N, W):
    targets = preference_list(ring, key, N + 2)   # 含备用节点
    ok = 0
    for t in targets:
        if t in healthy and coordinate_write(t, val):
            ok += 1
            if ok >= W:
                return True                      # 达成 W 个确认
    return False

# hinted handoff：原节点恢复后归还临时数据
def handoff(temp_store, original_node):
    for k, v in temp_store.items():
        replicate(original_node, k, v)
```

```python
# 向量时钟合并（示意）：并发则保留多版本待业务解决
def merge(a, b):
    if a.ver < b.ver:
        return b
    if b.ver < a.ver:
        return a
    return [a, b]          # 并发，保留分支
```

## 五、与其他技术对比

| 维度 | 严格 quorum | Sloppy quorum | Paxos/RAFT | 收敛方式 |
|------|-------------|---------------|-------------|----------|
| 可用性 | 节点不足法定即不可写 | 顺延保写入可达 | 多数派存活即可 | — |
| 一致性 | 强（W+R>N） | 弱（handoff 前可能分散） | 线性 | — |
| 复杂度 | 低 | 需 handoff/repair | 高 | read-repair |

sloppy 用临时不一致换极致可用，靠 handoff + read-repair 最终收敛。

## 六、常见误区

1. 混淆 sloppy 与一致性破坏——handoff 后仍需 repair，否则陈旧副本长期存在。
2. 误以为 $N$ 一定等于物理节点数：逻辑副本数 $N$ 与节点数解耦，可多节点承载。
3. 以为 sloppy 下读取一定强一致：临时分散的副本在 handoff 前可能读不到最新。
4. 忽略向量时钟合并：并发写若只取 last-writer 可能丢更新，需业务合并。
5. 把 $(R=1,W=1)$ 当安全：它是纯最终一致，读可能长期旧。
6. 误以为 hinted handoff 自动解决一切：若原节点永久丢失，临时副本需被提升为正式副本并补充冗余。
7. 以为 sloppy 不影响一致性级别：它只在可用性层放宽，最终一致/强一致的判定仍由 $W+R>N$ 决定。

## 七、与开源书·权威来源对应

- DeCandia et al. 2007, §4.4-4.5：N/R/W、sloppy quorum、hinted handoff、vector clock。
- Kleppmann《DDIA》第 5 章：Dynamo 式 AP 设计与冲突处理。
- Vogels 2009《Eventually Consistent》：最终一致的系统实践。

## 八、面试题

1. 什么是 sloppy quorum？答：目标节点不可用时顺延到 preference list 后续健康节点临时写入，恢复后 hinted handoff 归还，保可用。
2. $(R=1,W=1)$ 在 Dynamo 中意味着什么？答：最终一致，读写都快但可能读到旧值、丢写。
3. 为何需要向量时钟？答：检测并发写冲突，避免盲目 last-writer-wins 丢更新。
4. hinted handoff 的作用？答：把临时写入归还原节点，使逻辑副本数恢复为 $N$ 并收敛。
5. sloppy 是否改变一致性级别？答：不改，级别仍由 $W+R>N$ 决定；sloppy 只在可用层放宽。

## 九、演进与趋势

把 sloppy 与 CRDT 结合减少 handoff 后的冲突合并复杂度；现代 AP 存储（Cassandra/Riak）继承 Dynamo 思想并强化可调一致性。具体以官方最新文档为准。

## 十、小结

Dynamo 用 N/R/W 把一致性变成旋钮，用 sloppy quorum 与 handoff 换取极致可用。它示范了「在分区与故障常态下，先保可用、后用 repair 收敛」的工程哲学。
