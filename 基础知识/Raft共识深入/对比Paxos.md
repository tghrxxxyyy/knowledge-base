# Raft 对比 Paxos

> 对应 Ongaro & Ousterhout 论文引言对“可理解性”的论证，以及 Diego 的总结。

## 一、背景与挑战
Paxos 难懂难实现，催生了以“可理解性为第一目标”的 Raft。对比二者有助于选型与排障。

## 二、核心原理
| 维度 | Paxos(Basic/Multi) | Raft |
| 角色 | Proposer/Acceptor/Learner 可重叠 | Leader/Follower/Candidate 明确 |
| 领导 | 隐式、可多提议者 | 显式强 Leader |
| 日志 | 多实例槽位 | 连续日志 + prevLog 校验 |
| 成员变更 | Joint Consensus | Joint Consensus(同思想) |
| 可理解性 | 低(论文抽象) | 高(分解为子问题) |
两者安全性等价(都能在异步崩溃模型达成一致)。

## 三、形式化 / 数学基础
Raft 论文给出 TLA+ 规格证明与 Figure 8 反例，证明其等价于 Paxos 的安全属性；两者均需 2F+1 容忍 F 故障。
活性：Paxos 需 Leader/退避保证；Raft 用随机超时选举天然获得。

## 四、代码实现
```go
// Raft 状态机拆分(更模块化)
type Raft struct {
    // 选举、复制、安全 各自独立字段与方法
    state int // Follower/Candidate/Leader
}
// 相对 Paxos 实现更易按模块测试
```

## 五、与其他技术对比
- Paxos 更适合需要灵活多提议者/低延迟(EPaxos)的极端场景。
- Raft 在“多数派复制 + 强一致”场景下工程成本更低。

## 六、常见误区
- 误区：Raft 比 Paxos 更强。两者安全等价，差异在结构与可理解性。
- 误区：Paxos 一定更慢。优化良好的 Multi-Paxos 延迟可接近 Raft。

## 七、与开源书 / 权威来源对应
- Ongaro & Ousterhout《In Search of an Understandable Consensus Algorithm》(2014)。
- Lamport《Paxos Made Simple》(2001)。
- MIT 6.824: https://github.com/mit-pdos/6.824-2021

## 八、面试题
1. Raft 与 Paxos 安全性是否等价？
2. 为什么 Raft 更易实现？
3. 什么场景仍优选 Paxos 系？

## 九、演进与趋势
Raft 已成云原生事实标准(etcd/TiKV/Consul)；Paxos 系在超大规模数据库(Spanner)仍占一席。

## 十、小结
Raft 与 Paxos 安全等价，Raft 以明确角色、强 Leader 与模块化换来了显著的可理解性与工程友好。
