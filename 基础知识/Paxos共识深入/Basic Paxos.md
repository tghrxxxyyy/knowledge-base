# Basic Paxos

> 对应 Lamport《The Part-Time Parliament》(1998) 与《Paxos Made Simple》(2001)。

## 一、背景与挑战
在异步、节点可能崩溃、网络可能丢包的环境中，如何让一组节点对“某个值”达成一致？Basic Paxos 解决单值(one value)共识问题，是后续 Multi-Paxos 的基础。

## 二、核心原理
角色(可重叠)：Proposer(提议者)、Acceptor(接受者)、Learner(学习者)。
两阶段：
1. Prepare：Proposer 发 prepare(n)，n 为自增提案号。
2. Promise：Acceptor 若 n 大于已承诺的 minN，则承诺不再接受 <n 的提案，并返回曾接受的最大提案 (acceptedN, acceptedV)。
3. Accept：Proposer 收多数派 Promise 后，发 accept(n, v)，v 为 Promise 中 acceptedN 最大的值(若全为空则自选)。
4. Accepted：Acceptor 若 n>=minN 则接受并回复；Learner 在多数派接受同一 (n,v) 后判定选定(chosen)。
安全性：一旦某值被选定，后续更高提案只能选定该值。

## 三、形式化 / 数学基础
活性与安全性不变量：
- P1a：Acceptor 只接受 n >= 其 minN 的提案。
- P2a：若 (n,v) 被选定，则任意 m>n 的被接受提案值为 v。
推导 P2b：Proposer 选 v 为 Promise 响应中 acceptedN 最大者的 v；若无则返回自选。
容错：需 2F+1 个 Acceptor 容忍 F 个故障(多数派 F+1 > 2F+1/2)。

## 四、代码实现
```python
class Acceptor:
    def __init__(self):
        self.min_n = 0
        self.accepted_n = 0
        self.accepted_v = None
    def prepare(self, n):
        if n > self.min_n:
            self.min_n = n
            return True, self.accepted_n, self.accepted_v
        return False, None, None
    def accept(self, n, v):
        if n >= self.min_n:
            self.accepted_n, self.accepted_v = n, v
            return True
        return False
```

## 五、与其他技术对比
- Basic Paxos 只定一值；Multi-Paxos 连续定多值(日志)。
- 相比 Raft，Paxos 原描述较松散，工程实现复杂。

## 六、常见误区
- 误区：Basic Paxos 直接用于日志复制。需 Multi-Paxos 或变种。
- 误区：单 Proposer 即可。Paxos 允许多 Proposer，但易活锁。

## 七、与开源书 / 权威来源对应
- Lamport《The Part-Time Parliament》(1998)。
- Lamport《Paxos Made Simple》(2001)。
- MIT 6.824: https://github.com/mit-pdos/6.824-2021

## 八、面试题
1. 为什么 Proposer 在 Accept 阶段必须选 Promise 中 acceptedN 最大的 v？
2. 为什么需要 2F+1 个 Acceptor？
3. Basic Paxos 的活锁是什么？

## 九、演进与趋势
Multi-Paxos、Fast Paxos、Egalitarian Paxos(EPaxos) 等不断降低延迟与角色复杂度。

## 十、小结
Basic Paxos 以两阶段与多数派在异步崩溃模型中安全达成一致，是分布式共识的理论基石。
