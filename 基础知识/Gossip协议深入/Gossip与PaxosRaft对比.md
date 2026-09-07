# Gossip与PaxosRaft对比

> 对应 Lamport 1998（The Part-Time Parliament，Paxos）与 Ongaro & Ousterhout 2014（Raft 论文）以及 Kleppmann DDIA 第9章。

## 一、背景与挑战
Gossip 与共识算法（Paxos/Raft）都用于让分布式节点达成一致，但目标层级不同：前者解决“信息传播与最终一致”，后者解决“对单一有序日志的强一致”。

## 二、核心原理
- Gossip：无 leader，随机传播，最终一致，高可用。
- Paxos/Raft：选主，法定多数确认，线性一致，牺牲部分可用性。

## 三、形式化与数学基础
共识需满足：一致性（Agreement）、终止性（Termination）、合法性（Validity）。FLP 定理证明异步下确定性共识不可能，故 Raft 引入随机超时打破对称。Gossip 不追求上述性质，仅保证最终传播。

## 四、代码实现
# 简化对比：gossip 合并 vs raft 提交
def raft_commit(log, match_index, n):
    # 需要多数节点复制
    return sorted(match_index)[n // 2]  # 中位数即多数

## 五、与其他技术对比
| 维度 | Gossip | Raft |
| 一致性 | 最终 | 线性 |
| 可用性 | 高 | 脑裂时降级 |
| 复杂度 | 低 | 高 |

## 六、常见误区
1. 用 gossip 实现需要强一致的配置变更。
2. 认为 raft 也能像 gossip 那样无需协调者。

## 七、与开源书/权威来源对应
- Ongaro & Ousterhout 2014, “In Search of an Understandable Consensus Algorithm”。
- Lamport 1998, Paxos。
- Vonng/ddia 第9章共识。

## 八、面试题
1. 为什么 Dynamo 不用 Paxos 做数据复制？
2. FLP 定理对共识意味着什么？

## 九、演进与趋势
混合架构：用 Raft 管元数据，用 Gossip 管数据面成员。

## 十、小结
Gossip 与共识算法解决不同问题，常在同一系统中互补使用。
