# RSM与共识关系

> 对应 Lamport 1978（Time, Clocks, and the Ordering of Events）；Schneider 1990（Implementing Fault-Tolerant Services Using the State Machine Approach）；Lamport 1998（The Part-Time Parliament, Paxos）；Ongaro & Ousterhout 2014（Raft）。

## 一、背景与挑战
状态机复制（RSM）本身只描述一件事：**若所有副本从相同初始状态出发、以相同顺序执行相同命令，则必然到达相同状态**。它并没有回答「如何让多个副本对命令顺序达成一致」——这是另一个独立且困难的问题，由共识算法（Paxos、Raft、Zab 等）解决。二者关系可概括为：**共识提供一致有序的日志，RSM 在该日志上做确定性重放，从而构造容错服务**。

把两者分开理解非常重要，因为工程上它们各自的失败模式不同。RSM 的挑战在于**确定性**：状态转移函数不能依赖时间、随机数、本地时钟、遍历顺序、未定义的并发；一旦出现非确定性输入，副本会在同一日志上分叉。共识的挑战则在于**在异步网络与节点故障下仍保证安全性**：即使消息任意延迟、节点崩溃重启、领导者被替换，也不能出现两个副本对同一日志位置提交不同命令。FLP 结果告诉我们，在完全异步且允许一个崩溃故障的模型中，确定性共识算法无法同时保证安全与终止，因此所有实用共识都引入「部分同步」假设（超时、随机化选主）来换取活性。

## 二、核心原理
共识算法要满足三条经典性质：**非平凡性**（只能决定被提出过的值，即不能凭空产生命令）、**一致性/安全性**（所有正确副本对同一日志位置决定相同值，且已提交的日志项永不改变）、**终止性/活性**（在部分同步假设下，系统最终会决定下一个值）。RSM 把「决定」重复执行：每决定一个值，就是日志的下一条命令；副本按 index 顺序 apply，即可得到一致状态。

关键机制是**日志匹配与提交规则**。在 Raft 中，领导者只有在某项被多数派持久化后才会提交它，且提交遵循「只能提交当前任期内的项」这一约束，配合「日志匹配性质」（若两副本在某个 index 的 term 相同，则该 index 之前的日志完全相同）保证日志前缀一致。Paxos 则通过「准备—接受」两阶段与提案编号（ballot）保证同一 instance 只被决定一次。此外还需**成员变更**（configuration change）机制，让副本集合可以在线调整而不破坏安全——常见做法是 joint consensus 或一次只改一个成员。

另一个易被忽略的分工是：共识只负责「日志一致」，「把日志变成服务」还需要客户端会话与去重（至少一次投递带来的重复命令必须靠请求 ID 幂等化）、读一致性（线性一致的读需要走 ReadIndex 或租约，而不是简单向本地 FSM 问）、以及状态转移（把日志传到落后的副本）。这些都在 RSM 这一侧实现。

## 三、形式化与数学基础
共识可形式化为一个函数 $\mathrm{decide}()$，其正确性要求：
$$ \text{① Nontriviality}:\ v \in \{\text{proposed values}\};\quad \text{② Agreement}:\ \forall i,j:\ \mathrm{decide}_i = \mathrm{decide}_j $$
$$ \text{③ Termination}:\ \text{所有正确进程最终都调用 decide} $$
RSM 则把 $\mathrm{decide}$ 在第 $k$ 个位置重复调用，得到日志 $\vec{L} = (c_1, c_2, \dots)$，并定义确定性转移：
$$ S_k = \delta(S_{k-1}, c_k),\qquad S_k = \delta^{*}(S_0, c_1 \dots c_k) $$
安全性要求「已提交即不变」：
$$ \mathrm{committed}(k) \Rightarrow \forall t > t_0:\ L_k(t) = L_k(t_0) $$
日志匹配性质可写成蕴含式：
$$ \forall a,b:\ \mathrm{term}_a(k) = \mathrm{term}_b(k) = \tau \Rightarrow L_a[1..k] = L_b[1..k] $$
**FLP 不可能性**指出，在异步模型下不存在既保证安全又保证在存在一个崩溃故障时必然终止的确定性共识算法；实用算法因此加入超时（部分同步）或随机化以获得「以概率 1 终止」。故障容错下界为：崩溃故障需 $2f+1$ 副本容忍 $f$ 个，拜占庭故障需 $3f+1$，而写入需 $\lceil N/2 \rceil + 1$ 个应答。

## 四、代码实现
把共识与 RSM 的接口抽象出来，可以看到二者是「生产者—消费者」关系：
```python
# 共识层只暴露 propose/decide；RSM 层只负责按序 apply
class Consensus:
    def propose(self, cmd):
        raise NotImplementedError      # Raft 追加日志 + 复制，Paxos 走 prepare/accept

    def decide(self, index):
        raise NotImplementedError      # 返回 index 处已被多数派确认的命令

class RSM:
    def __init__(self, initial_state, delta):
        self.state = initial_state
        self.delta = delta             # 必须是确定性函数
        self.last_applied = 0

    def apply_until(self, commit_index, consensus):
        while self.last_applied < commit_index:
            self.last_applied += 1
            cmd = consensus.decide(self.last_applied)
            self.state = self.delta(self.state, cmd)
```

主循环体现「共识驱动 apply，而非 apply 驱动共识」：
```python
def run(consensus, rsm):
    while True:
        ci = consensus.commit_index()          # 已提交到哪
        rsm.apply_until(ci, consensus)         # 严格按 index 递增 apply
        serve_reads(rsm, consensus)            # 读需 ReadIndex/租约保证线性一致
```

成员变更的简化表述（joint consensus 的两阶段思想）：
```python
def reconfigure(consensus, old_set, new_set):
    consensus.propose_config(old_set | new_set)     # 阶段一：联合配置，需两个多数派
    consensus.propose_config(new_set)               # 阶段二：切换到新配置
    # 任一阶段失败都不会破坏安全，因为联合配置要求同时满足新旧多数派
```

## 五、与其他技术对比
| 维度 | RSM + 共识 | 主从异步复制 | 状态转移（传状态差异） | 链式复制 | 单机 WAL |
| --- | --- | --- | --- | --- | --- |
| 一致性保证 | 线性一致（已提交不丢） | 最终一致，可能丢 | 取决于协议 | 线性一致（读走尾） | 单机持久 |
| 容错能力 | 容忍少数派故障 | 主挂即可能丢数据 | 视实现 | 容忍部分故障 | 无 |
| 传输内容 | 命令（日志项） | 操作或 binlog | 状态差异/变更集 | 日志 | 日志 |
| 带宽占用 | 与命令量成正比 | 与写入量成正比 | 与差异量成正比 | 与命令量成正比 | 不涉及 |
| 是否需确定性 | 是（核心前提） | 否（传结果） | 否（传状态） | 是 | 否 |
| 典型实现 | Raft、Multi-Paxos、Zab | MySQL 传统主从 | rsync、状态同步 | Chain Replication | 数据库 redo log |

## 六、常见误区
1. **「RSM 自带容错」**——错。RSM 只是「同序加确定性得同状态」的推论，容错来自共识算法对日志一致性的保证；没有共识，日志就会分叉。
2. **「共识与全序广播是两回事」**——错。二者在正确性上等价：全序广播（atomic broadcast）与共识可以互相规约，只是表述角度不同。
3. **「共识能容忍多数派故障」**——错。多数派失效即无法达成任何决定，系统会停止写入（CP 行为）；容错上限永远是少数派。
4. **「有日志就等于线性一致读」**——错。读若直接问本地 FSM，可能读到已被新领导者覆盖的旧状态；需 ReadIndex 或领导者租约。
5. **「命令重复投递无所谓」**——错。客户端重试会造成重复 apply，必须靠请求 ID + 去重表把命令幂等化，否则状态被重复修改。

## 七、与开源书·权威来源对应
- Lamport 1978：用逻辑时钟刻画偏序与全序，为「顺序一致」提供理论语言。
- Schneider 1990：状态机方法的经典论文，正式给出 RSM 的定义与前提（确定性 + 一致顺序）。
- Lamport 1998（Paxos）：共识算法的奠基工作，说明如何在不可靠网络中决定一个值。
- Ongaro & Ousterhout 2014（Raft）：以可理解性为目标重述共识，并把 RSM 作为核心应用抽象。
- Fischer, Lynch & Paterson 1985：FLP 不可能性结果，解释为何需要部分同步假设。
- Herlihy & Shavit《The Art of Multiprocessor Programming》：并发对象与线性一致性的形式化定义。
- Kleppmann《Designing Data-Intensive Applications》第 9 章：把共识与 RSM 放在分布式系统一致性的工程语境里。

## 八、面试题
1. **RSM 与共识是什么关系？** 要点：共识保证日志一致有序，RSM 在日志上确定性重放得到一致状态；共识是引擎，RSM 是载体。
2. **为什么必须有确定性？** 要点：非确定性会让同一日志在不同副本产生不同状态，破坏复制；时间、随机、遍历序、并发都必须显式确定化。
3. **FLP 说明了什么？** 要点：异步模型下无法同时保证安全与终止；实用算法靠超时/随机化获得概率性终止。
4. **RSM 能容忍多少故障？** 要点：崩溃故障需 $2f+1$ 副本容忍 $f$ 个；拜占庭需 $3f+1$；失去多数派即停写。
5. **读操作要不要走共识？** 要点：默认要走（ReadIndex 确认仍为领导者）或用租约读；否则可能违反线性一致。

## 九、演进与趋势
工业界的事实标准是 Raft（etcd、Consul、TiKV 等）与 Multi-Paxos 系（Chubby、Spanner 的 Paxos 组），近年来还有以「并行/无领导」降低单组瓶颈的研究与实践。演进方向包括：**分片化**（multi-raft / multi-group）横向扩展吞吐、**只读优化**（lease read、follower read 与 ReadIndex 变体）降低读延迟、**成员在线变更与自动再平衡**简化运维、以及**确定性数据库**（把整个事务调度做成确定性状态机）以简化复制与冲突处理。共识的性能上限与硬件（低延迟网络、持久内存、批量提交）强相关，具体实现细节**以官方最新文档与论文为准**。

## 十、小结
共识与 RSM 是一对互补的抽象：共识解决「日志顺序如何一致」，RSM 解决「顺序一致之后如何得到一致状态」。前者依赖多数派与部分同步假设换取安全与活性，后者依赖确定性转移函数与按 index 顺序重放。工程上还需补上幂等去重、线性一致读、成员变更与状态转移这些「日志之外」的部分，才能把理论骨架变成可用的容错服务。
