# 租约在GFS与Chubby中的应用

> 对应 Ghemawat, Gobioff & Leung 2003（The Google File System, SOSP）与 Burrows 2006（Chubby: a lock service for loosely-coupled distributed systems, OSDI）。

## 一、背景与挑战

GFS 中，一个 chunk（64MB 数据块）被复制在多台 chunkserver 上，多客户端可能并发追加/写入。必须有一个「primary」负责把并发写定序（确定串行顺序），否则副本间会不一致。若 primary 崩溃，定序权不能永久悬空——否则写入卡死。Chubby 作为锁/协调服务，需要安全地选举出 master 并让它对外服务，避免脑裂 master 同时服务造成元数据混乱。两者都把「协调权」用租约限时化，使崩溃后能自动重选而不死锁。租约把「谁是当前协调者」转化为限时授权，是这两套系统高可用的关键设计选择。

## 二、核心原理

GFS：master 给某 chunkserver 授予该 chunk 的 primary 租约（默认约 60s），期间它负责把客户端来的写按序应用并转发到其它副本。primary 在租约到期前续租；若 primary 崩溃，租约到期、master 把租约授予新 chunkserver，定序权平滑转移。Chubby：通过 Paxos 在副本组里选出 master，master 持有一份租约对外提供服务（处理锁请求、会话）。若 master 失联、租约到期，副本组重新用 Paxos 选举新 master。租约把「谁是当前协调者」转化为限时授权，避免崩溃后协调权永久丢失或双主长时间并存。二者都用租约把「崩溃恢复」从复杂协议降级为「等超时」。

## 三、形式化与数学基础

GFS 中 primary 租约时长 $T$ 需满足：大于典型一次写流程完成时间（让正常写不被打断），且小于「故障切换可容忍的停顿」（崩溃后尽快重选）：

$$ T_{write\_flow} \ll T_{lease} \ll T_{failover\_budget} $$

Chubby master 租约用于限制「脑裂窗口」——旧 master 自认有效的时长被 $T_{lease}$ 上界约束，要求它远大于选举耗时，使正常期内不会因频繁选举抖动，又远小于不可接受的不一致窗口：

$$ T_{election} \ll T_{lease} \ll T_{split\_window\_budget} $$

配合 fencing：Chubby 给每次锁授权递增的「序号/epoch」，陈旧 master 持旧 epoch，其写被拒绝。该约束保证脑裂窗口被限制在 $T_{lease}$ 之内，且 fencing 兜底双写。

## 四、代码实现

```python
# GFS 风格：master 给 primary chunk 发租约
def grant_primary(chunk, server, now, T):
    if chunk.primary_expire > now:
        return False            # 当前仍有 primary
    chunk.primary = server
    chunk.primary_expire = now + T
    return True

# 写流程：客户端把数据发给 primary，primary 定序后转发
def primary_append(chunk, data, lease_now):
    if lease_now >= chunk.primary_expire:
        raise NoPrimary("租约已过期，需重新申请")
    seq = chunk.next_seq()
    forward_to_replicas(chunk.replicas, seq, data)
    return apply_ordered(chunk, seq, data)
```

## 五、与其他技术对比

| 方案 | 崩溃后果 | 定序权 |
| --- | --- | --- |
| 无租约定序 | 定序权悬空、写卡死 | 无明确 owner |
| GFS chunk 租约 | 租约到期重选 primary | primary 限时拥有 |
| ZooKeeper 会话 | 会话超时（近似租约） | leader 持会话 |
| Chubby master 租约 | 选举新 master | master 限时服务 |

对比 ZooKeeper：ZK 用「会话超时 + 临时节点」近似租约；Chubby 显式用 master 租约。两者都把协调权限时化以避免死锁。

## 六、常见误区

1. 租约过期后 primary 仍接受写造成不一致——客户端/副本需校验租约有效性，过期即拒。
2. master 与 chunk 租约时长不匹配——master 把 chunk 租约设得过长，primary 崩溃后重选太慢。
3. 以为 Chubby 的 Paxos 选举不需要租约——Paxos 选主后仍用租约限时对外服务，隔离脑裂窗口。
4. 把「primary 租约」当「写锁」——它管定序权，不替代副本一致性协议本身。
5. 忽略 epoch/fencing——纯租约在时钟偏移下仍可能双主，需用序号兜底。
6. 以为 master 租约过期即元数据丢失——租约只管对外服务权，元数据在副本组 Paxos 日志中持久。

## 七、与开源书·权威来源对应

- Ghemawat et al. 2003（GFS §3.1）：明确用 chunk lease 把定序权交给 primary，并描述续租与重选。
- Burrows 2006（Chubby）：master 通过租约对外服务，会话与锁均基于限时授权；含 epoch/fencing 思路。
- Kleppmann《DDIA》ch8：以 GFS/Chubby 为例讲解租约在一致性与选主中的作用。
- Hunt et al. 2010（ZooKeeper）：会话超时近似租约的工程实践。
- Vogels 2009：最终一致系统与协调服务的设计权衡。

## 八、面试题

1. GFS 为什么给 primary chunk 发租约？
   要点：把并发写定序权限时交给 primary，崩溃后租约到期自动重选，避免定序权悬空或死锁。
2. Chubby master 租约过期会怎样？
   要点：副本组用 Paxos 重新选举新 master，旧 master 因租约失效停止对外服务，脑裂窗口被限制。
3. 租约时长如何选？
   要点：GFS 远大于单写流程、远小于故障切换预算；Chubby 远大于选举耗时、远小于不一致预算。
4. 为什么还需 fencing（epoch）？
   要点：纯租约在时钟偏移下仍可能双主，序号兜底拒绝陈旧 master/primary 的写。
5. ZK 与 Chubby 的租约有何异同？
   要点：ZK 用会话超时近似租约+临时节点；Chubby 显式 master 租约，理念一致工程不同。

## 九、演进与趋势

后继系统（如 HDFS、Ceph、CockroachDB）沿用「限时 primary/leader 租约」思路，并把 fencing 内建为写入协议的一部分。把租约与全局时间戳（TSO）结合，可简化跨副本一致性判断。

- 分层存储中，温数据块的 primary 租约可随访问频率动态迁移，提升局部性。
- 云原生控制面用租约限权 sidecar，降低权限横向扩散与误用风险。
- 把层级租约派生于 master 租约，使 master 失效自动级联回收所有子 primary。

把租约与 fencing token 绑定（防陈旧 primary/ master 写）；用层级租约让「chunk 租约」派生于「master 租约」，父失效级联回收子权利；租约服务化（etcd Lease）使 GFS/Chubby 式协调可被任意系统复用。现代存储系统（如 HDFS、Ceph）延续 GFS 思路，用租约管 primary/leader 定序权。把租约与 TSO（全局时间戳）结合，进一步简化一致性判断。

## 十、小结

租约把「协调权」明确限时，是 GFS（primary 定序）与 Chubby（master 服务）高可用的关键设计。它让崩溃后的重选自动发生、不死锁，并把脑裂窗口压缩到租约时长之内——配合 fencing，构成一致性与可用性的桥梁。理解「限时授权即协调权」是读懂这类系统的钥匙。
