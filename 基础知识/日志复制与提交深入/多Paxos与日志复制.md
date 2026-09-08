# 多Paxos与日志复制

> 对应 Lamport 1998（Paxos Made Simple）与 Ongaro & Ousterhout 2014（对比 Raft）。

## 一、背景与挑战
单 Paxos 实例只能就一个值达成共识。要复制一条命令日志，需对「每个 slot（日志位置）」跑一次 Paxos，即 Multi-Paxos：固定一个稳定 Leader，使多数 slot 走「优化后的快速路径」，把每条日志当作一个独立共识实例。

## 二、核心原理
Multi-Paxos 选出一个稳定 Leader（用单 Paxos 选主），之后该 Leader 对每个日志 slot 充当 Proposer，发送 Accept 即可（跳过 Prepare 阶段），大幅降低延迟。各 slot 独立达成值一致，顺序即日志顺序。

## 三、形式化与数学基础
每个 slot \\(i\\) 是一个 Paxos 实例，决定 \\(value_i\\)。安全性保证：一旦某 slot 的 chosen 值确定，所有进程对该 slot 看到同一值。稳定 Leader 使 Prepare 仅需一次（用更高 proposal number 抢占时），后续 Accept 直接定值。

## 四、代码实现
```python
# 稳定 Leader 下，对 slot i 直接 Accept
def propose_slot(slot, value, leader_id, n):
    if leader_id == self.id:
        send_accept(slot, n, value)   # 跳过 prepare
    # 多数派 Accept 即 chosen
```

## 五、与其他技术对比
Raft 可视作 Multi-Paxos 的一种「清晰工程化」：强 Leader、日志连续、选主限制。二者能力等价，Raft 更易实现正确。

## 六、常见误区
1. 每个 slot 都跑完整 Paxos：无稳定 Leader 时延迟高，应复用 Leader。
2. 忽略 proposal number 单调：可能被旧 Leader 干扰。
3. 认为 Paxos 难懂不可实现：Multi-Paxos 工程化即 Raft 思路。

## 七、与开源书/权威来源对应
Lamport 1998 描述 Multi-Paxos 优化；Ongaro 论文对比 Raft 与 Paxos 可理解性；6.824 用 Paxos 讲复制。

## 八、面试题
问：Multi-Paxos 如何优化延迟？
答：固定稳定 Leader 后，多数 slot 跳过 Prepare，直接 Accept 定值。

## 九、演进与趋势
EPaxos 等无序 Paxos 进一步去除 Leader 瓶颈，支持并行提交。

## 十、小结
Multi-Paxos 把「单值共识」推广到「日志复制」，稳定 Leader 是关键优化，Raft 是其易用的工程化身。
