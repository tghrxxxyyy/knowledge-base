# Multi-Paxos

> 对应 Lamport《Paxos Made Simple》(2001) 中“用一个 Leader 连续运行 Paxos 实例”的构造。

## 一、背景与挑战
Basic Paxos 每次只定一个值，且每轮都走完整 Prepare 成本高。日志复制需要连续对多个槽位(slot)达成一致，Multi-Paxos 用稳定 Leader 复用 Prepare 阶段来降本。

## 二、核心原理
- 选举一个稳定 Leader(用 Basic Paxos 选)，其提案号全局领先。
- Leader 对日志槽位 i=0,1,2... 依次运行 Accept 阶段；Prepare 只在 Leader 更替时做一次(用同一递增 n 覆盖所有后续 slot)。
- 每个 slot 独立定一个日志条目；Learner 收集各 slot 的 chosen 值形成有序日志。
- 用 no-op 占位补齐空缺 slot，保证日志连续。

## 三、形式化 / 数学基础
设实例序列 I_0, I_1, ...，Leader 选 n0 后在 I_k 发 accept(n0+k, v_k)。
安全性：若 slot i 已 chosen v，则任意 Leader 后续对该 slot 必提议 v(沿用 Basic Paxos 的 P2b)。
吞吐：Prepare 摊销为 O(1) 次/任期，每槽仅一次 Accept 往返。

## 四、代码实现
```python
class MultiPaxosLeader:
    def __init__(self, acceptors):
        self.acceptors = acceptors
        self.ballot = elect()  # 选主得到领先 ballot
    def append(self, slot, value):
        # 假设已通过一次 prepare 获得 [self.ballot, +inf) 的承诺
        ok = sum(a.accept(self.ballot, slot, value) for a in self.acceptors)
        return ok > len(self.acceptors)//2
```

## 五、与其他技术对比
- 相比 Basic Paxos：省去每槽 Prepare，延迟从 2RTT 降到约 1RTT(稳定 Leader 时)。
- 相比 Raft：仍允许并发提议，实现更灵活但更复杂。

## 六、常见误区
- 误区：Multi-Paxos 是单一明确算法。其实是一类“稳定 Leader + 多实例”的工程化方案。
- 误区：无需成员变更处理。实际仍需配置变更机制。

## 七、与开源书 / 权威来源对应
- Lamport《Paxos Made Simple》(2001)。
- MIT 6.824 的 Paxos 实验: https://github.com/mit-pdos/6.824-2021
- CS-Notes: https://github.com/CyC2018/CS-Notes

## 八、面试题
1. Multi-Paxos 如何复用 Prepare 阶段降低延迟？
2. 稳定 Leader 失效后如何恢复？
3. no-op 在 Multi-Paxos 中起什么作用？

## 九、演进与趋势
Google Chubby、Spanner 内部使用 Multi-Paxos 变体；现代更多转向 Raft 以降低实现难度。

## 十、小结
Multi-Paxos 通过稳定 Leader 与槽位化实例把单值共识扩展为高效日志复制，是许多经典系统的核心。
