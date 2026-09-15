# 多Paxos与日志复制

> 对应 Lamport 1998（Paxos Made Simple）与 Ongaro & Ousterhout 2014（对比 Raft）。

## 一、背景与挑战

单 Paxos 实例只能就「一个值」达成共识，但复制一条命令日志需要对每个槽位（slot）都达成共识。若对每一条日志都跑完整 Prepare/Accept 两阶段，延迟与消息量都不可接受——每条写要 2×RTT 且每副本多次落盘。Multi-Paxos 的思路是：先选出一个稳定的 Leader，之后对绝大多数 slot 复用该 Leader，把每条日志当作一个独立但共享 Leader 的共识实例，从而把两阶段压成一阶段。这正是工业共识系统（如 Chubby 背后的思路）的起点。

除了延迟，还有三个工程挑战需要同时解决：其一，slot 空洞——某些 slot 可能始终未能 chosen，导致后续日志无法连续 apply，必须决定是跳过、填充还是阻塞；其二，状态机顺序——共识层定序与状态机 apply 必须严格一致，否则不同副本会因 apply 顺序不同而状态发散；其三，成员变更——配置本身也需要共识，而「改配置」与「用配置」之间存在自指悖论。

## 二、核心原理

Multi-Paxos 先用一次单 Paxos 选出稳定 Leader（用递增的 proposal number 抢占），之后该 Leader 对每个日志 slot 充当 Proposer，直接发送 Accept 即可，跳过 Prepare。各 slot 独立达成 chosen 值，slot 顺序即日志顺序。当发生 Leader 切换时，新 Leader 需先跑 Prepare 用更高 proposal number 抢占，并补齐未完成的 slot（尊重已 chosen 值），再继续 Accept。关键不变量：一旦某 slot 的 chosen 值确定，所有进程对该 slot 看到同一值，且不可逆。稳定 Leader 假设是性能来源，也是其「不严格容错」的软肋——Leader 切换期间会短暂退化。

深入一层看，Leader 复用的合法性来自 Paxos 的 Phase 1 语义：Prepare 的作用是「声明提案号并收集已接受值」。若某 Proposer 以号 $n$ 完成了 Phase 1 并获得多数派承诺，则在号 $n$ 有效期内，它无需重复收集，因为任何更高号的提案都必须先获得多数派中至少一个「承诺了 $n$ 的节点」的同意，从而被迫学习到已 chosen 值。因此「一次 Prepare + 多次 Accept」是安全的结构性推论，而非近似优化。切主的代价在于必须重跑 Phase 1（通常还需对每个 slot 补 Phase 1 以探明值），这就是「稳定 Leader」假设的价值所在。

## 三、形式化与数学基础

每个 slot $i$ 是一个 Paxos 实例，决定 $value_i$。安全条件为：若某进程认为 slot $i$ 已 chosen $v$，则任何进程此后对该 slot 只能 chosen $v$。稳定 Leader 使 Prepare 仅需在抢占到来的时刻做一次：

$$chosen(i) = v \iff \exists\ quorum\ Q:\ \forall p\in Q,\ accepted(p, i, n, v)$$

复用 Leader 后，后续 slot 的 Accept 直接定值，乐观路径延迟从 $2 \times RTT$ 降为 $1 \times RTT$。注意「稳定 Leader」是工程假设而非协议保证：当 Leader 失效，必须重新 Prepare，期间 slot 写入被阻塞。

可以量化收益：设稳定期内平均连续提交 $k$ 条日志，则摊销后每条日志的协商成本约为 $(1/k)\times Phase1 + Phase2$，当 $k$ 较大时趋近 $\text{Phase2}$，即 1 RTT。选择 $k$ 的实际约束是切主频率：若平均切主间隔为 $T$、提交速率为 $r$，则 $k \approx rT$。这也解释了为什么「Leader 稳定」比「选主最快」更重要——频繁切主会让摊销收益归零，甚至比无 Leader 方案更差。此外，由于 Quorum 交叠性，任意两个多数派必有交集节点，因此「用更高号抢占」必然与该节点冲突并被拒绝，从而防止旧 Leader 的迟到消息覆盖新值。

## 四、代码实现

```python
# 稳定 Leader 下，对 slot i 直接 Accept（跳过 prepare）
def propose_slot(slot, value, leader_id, n):
    if leader_id != self.id:
        return                      # 非 Leader 不接受写
    send_accept(slot, n, value)      # 多数派 Accept 即 chosen
    if saw_higher_proposal(n):       # 抢占检测：有更高号出现
        step_down()                  # 主动退位，避免与旧值冲突

# 新 Leader 补齐：先 prepare 探明各 slot 已接受值
def recover_slots(slots, n, my_values):
    recovered = {}
    for s in slots:
        v = prepare_and_learn(s, n)  # 用更高 n 抢占并学习已接受值
        if v is not None:
            recovered[s] = v         # 尊重已 chosen，绝不覆盖
        else:
            recovered[s] = my_values[s]   # 空洞：选自身值，safe 因无承诺
    return recovered

# 提交前检查：接受者只在未承诺更高号时接受
def on_accept(slot, n, value):
    if n < self.promised:            # 已承诺更高号，拒绝
        return "reject", self.promised
    self.promised = n
    self.accepted[slot] = (n, value) # 记录 (号, 值)，供后续学习
    return "accept", n
```

`on_accept` 中的 `promised` 单调性是整套协议的安全基石：接受者一旦承诺号 $n$，就再也不会接受任何号小于 $n$ 的提案。这保证了「后到的旧消息」会被明确拒绝，而不是静默覆盖，从而让 Proposer 能感知冲突并重新进入 Phase 1。

## 五、与其他技术对比

| 维度 | Multi-Paxos | Raft | EPaxos | Zab |
| --- | --- | --- | --- | --- |
| Leader | 稳定但非强制 | 强 Leader | 无序、去 Leader | 强 Leader |
| 提交路径 | Accept 直发 | AppendEntries | 无序提交 + 依赖图 | 有序广播 |
| 日志连续 | 可含空洞 | 强制连续 | 无日志概念 | 强制连续（zxid） |
| 延迟 | 1 RTT（乐观） | 1 RTT | 视冲突 | 1 RTT（乐观） |
| 复杂度 | 需自工程化 | 内置清晰 | 高 | 中 |
| 成员变更 | 需自行设计 | joint consensus 成文 | 研究阶段 | 有既定流程 |

Raft 可视为 Multi-Paxos 的一种「清晰工程化」：强制连续日志、显式任期、选主限制。二者能力等价，Raft 更易实现正确，但 Multi-Paxos 的 slot 模型在「日志可空洞」场景更灵活，也更容易与批量提交、乱序执行等优化结合。

## 六、常见误区

1. 每个 slot 都跑完整 Paxos：无稳定 Leader 时延迟高，应复用 Leader 走一阶段。
2. 忽略 proposal number 单调：可能被旧 Leader 的迟到 Accept 干扰，必须用更高 $n$ 抢占。
3. 认为新 Leader 可随意定值：必须尊重已 chosen 的 slot，否则破坏安全。
4. 把 Multi-Paxos 当成单一算法：它其实是「单 Paxos + Leader 复用约定」，细节需自行设计（这也是 Raft 出现的动机）。
5. 假设 Leader 永远稳定：失效后必须重新 Prepare，期间写入退化且可能冲突。
6. 混淆「已接受」与「已 chosen」：多数派接受才 chosen；单个接受者持有某值不意味着该值已定，新 Leader 只能把它当候选而非结论。
7. 认为空洞可以随便跳过：跳过会改变日志与状态机的对齐关系，需协议明确规定（如 no-op 填充）才能保证各副本一致。
8. 忽略状态机 apply 的持久化顺序：共识层已 chosen 但状态机尚未 apply 就崩溃时，恢复必须依据持久化日志重放，否则状态丢失。

## 七、与开源书·权威来源对应

- Lamport 1998《Paxos Made Simple》描述 Multi-Paxos 的 Leader 复用优化与稳定性假设，并提醒「实际系统需自行处理成员变更」。
- Lamport 1978「Time, Clocks, and the Ordering of Events」给出逻辑时钟与全序的基础，是理解 proposal number 作为逻辑时间戳的前提。
- Ongaro & Ousterhout 2014 在论文中把 Raft 与 Paxos 的可理解性作对比，指出 Multi-Paxos 工程化缺失。
- MIT 6.824 用 Paxos 讲解复制，并指出工程化 Paxos 的坑（如空洞补齐、状态机 apply 顺序）。

## 八、面试题

1. 问：Multi-Paxos 如何优化延迟？
   答：固定稳定 Leader 后，多数 slot 跳过 Prepare，直接 Accept 定值，乐观路径由两阶段降为一阶段（1 RTT）。
2. 问：新 Leader 如何安全补齐未提交 slot？
   答：先 Prepare 用更高 $n$ 抢占，学习各 slot 已接受值；对已 chosen 的尊重其值，对空洞选自身值，保证不破坏已提交。
3. 问：Multi-Paxos 与 Raft 本质区别？
   答：安全语义等价，区别在工程封装：Raft 把 Leader、任期、连续日志、选主限制固化进协议；Multi-Paxos 把这些留给你实现。
4. 问：为什么 Multi-Paxos 需要「稳定 Leader」假设？
   答：否则每个 slot 都需 Prepare，退化为单 Paxos 的高延迟；稳定 Leader 是把「反复协商」摊销到一次选主的关键。
5. 问：`promised` 的单调性为什么必需？
   答：它让接受者能拒绝迟到的低号提案，从而保证任何新提案者必须学习到已 chosen 值，是 Quorum 交叠得以生效的执行基础。
6. 问：「已接受」和「已 chosen」差在哪？
   答：已接受是单节点局部状态，可被更高号覆盖（只要未承诺）；已 chosen 是多数派事实，一经形成即不可逆。
7. 问：空洞 slot 不处理会怎样？
   答：日志无法连续 apply，各副本状态机进度不一致，读到的序列可能不同，破坏线性一致；通常用 no-op 填充或阻塞等待解决。

## 九、演进与趋势

EPaxos、WPaxos 等无序变体去除 Leader 瓶颈，支持冲突不相交的命令并行提交，提升多核/多区域吞吐；但实现复杂度与冲突协调成本显著上升。近年研究聚焦「灵活 quorum」与跨地域低延迟提交，以及把 Multi-Paxos 的 slot 模型与 Raft 的强一致结合。

工业实践中还有「批量 + 流水线」的组合：一次 Accept 携带多个 slot、并允许在未确认前继续发送后续批次，把吞吐从「每 RTT 一条」提升到「每 RTT 一批」。这些优化不改变安全性论证，但会显著加重 Leader 的内存与回滚压力，因此通常配合背压与窗口上限使用。具体实现细节以各项目官方最新文档为准。

## 十、小结

Multi-Paxos 把「单值共识」推广到「日志复制」，稳定 Leader 是关键优化，Raft 是其易用的工程化身。理解它有助于看穿各类共识协议「换皮不换核」的共性：多数派、单调编号、已 chosen 不可变，才是共识的真正不变式。所谓「易理解」，本质是把这些不变式从实现者的脑中搬进了协议文本。

三句话概括工程要点：把 Phase 1 摊销到选主、把 Phase 2 流水化成批量、把已 chosen 视为永不可变的只读历史。凡违背任一条的实现，都会在故障恢复场景下暴露正确性缺陷。
