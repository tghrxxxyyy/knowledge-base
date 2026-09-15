# 读一致性与线性izable读

> 对应 Gilbert & Lynch 2002（CAP 与线性一致定义）与 Ongaro & Ousterhout 2014（Raft ReadIndex / Lease Read）。

## 一、背景与挑战

共识保证「写」被一致提交，但「读」若直接读本地状态机，可能读到尚未提交（应用）或过期的数据，从而破坏线性一致（linearizability）：一个读应当看到它发起之前已完成的所有写。考虑一个典型 bug——客户端写入后立刻从 Follower 读，却读到旧值，破坏了 read-your-writes。复制系统中提供线性izable 读是个常见坑，尤其 Follower 本地状态往往落后于 Leader 的 `commitIndex`，盲目本地读必然不一致。

「读」比「写」更难做对的原因在于：写有明确的提交点可作为仲裁依据，而读没有产出物、不改变状态，因此必须额外构造「我此刻看到的状态确实是全局最新已提交状态」的证明。这个证明要么通过多数派交互（ReadIndex），要么通过时间假设（租约），要么干脆把读也变成一次共识（全共识读）——所有读方案本质上都是这三种证明方式的不同权衡。

## 二、核心原理

三种读方案：① 走完整共识——把读当成一条空日志项提交，最慢最安全，但能拿到全局最新已提交点；② ReadIndex——Leader 先确认自己仍是 Leader（通过近期心跳多数派确认），记录当前 `commitIndex`，读返回该点对应的已 apply 状态，不写日志；③ 租约读（Leader Lease）——在租约有效期内 Leader 确信自己仍是主，可直接本地读。核心在于「读看到的状态必须 ≥ 所有已完成写的提交点」，且状态机必须已 apply 到该点，否则会读到 commit 但未应用的值。

ReadIndex 的两个动作常被混为一谈：确认权威与确定读点。前者解决「是否可能已有新 Leader 提交了我不知道的写」，需要一次多数派心跳往返；后者解决「读到哪个位置算够新」，只需取本地 `commitIndex`。二者缺一不可——若只确认权威不取读点，可能读到比自己已知更旧的状态；若只取读点不确认权威，则可能在已被废黜的情况下仍自信地返回本地值。批处理优化（把多个 ReadIndex 请求合并到一次心跳）是工程上降低读路径开销的常用手段。

## 三、形式化与数学基础

线性一致要求：若读操作 $r$ 在写操作 $w$ 完成之后开始（按实时序），则 $r$ 必须看到 $w$ 的值。设 $C$ 为各副本已知 `commitIndex` 的最大值，ReadIndex 保证：

$$read\_view \ge C \ge \max_{w\ finished\ before\ r} index(w)$$

租约读保证租约期内无新 Leader 当选，故本地状态即最新已提交，等价于在租约窗口内实时序成立的线性一致。形式化上，租约正确性依赖 $clock\_skew < lease\_timeout - heartbeat$，否则双主窗口出现。

更精确地，线性一致要求存在一个全序 $\prec$ 扩展实时偏序，使得每个操作在其区间内某点「原子生效」。对读而言，这意味着读的返回点必须位于「所有先于它完成的写」之后。ReadIndex 的推导链是：多数派心跳确认 ⇒ 无更高任期 Leader 已提交新写（否则它必须先赢得多数派，与本次心跳响应矛盾）⇒ 本地 `commitIndex` 即全局最新提交点 ⇒ 等待 apply 后读即线性一致。租约的推导链更弱但更快：租约期内无新 Leader ⇒ 无他人提交新写 ⇒ 本地即最新。可见租约用「时间假设」替代了「一次心跳」，因此其正确性完全取决于该假设是否成立。

## 四、代码实现

```python
def read_index_read():
    # Leader 先确认自身权威（近期心跳得到多数派响应）
    assert leader_lease_valid() or confirm_quorum_heartbeat()
    commit = self.commit_index           # 记录当前提交点（读点）
    wait_until(applied_index >= commit)  # 确保状态机已 apply 到该点
    return state_machine.read()

def lease_read():
    if now < lease_expiry:               # 租约内直接本地读
        return state_machine.read()
    return read_index_read()             # 租约外退回 ReadIndex

# Follower 经 Leader 授权的安全读（降低 Leader 读压力）
def follower_read():
    c = leader.read_index()              # Leader 返回安全的 commitIndex
    wait_until(self.applied_index >= c)  # 等本地状态机追平该点
    return self.state_machine.read()

# 工程优化：批量化 ReadIndex，把多个读合并到一次心跳
def batched_read_index(pending_reads):
    idx = confirm_quorum_heartbeat_and_get_commit()   # 一次往返
    for r in pending_reads:
        r.fulfill_after_apply(idx)                    # 各读自行等待 apply
```

`wait_until(applied_index >= commit)` 是不可省略的一步。共识层的提交与状态机的应用是两个独立进度：`commitIndex` 由多数派复制推进，`appliedIndex` 由本地 apply 线程推进，二者之间存在窗口。若跳过该等待，就会在网络与磁盘压力大时读到「已提交但尚未应用」的旧状态——这是隐蔽且低频的 bug，压测时尤为难复现。

## 五、与其他技术对比

| 方案 | 是否写日志 | 延迟 | 一致性保证 | 依赖时钟 | 额外负载 |
| --- | --- | --- | --- | --- | --- |
| 全共识读 | 是 | 最高 | 强线性一致 | 否 | 高（占复制带宽） |
| ReadIndex | 否（需心跳确认权威） | 中 | 线性一致 | 否 | 低（可批量） |
| 租约读 | 否 | 最低 | 线性一致（依赖时钟） | 是 | 无 |
| Follower 直接读 | 否 | 低 | 仅最终一致，可能过期 | 否 | 无 |
| 快照读（MVCC） | 否 | 低 | 会话/快照一致 | 否 | 需版本存储 |

ZooKeeper 的 `sync` + `read` 语义类似 ReadIndex；全共识读最稳但浪费复制带宽；Follower 直接读只适合「能容忍过期」的场景。MVCC 快照读提供的是「某个时间点的一致视图」而非线性一致，它把「实时最新」替换为「版本一致」，是读多写少系统中的常用折中。

## 六、常见误区

1. Follower 直接读本地：可能读到未提交或过期，破坏线性一致，必须经 Leader 授权或转发。
2. 租约读忽略时钟漂移：漂移/回拨致双主，应设误差余量（lease = 心跳超时 − 时钟误差）。
3. 读不等 apply：读到 `commitIndex` 但状态机未应用，得旧值；必须等 `applied ≥ commit`。
4. 把「已提交」当「已可见」：客户端视角还需考虑 read-your-writes 会话保证，跨客户端需线性一致。
5. 认为租约读永远最快：时钟异常或 Leader 刚切换时，租约读会退化并需回退 ReadIndex。
6. 认为 ReadIndex 不需要多数派交互：确认权威必须有一次多数派往返，否则无法排除已被废黜的可能。
7. 把顺序一致当线性一致：顺序一致只要求各副本看到相同全局序，不约束实时性，读仍可能「回到过去」。
8. 忽略读放大对 Leader 的压力：所有读都打 Leader 会造成单点瓶颈，需配合 Follower 授权读或 MVCC 分流。

## 七、与开源书·权威来源对应

- Gilbert & Lynch 2002 在 CAP 定理论述中给出线性一致（atomic/linearizable）的形式化定义：操作看似「瞬间生效于某实时点」。
- Ongaro & Ousterhout 2014 论文「Read-only queries」小节专讲 ReadIndex 与 Lease Read，并分析时钟假设。
- Kleppmann DDIA 第 9 章详述一致性层级（linearizable / sequential / eventual）与读路径取舍。
- Lamport 1978「Time, Clocks, and the Ordering of Events」提供实时偏序与逻辑序的基础框架。

## 八、面试题

1. 问：Raft 如何实现线性一致读而不写日志？
   答：用 ReadIndex（确认自身仍是 Leader 并记录 `commitIndex`，等状态机 apply 到该点后读）或租约读，读返回最新已提交且已 apply 的状态，无需追加日志项。
2. 问：租约读与 ReadIndex 的区别与取舍？
   答：租约读更快但依赖时钟正确性；ReadIndex 不依赖时钟，仅需在读时确认 Leader 权威，代价是一次心跳往返。
3. 问：Follower 能否参与线性一致读？
   答：可以，但需 Leader 通过 ReadIndex 授权一个安全的 `commitIndex`，Follower 等自身 apply 到该点后读，避免读过期。
4. 问：线性一致与顺序一致的区别？
   答：线性一致要求符合实时序，顺序一致只要求各副本看到相同全局序而不要求实时，前者更强。
5. 问：为什么必须等 `applied ≥ commit` 才能返回？
   答：提交点由复制进度决定，应用点由本地 apply 线程决定，二者间存在窗口；不等 apply 会返回已提交但尚未生效的旧值。
6. 问：ReadIndex 为什么可以批量优化？
   答：多个读共享同一次多数派心跳确认权威，各自只需记录并等待自己的读点，往返次数从 O(读量) 降为 O(批次数)。

## 九、演进与趋势

结合 HLC 或 TrueTime 的「时间授权读」用时间戳界定可见性，降低对 Leader 权威确认的开销；CockroachDB 等用 MVCC 快照读实现会话级一致而不阻塞写；计算存储分离架构下，线性一致读常与并行 Raft 的「就近副本读」结合。

另一条方向是把读一致性与缓存结合：在 Leader 附近部署只读副本，通过「读点水印」判断缓存条目是否仍安全可用，命中则直接返回、未命中才回源到 ReadIndex。这类设计把线性一致的证明成本从「每次读」降为「每次缓存未命中」，是读密集系统的常见优化路径。具体语义以各系统官方最新文档为准。

## 十、小结

线性izable 读要求明确「读到最新已提交且已 apply 的状态」。Raft 用 ReadIndex 或租约读在无日志开销下达成，关键在于 Leader 必须用任期/租约证明自身权威，避免盲目本地读带来的过期与不一致。时钟的正确性决定了租约读能走多远——一旦时钟不可信，ReadIndex 是唯一不依赖它的安全退路。

三种读方案可按「证明成本」排序记忆：全共识读用一次写证明、ReadIndex 用一次心跳证明、租约读用时间假设证明。成本越低，假设越强；选择方案的本质，就是判断你能接受多强的假设。
