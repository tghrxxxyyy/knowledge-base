# Quorum 原理

> 对应 Gifford 1979《Weighted Voting for Replicated Data》（MIT）；Kleppmann《Designing Data-Intensive Applications》第 8 章 quorum reads/writes；Lamport 1978 逻辑时钟与多数派思想。

## 一、背景与挑战

在复制系统中，如何既保证读写能看到彼此的更新，又容忍部分副本故障与变慢？若要求所有副本确认，任一副本故障即整体不可用；若只写单副本，又可能读不到最新值。Quorum 通过「读写各自所需的最小副本数（法定数）」给出通用答案：只要读写集合必然相交，正确性就有保证，同时多数派副本可用即服务可用。它把「可见性」与「可用性」解耦为可证明的参数。

## 二、核心原理

- 系统有 $N$ 个副本。
- 写需获得 $W$ 个副本确认才算成功。
- 读需读取并与 $R$ 个副本比对（取最新版本/时间戳）才算完成。
- 约束 **$W + R > N$** 保证任意读集合与最近写集合必有交集，读必包含至少一份最新写。
- 读延迟约等于最慢的 $R$ 个副本中最慢者；写延迟约等于最慢的 $W$ 个副本中最慢者。
- 典型取 $W = R = \lfloor N/2 \rfloor + 1$（多数派），此时容忍 $\lfloor (N-1)/2 \rfloor$ 副本故障。

实例推演（设 $N=5, W=R=3$）：
- 写向 5 副本广播，任意 3 个确认即成功，可容忍 2 个慢/故障副本。
- 读比较任意 3 个副本，由鸽巢原理这 3 个中至少有 1 个在刚才写入的 3 个内，故读到最新。
- 若 $N=4, W=R=2$，则 $W+R=4\not>4$，读写的 2 个集合可能完全不交（如各取一边 2 个），故非强一致，须取 3。
- 若分区成 3|1，取 $W=R=3$ 时那 1 个的一侧既写不成也读不到最新 -> CP；若放宽到每侧各自法定则 AP。

## 三、形式化与数学基础

核心不等式：

$$
N \ge W + R - 1 \quad \Longleftrightarrow \quad W + R > N
$$

由鸽巢原理，任意大小为 $R$ 的读集合与大小为 $W$ 的写集合在 $N$ 个副本中必有交集，故读必含最新写。读延迟 $L_R \approx \max_{i\in readset} latency_i$，写延迟 $L_W \approx \max_{i\in writeset} latency_i$。可用性（可用所需最少存活副本）为 $\min(W,R)$ 个。

## 四、代码实现

```python
# 计算法定数：强一致 vs 最终一致（示意）
def quorum(N, read_strong=True):
    if read_strong:
        W = N // 2 + 1
        R = N - W + 1          # 保证 W + R > N
    else:
        W = 1
        R = 1
    return W, R

# 读取时比对 R 个副本的版本号，取最新
def read(replicas, R):
    picked = sorted(replicas, key=lambda r: r.ver, reverse=True)[:R]
    return max(picked, key=lambda r: r.ver)
```

```python
# 写：收集 W 个确认（示意）
def write(replicas, val, W):
    ack = 0
    for r in replicas:
        if r.apply(val):
            ack += 1
        if ack >= W:
            return True       # 达成写法定
    return False
```

## 五、与其他技术对比

| 维度 | 全副本同步 | Quorum | 主从异步 | 可用性 |
|------|------------|--------|----------|--------|
| 容故障 | 不容忍 | 容忍多数派外故障 | 主故障即不可用 | 多数派存活 |
| 一致视图 | 强 | 强（W+R>N） | 可能陈旧 | 强/弱取决 R/W |
| 延迟 | 最慢全部 | 最慢 W/R 个 | 仅主 | 中高 |
| 复杂度 | 低 | 中 | 低 | — |

Quorum 在可用性与一致性间取得平衡，是「多数派」思想的工程化。

## 六、常见误区

1. 设 $W=1,R=1$ 以为强一致——实际 $W+R=2\not>N$（除非 $N=1$），属弱一致。
2. 忽略 $N$ 为偶数时的边界：如 $N=4$，多数派需 3，$W=R=2$ 时 $W+R=4\not>4$，竟非强一致，须 $W=3$ 或 $R=3$。
3. 以为 quorum 读即线性一致：还需全局版本/时间戳顺序与 fencing。
4. 忽略版本冲突：并发写可能都获 quorum，需用向量时钟/版本号检测并合并。
5. 把 quorum 大小与副本数混为一谈：quorum 是「所需确认数」，可小于 $N$。
6. 误以为 quorum 总能写：分区下若存活副本不足 $W$ 则写失败，这是 CP 行为。
7. 以为读 R 个就够强一致：必须同时满足 $W+R>N$ 且写已达 W，否则读到旧。

## 七、与开源书·权威来源对应

- Gifford 1979《Weighted Voting for Replicated Data》：quorum/加权投票的奠基论文。
- Kleppmann《DDIA》第 8 章：quorum reads/writes 与冲突检测。
- Lamport 1978：逻辑时钟与多数派排序的思想源头。

## 八、面试题

1. 为什么 $W+R>N$ 能保证一致读？答：鸽巢原理保证读集合与写集合相交，读必含最新写。
2. $W/R$ 如何选择影响延迟与可用？答：增大 $W$ 提写一致但增写延迟、降写可用；增大 $R$ 同理作用于读。
3. $N=4$ 时 $W=R=2$ 够吗？答：不够，$W+R=4\not>4$，需至少一个取 3 才强一致。
4. quorum 读是线性一致吗？答：不是，需额外全局序与 fencing 才线性。
5. 分区时 quorum 如何表现？答：存活不足 $W$ 或 $R$ 的一侧不可用（CP），否则可写（AP）。
6. 读延迟由什么决定？答：最慢的 R 个副本中最慢者，故增大 R 提高一致但增读延迟。

## 九、演进与趋势

加权 quorum 让重要副本拥有更高投票权重（见加权投票章）；与共识协议（RAFT）结合，在 leader 基础上用 quorum 做成员变更与日志提交。具体以官方最新文档为准。

## 十、小结

Quorum 用集合相交把「可见性」与「可用性」参数化，是复制系统的核心抽象。它把「多数派」这一朴素思想，转化为可证明正确性的读写契约。
