# 一致性哈希在Dynamo中的应用

> 对应 DeCandia et al. 2007（Amazon Dynamo 论文，第4.2节 Partitioning）与 Kleppmann DDIA 第6章。

## 一、背景与挑战

2007 年 SOSP 上的 Dynamo 论文是分布式系统工程史的分水岭。它描述了 Amazon 如何为购物车、会话、推荐等「永远不能拒绝写入」的业务构建一个高可用 K/V 存储。这些业务的 SLA 极其苛刻：哪怕部分机房故障、哪怕数据暂时不一致，用户也必须能下单、能加入购物车。传统的「强一致 + 主从」架构在这种要求下会频繁把故障暴露给用户，于是 Dynamo 团队做了一个明确的架构赌注：**优先可用性，用最终一致收敛**。

在这一赌注下，数据分区成为核心问题。Amazon 的业务 key 空间巨大（购物车、订单、会话、商品属性等），节点规模随时在变（扩容、替换故障机、机房迁移），还必须支持异构硬件与多机架部署。任何一个「中心化元数据服务器记录 key 范围」的方案都会成为单点瓶颈与可用性风险；任何一个「取模哈希」的方案都扛不住扩缩容。一致性哈希 + 虚拟节点因此成为 Dynamo 分区层的骨架：它去中心化（每台机器独立算出归属）、拓扑局部稳定（加减机器只迁局部数据）、并能用 vnode 数量表达机器能力差异。

Dynamo 的意义不只是「用了一致性哈希」，而是把环模型与副本链、版本向量、hinted handoff、读写仲裁、成员协议等机制拼成了完整的可用性体系。理解它，就能理解为什么 Cassandra、Riak、Voldemort 等系统会成为一代 AP 存储的模板，也能在面试中把「一致性哈希」从一个算法名词展开成一整套系统设计。

## 二、核心原理

**1. 环与 token**。Dynamo 把 key 的哈希空间组织成环（论文中称 token space）。每个存储节点负责环上若干 token 点；token 之间区间内的 key 归顺时针第一个 token 所在节点负责。生产实现（以及 Cassandra 后来）普遍引入**虚拟节点**：一台物理节点持有多个 token，从而负载更均匀、机器能力差异可用 token 数量表达。

**2. Preference list（偏好列表）**。对每个 key，从其顺时针起点开始，收集 $R$ 个**不同物理节点**作为副本。论文强调必须跨物理节点去重——因为一台机器可以有多个 token，若不去重，$R$ 个副本可能落同一台机器，故障域失效。更进一步，列表还要跨机架/可用区尽量分散，并可在策略上跳过暂时不健康的节点。

**3. 去中心化的协调者**。任意节点都可以作为该 key 的协调者（coordinator），负责把请求路由到 preference list 的节点、收集读写响应、做冲突合并。这与「中心 Master」形成鲜明对比：请求可以就近打到任一副本，避免热点 Master；代价是每个节点都要理解环与副本逻辑。

**4. 写入路径（Sloppy quorum + Vector clock）**。写请求由协调者发给 preference list 中的 $N$ 个节点（通常 $N=R$），收到 $W$ 个确认即向客户端返回成功。每个写入附带**向量时钟**（vector clock），用于后续读时判断因果先后、检测冲突。若某些节点宕机，协调者顺延到列表之后的节点，并写入 hint。

**5. 读取路径（$R$ 个副本 + 协调合并）**。读请求向 $R$ 个节点查询，收集到多个版本后，协调者用向量时钟找出最新版本或识别冲突，把无关旧版本后台清理（read repair）。

**6. 扩缩容流程**。新节点加入：计算自己的 token，接管环上相邻区间，从邻居拉取属于自己区间的数据；离开或永久故障：区间被邻居接管，数据异步迁移。过程中读写始终可以由环上现存节点服务。

不变量是「一个 key 的权威副本集合 = preference list」；故障导致的临时副本必须带 hint 并最终归还。这个设计让 Dynamo 在节点级故障下仍可读写，而在硬件修复后自动收敛。

## 三、形式化与数学基础

设环上 vnode 总数 $M$，物理节点 $N$，副本因子 $R$，key 数 $K$。

**key 的副本位置**。对 key $k$，设 $n_0 = \text{succ}(h(k))$ 为顺时针第一个 vnode 的物理节点，则 preference list 为环上顺时针方向前 $R$ 个**去重后**的物理节点：
$$
\text{pref}(k) = \text{unique-physical}\big(\text{succ}^i(h(k))\big)_{i=0,1,2,\dots}\Big|_{\text{取前 } R \text{ 个}}.
$$
由于 vnode 分布均匀，$\text{pref}(k)$ 中节点近似均匀覆盖全集群。

**容量与迁移**。节点加入时迁移 key 数期望 $\frac{K}{N+1}$；迁移完成后，每个 key 的副本数仍为 $R$，因此迁移的总字节数约为数据量的 $\frac{1}{N+1}$（只迁主分片对应的数据，副本可从副本节点并行拉取）。

**可用性概率**。若单节点可用率 $p$，$R$ 副本独立故障，则 key 不可用概率
$$
P_{\text{fail}} = (1-p)^R.
$$
论文常用 $R=3$。但注意：Dynamo 用 sloppy quorum 时，故障节点的写会被邻居临时接管，因此实际「丢写」概率比 $P_{\text{fail}}$ 更低，代价是最终一致窗口拉长。

**一致性窗口与 $W,R_r,N$**。写需 $W$ 确认、读需查 $R_r$ 个副本，若 $W + R_r > N$，则读集合与写集合必相交，能读到最新已确认写。故障期间 $N$ 临时变大（顺延），上述不等式可能破坏，出现读到旧值的窗口，随后由 handoff / read repair 收敛。

**冲突与向量时钟**。每次写生成形如 $\{(node_1, c_1), (node_2, c_2), \dots\}$ 的向量。若两个版本的向量互不支配（incomparable），则判定为并发冲突，需业务合并（如购物车并集）或客户端解决。这避免了「后写覆盖前写」丢更新。

## 四、代码实现

下面实现一个「Dynamo 风格」的最小模型：token 环、preference list（跨物理去重）、写入 $W$ 确认、读取 $R$ 副本与版本向量冲突检测。

```python
import hashlib
from bisect import bisect_left
from collections import defaultdict


def md5_int(data) -> int:
    if not isinstance(data, bytes):
        data = str(data).encode()
    return int.from_bytes(hashlib.md5(data).digest()[:8], "big")


class DynamoRing:
    def __init__(self, nodes, v=10, R=3, W=2):
        self.R, self.W = R, W
        self._pts, self._owner = [], {}
        for n in nodes:
            for i in range(v):
                p = md5_int(f"{n}#{i}")
                idx = bisect_left(self._pts, p)
                self._pts.insert(idx, p)
                self._owner[p] = n
        self.healthy = set(nodes)
        self.store = defaultdict(list)   # node -> [(value, vector)]
        self.hints = defaultdict(list)

    def preference_list(self, key):
        h = md5_int(key)
        start = bisect_left(self._pts, h)
        if start == len(self._pts):
            start = 0
        seen, lst = set(), []
        for k in range(len(self._pts)):
            node = self._owner[self._pts[(start + k) % len(self._pts)]]
            if node not in seen:
                seen.add(node)
                lst.append(node)
                if len(lst) >= self.R + 5:
                    break
        return lst

    def _bump(self, key, node):
        """生成新的向量时钟：在该协调节点计数 +1。"""
        return {node: 1}     # 简化：单步向量，便于演示

    def write(self, key, value, coordinator):
        vec = self._bump(key, coordinator)
        lst = self.preference_list(key)
        acks = 0
        for node in lst:
            if acks >= self.W:
                break
            if node in self.healthy:
                self.store[node].append((value, vec))
                acks += 1
            else:
                holder = next((n for n in lst if n in self.healthy), None)
                if holder:
                    self.hints[node].append((key, value, vec))
                    self.store[holder].append((value, vec))
                    acks += 1
        return acks >= self.W

    def read(self, key):
        versions = []
        for node in self.preference_list(key):
            if node in self.healthy:
                for value, vec in self.store[node]:
                    if not any(v == value for v, _ in versions):
                        versions.append((value, vec))
        if not versions:
            return None
        # 简化冲突处理：取向量计数最大者；并返回是否存在冲突
        versions.sort(key=lambda x: sum(x[1].values()), reverse=True)
        conflict = len(versions) > 1
        return {"value": versions[0][0], "conflict": conflict, "versions": versions}


if __name__ == "__main__":
    ring = DynamoRing(["N1", "N2", "N3", "N4", "N5"], R=3, W=2)
    ok = ring.write("cart:alice", {"item": "book"}, coordinator="N1")
    print("write acked:", ok)
    print("pref:", ring.preference_list("cart:alice"))
    print("read:", ring.read("cart:alice"))

    ring.healthy.discard("N2")
    ring.write("cart:alice", {"item": "pen"}, coordinator="N1")
    print("read after N2 down:", ring.read("cart:alice"))
```

这个模型强调了三条关键规则：preference list 去重物理节点、写需 $W$ 个确认、故障节点写入顺延并留 hint。真实 Dynamo 还包括完整的向量时钟压缩、Merkle 树反熵、gossip 成员协议与存储引擎。

## 五、与其他技术对比

| 系统 | 分区方式 | 副本策略 | 一致性 | 特点 |
| --- | --- | --- | --- | --- |
| Dynamo / Cassandra | 一致性哈希 + vnode | preference list | 最终一致（可调） | 去中心化、高可用 |
| Bigtable / HBase | 范围分区（tablet） | 主从 + 操作日志 | 强一致（单行） | 有序扫描、中心元数据 |
| HDFS | 固定块映射 | 副本管道 | 强一致（追加） | 大文件、批处理 |
| Spanner | 范围分区 + Paxos | 多副本 | 全局强一致 | TrueTime、跨洲 |
| Redis Cluster | 16384 槽位 | 异步复制 | 最终一致 | 内存、简单 |

Dynamo 与 Cassandra 选择了「环 + 虚拟节点 + 最终一致」；HBase 用「范围 + 主从」换有序；Spanner 则用时间戳基础设施换强一致。没有绝对优劣，只有业务 SLA 与运维成本的权衡。

## 六、常见误区

1. **以为 preference list 就是「环上连续 $R$ 个 vnode」**。必须按物理节点去重，否则多 vnode 会让副本集中到同一台机器，故障域失效。
2. **忽略跨机架/跨可用区约束**。三副本同机架，在机架级故障下 $R=3$ 无效。生产 placement 必须感知故障域。
3. **把「写成功」当成「所有副本都写了」**。$W < R$ 时只有部分副本确认，故障窗口内可能读到旧值。需要业务能容忍最终一致。
4. **不理解向量时钟的冲突语义**。把并发冲突当成覆盖更新，会丢购物车合并这类业务语义。Dynamo 的哲学是「检测冲突、交给业务合并」。
5. **扩容时无限速迁移**。直接按 vnode 切分会把网络打满。必须后台限速、按区间批量搬迁，并在迁移期间同时维护读写。

## 七、与开源书/权威来源对应

- **DeCandia et al. 2007**，"Dynamo: Amazon's Highly Available Key-value Store", SOSP，§4.2 Partitioning Algorithm —— 一致性哈希与虚拟节点在 Dynamo 中的落地。
- **同论文 §4.3–4.8** —— preference list、向量时钟、sloppy quorum、hinted handoff、成员与故障检测。
- **Kleppmann, DDIA 第5–6章** —— 对 Dynamo 设计的现代再解读与利弊分析。
- **Vonng/ddia 与 CyC2018/CS-Notes** —— 中文面试语境下对 Dynamo 的梳理。

## 八、面试题

**1. Dynamo 的 preference list 如何保证副本分散？**
从 key 的顺时针起点开始收集 $R$ 个不同物理节点；按物理机去重；并跨机架/可用区做约束，避免同故障域。

**2. 扩容时数据如何迁移？**
新节点插入 token，接管相邻区间；后台限速从邻居拉取自己区间的数据；迁移期间读写仍由环上节点服务，完成后删除冗余。

**3. 为什么 Dynamo 不用主从复制？**
主从强一致但在故障切换时不可用窗口明显；Dynamo 优先可用性，用 sloppy quorum + 冲突合并换取「永不拒绝写」。

**4. 向量时钟解决什么问题？**
检测并发写的因果先后，避免覆盖丢更新；当向量不可比较时识别为冲突，交由业务合并（如购物车并集）。

## 九、演进与趋势

Dynamo 之后，这条技术线持续分叉：Cassandra 把 Dynamo 的环模型与 Bigtable 的列族模型结合，成为事实上的 AP 数据库标准；Riak 强调可调一致性与 CRDT；Voldemort、DynanoLite 等更侧重研究原型。新一代系统则把「环」与「强一致副本组」融合：TiKV / CockroachDB 用 Raft + Range 迁移，既能弹性 rebalance，又能单行强一致；云厂商的托管 Key-Value（DynamoDB、Azure Cosmos DB）则把一致性级别做成产品化参数。服务网格与边缘计算也让「环形分区」出现在请求路由层（一致性哈希负载均衡）。未来方向包括：跨区域多活 placement、CRDT 原生存储、基于硬件计数器的动态权重、以及 Serverless 场景下的冷热数据分层环。

## 十、小结

Dynamo 用一致性哈希 + 虚拟节点解决了去中心化、弹性、异构条件下的数据分区，用 preference list 铺开副本，用 sloppy quorum 与 hinted handoff 保证故障时不拒绝写，用向量时钟与反熵保证最终收敛。它是 AP 系统的教科书范式，也是把「环模型」从算法提升为完整存储架构的里程碑。
