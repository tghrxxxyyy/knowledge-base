# CAP定理

> 对应 Gilbert 与 Lynch《Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Services》(2002) 形式化证明。

## 一、背景与挑战
2000 年 Eric Brewer 提出猜想：分布式数据共享系统最多只能同时满足一致性(C)、可用性(A)、分区容忍性(P) 中的两项。2002 年 Gilbert 与 Lynch 用异步网络模型严格证明了这一猜想。核心难点在于：真实网络必然发生分区(消息丢失/延迟无限)，因此 P 在工程上不可放弃，实际是在 C 与 A 之间权衡。

## 二、核心原理
- 一致性(C)：每次读取都返回最近一次成功写入的结果（或错误）。
- 可用性(A)：每个非故障节点收到的请求都必须返回非错误响应。
- 分区容忍性(P)：网络允许任意消息丢失时系统仍继续运行。
证明思路：构造一个发生分区、且必须写入一方丢弃的场景；若要保证 C 则响应会阻塞(破坏 A)，若保证 A 则两侧数据不一致(破坏 C)。故 C 与 A 在 P 下不可兼得。

## 三、形式化 / 数学基础
设系统由两组节点 G1、G2 组成，初始 v0=0。分区发生：
- 写 G1: v1=1（未同步到 G2）
- 读 G2
若返回最新值则需等待 G1 同步 -> 阻塞(违反 A)；
若立即返回 v0=0 -> 读到旧值(违反 C)。
形式化：在异步模型中存在分区时，不存在算法同时满足 atomic(consistency) 与 every request receives a response(availability)。

## 四、代码实现
```python
# CP 系统：写入需多数派确认，否则失败（牺牲 A）
import random
def write_cp(nodes, value, w_quorum):
    ok = 0
    for n in nodes:
        if n.network_alive() and n.apply(value):
            ok += 1
    return ok >= w_quorum  # 未达到则整体失败 -> 不可用

# AP 系统：本地写入立即返回（牺牲 C）
def write_ap(local_node, value):
    local_node.apply(value)  # 立即返回，异步传播
    return True
```

## 五、与其他技术对比
- CP：ZooKeeper、etcd、HBase —— 强一致，分区时可能拒绝写入。
- AP：Cassandra、DynamoDB、Riak —— 高可用，最终一致。
- CA：单节点数据库(无分区) —— 分布式下不存在纯 CA。

## 六、常见误区
- 误区：CAP 是三选二静态开关。实际是连续谱，且 P 通常不可选。
- 误区：AP 系统完全不保证一致。实际是最终一致(EC)，有收敛边界。
- 误区：CAP 适用于单次操作之外。它描述的是极端分区下的取舍，正常时三者可同时较好。

## 七、与开源书 / 权威来源对应
- Gilbert & Lynch 原始论文(2002)。
- Kleppmann《Designing Data-Intensive Applications》第 9 章。
- DDIA 中文: https://github.com/Vonng/ddia
- CS-Notes: https://github.com/CyC2018/CS-Notes

## 八、面试题
1. 为什么说在分布式系统中 P 通常必须选择？
2. CAP 中的 C 与 ACID 中的 C 有何区别？
3. 一个 AP 系统在分区恢复后如何收敛到一致？

## 九、演进与趋势
从 CAP 二元取舍演进到 PACELC 模型：分区(P)时选 A/C，否则(E，即无分区时)在延迟(L)与一致(C)间权衡。现代系统多提供可调一致性级别(如 Cassandra 的 ONE/QUORUM/ALL)。

## 十、小结
CAP 揭示了分布式系统在分区下的根本约束：工程上 P 必选，真实选择是 C 与 A 的连续权衡，PACELC 更准确地刻画了无分区时的延迟—一致取舍。
