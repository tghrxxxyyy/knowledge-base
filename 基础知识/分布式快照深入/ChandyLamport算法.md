# ChandyLamport算法

> 对应 Chandy & Lamport 1985（Distributed Snapshots: Determining Global States of Distributed Systems）；MIT 6.824 讲义（Lab 3 快照）；Coulouris《Distributed Systems》第 14 章。

## 一、背景与挑战

分布式系统没有全局时钟，单看各节点本地状态无法构成一致的全局视图。如何在不中断系统处理的前提下，记录一个「逻辑上同时」的全局状态（进程状态 + 通道状态）？Chandy-Lamport 给出基于标记（marker）的算法，用消息而非时钟来界定一致 cut。这是分布式快照理论的奠基性成果，后续几乎所有流式检查点（如 Flink ABS）都源自它。

问题的两个难点必须同时满足：其一，不能暂停系统，因此各节点记录时刻必然错开，如何让错开的局部状态「逻辑上对齐」；其二，通道本身也是系统状态的一部分，在途消息既不属于发送方记录后的状态、也不属于接收方记录前的状态，必须单独记账。CL 的巧妙之处在于把这两件事合并成一个机制：用 marker 沿通道流动，让每条入边自己划定「记录哪个区间的在途消息」。

## 二、核心原理

- 发起者：记录自身状态，向所有出边发送 marker。
- 进程首次收到某通道的 marker 时：记录自身状态、标记该通道状态为空、开始记录该入边后续消息、并向其他出边转发 marker。
- 之后收到同通道的应用消息则记入通道状态，直到该通道的 marker 到达后停止记录（关闭该通道）。
- 当某进程从所有入边都收到 marker，其本地与所有通道状态集齐；全部进程完成即构成一致快照。
算法不停止正常消息处理，仅旁路抄送，故无全局停顿——这是它相对「全局冻结」方案的最大优势。

「某通道状态为空」这一步常被误解。它的含义是：该进程在收到这条通道的 marker 时立刻记录自身状态，因此在它记录之前的、这条入边上仍在途的消息必然是在「它记录之后」才到达吗？并非如此——标记为空的原因是该入边在此时刻「无在途消息」，因为若该进程在此之前已收到过该入边的应用消息，则那些消息已被计入其状态，不构成通道状态。反之，若它曾从别的入边收到 marker 而进入 recording，则此入边在 marker 之前的消息都是「记录后到达」的，需入通道状态。这种「先到者划界、后到者计量」的非对称处理，正是 CL 算法的精妙所在。

## 三、形式化与数学基础

算法保证记录的全局状态满足「通道因果一致性」：对每条通道，记录的通道消息集合恰好是「在快照前发出、快照后到达」的消息，从而无丢失/无重复。设图有 $|V|$ 个进程、$|E|$ 条通道，marker 消息总数为 $O(|E|)$，每个进程状态记录一次，通道状态由入边 marker 触发记录。算法在有限消息内收敛：因每个进程至多转发一次 marker，且 FIFO 保证 marker 终达，全部进程在有限步内完成。一致 cut 的正确性由前文（一致性与全局状态文档）的不变式保证。

用 cut 的集合语言表述会更清晰：快照对应一组事件 $(S, C)$，其中 $S$ 是各进程记录状态时对应的本地事件序列前缀，$C$ 是各通道记录的消息集合。一致性条件为：对任意消息 $m$，$send(m)$ 被计入 $S_i$ 而 $receive(m)$ 未被计入 $S_j$ 时，必有 $m \in C_{ij}$。CL 算法的 marker 机制恰好实现该条件，因为应用消息与 marker 在同一 FIFO 通道中保持相对顺序：若某应用消息在 marker 之前到达，说明它早于接收方的记录点，已进入 $S_j$；若在 marker 之后到达，则它晚于发送方的记录点，必被计入 $C_{ij}$。由 FIFO 的传递性，「在 marker 之前发送」与「在 marker 之后到达」两种情形恰好互补，无第三类。这就是正确性证明的全部内核。

## 四、代码实现

```python
class Proc:
    def on_marker(self, ch, snap):
        if not snap.recording:                 # 首次收到任一 marker
            snap.record_self(self.state)        # 记录自身状态
            snap.recording = True
            snap.channel_closed[ch] = False
            snap.channel[ch] = []               # 该入边通道状态初始为空
            for c in self.out_channels:         # 向所有出边转发 marker
                c.send(MARKER)
        else:
            snap.channel_closed[ch] = True       # 该入边 marker 到达，关闭记录

    def on_app_msg(self, ch, msg, snap):
        if snap.recording and not snap.channel_closed.get(ch, True):
            snap.channel[ch].append(msg)        # 旁路抄送进通道状态
        self.deliver(msg)                       # 正常投递，不中断处理

    def snapshot_complete(self, snap):
        return all(snap.channel_closed.get(c, False) for c in self.in_channels)

# 发起者：任意进程均可，无需中心协调者
def initiate(snap, self_state, out_channels):
    snap.record_self(self_state)                # 先记自己
    snap.recording = True
    for c in out_channels:
        c.send(MARKER)                          # 再向外广播 marker
```

两处实现要点：`on_app_msg` 中 `channel_closed.get(ch, True)` 的默认值必须是「已关闭」，否则首次 marker 到达之前收到的消息会被误记为通道状态（那时还没有 recording，本就该直接投递）；`snapshot_complete` 只用 `snap.channel_closed` 判定，不看是否所有 marker 都到达过——因为单条入边可能从未有业务消息，其「到达」即体现为该键被置为 True。

## 五、与其他技术对比

| 方法 | 是否中断系统 | 是否依赖时钟 | 消息开销 | 一致性基础 |
| --- | --- | --- | --- | --- |
| 全局停顿（STW） | 是 | 否（但需协调暂停） | 低 | 物理同时 |
| 基于物理时钟 | 否 | 是（需时钟同步） | 低 | 时间同步假设 |
| Chandy-Lamport | 否 | 否 | $O(\|E\|)$ marker | 因果序 |
| 异步屏障快照（ABS） | 否 | 否 | 与数据流同量 | 因果序 + 反压 |

CL 不中断系统、不依赖物理时钟同步，仅依赖可靠 FIFO 通道与 marker 传播，是其工程价值所在。物理时钟方案需要 NTP/PTP 同步且仍可能因时钟漂移产生不一致 cut。ABS 可视为 CL 在「数据流 + 屏障」语境的落地版：marker 变成 barrier，且通道状态改为「输入缓冲中的在途记录」。

## 六、常见误区

1. 以为 marker 会破坏消息顺序：marker 是旁路控制消息，不进入应用数据流，FIFO 保证其与普通消息的相对序可判定在途。
2. 忽略通道状态记录：只记进程状态会得不一致快照（幽灵/丢失消息）。
3. 认为发起者必须是固定节点：任意进程均可发起，算法对称，不需中心协调者。
4. 忽略「所有入边 marker 到达」才算完成：提前结束会漏记仍在途的通道消息。
5. 认为算法能处理非 FIFO：原算法假设 FIFO，非 FIFO 需扩展（见《快照的局限与演进》）。
6. 在首次收到 marker 前就缓冲消息：此时尚未进入录制状态，这些消息早已被计入本地状态，再缓冲会造成重复。
7. 忘记记录发起者自身的入边通道：发起者虽先记录自身状态，但仍需等待所有入边的 marker（或认定其入边状态为空）才算完成。
8. 把 marker 与业务消息共用同一条不可靠通道：通道必须可靠有序，否则 marker 可能丢失导致快照永不收敛。

## 七、与开源书·权威来源对应

- Chandy & Lamport 1985 原论文给出算法、一致 cut 定义与正确性证明，并讨论发起者与终止条件。
- MIT 6.824 Lecture & Lab 3 把 CL 作为分布式快照的标准实现练习，强调通道状态是易错点。
- Coulouris《Distributed Systems》第 14 章用动画式图示讲解 marker 传播与状态收齐过程。
- Lamport 1978「Time, Clocks, and the Ordering of Events」提供 happened-before 因果序，是 cut 一致性的理论基础。

## 八、面试题

1. 问：Chandy-Lamport 如何保证通道状态一致？
   答：每个入边以「首次收到 marker」为起点记录后续应用消息，以「该入边 marker 到达」为终点关闭；marker 前的在途消息恰被记录，无遗漏无重复。
2. 问：marker 的作用是什么？
   答：marker 是界定一致 cut 的控制信号——它触发状态记录、开始/结束通道状态收集，并沿出边传播使全网协同进入快照。
3. 问：为何不依赖全局时钟？
   答：一致性由因果（happened-before）与 marker 顺序界定，而非物理时刻，因此无需时钟同步。
4. 问：算法何时终止？
   答：每个进程从所有入边收到 marker 即完成本地快照；当所有进程完成，全局快照收齐，由发起者或协调逻辑判定终局。
5. 问：为什么通道状态能精确等于「在途消息」？
   答：FIFO 保证应用消息与 marker 的先后关系可判定，使「marker 前发、marker 后到」的消息被唯一地归入通道状态，不存在第三类情况。
6. 问：若通道非 FIFO 会怎样？
   答：marker 可能越过先发的应用消息，导致该消息既未进入本地状态也未进入通道状态而被丢失，故须引入序列号等额外机制。

## 九、演进与趋势

扩展到非 FIFO 通道（需序列号，见《快照的局限与演进》）、异步屏障快照（Flink ABS，见《快照在Flink中的应用》）、以及不依赖全通道记录的轻量快照（如近似/采样快照）。现代系统多在 CL 思想上叠加工程优化（对齐、增量、unaligned）而非使用纯 CL。

另一个方向是把 CL 与共识结合：在需要强一致的场景，快照点可由共识日志序号钉住，从而把「因果一致的 cut」升级为「与提交点对齐的 cut」，便于恢复与二次复制。这类混合方案在计算存储分离架构中尤为常见。

## 十、小结

Chandy-Lamport 用 marker 在不停止系统、不靠时钟的情况下捕获一致的全局状态。其核心洞见是：用消息而非时间界定「同时」——marker 把因果边界变成可操作的记录协议，这是分布式快照理论的奠基性成果。理解它，就掌握了所有后续流式检查点技术的理论源头。

三条记忆要点：marker 与数据同通道保序（正确性前提）；通道状态由「首次 marker 开、本通道 marker 闭」界定（计量的关键）；全入边收齐才算完成（终止条件）。
