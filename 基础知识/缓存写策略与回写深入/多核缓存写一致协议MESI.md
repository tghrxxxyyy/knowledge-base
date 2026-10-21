# 多核缓存写一致协议MESI

> 对应 Hennessy & Patterson《Computer Architecture: A Quantitative Approach》第 2.4 节与附录；Papamarcos & Patel《A Cache Coherence Scheme with Efficient Dynamic Exploitation of Migratory Sharing》（ISCA 1984，MESI 命名来源）；Intel SDM Vol. 3A 缓存一致性章节。

## 一、背景与挑战

多核处理器中，每个核都有自己的私有缓存，同一物理地址可能在多个核中存在副本。一旦某个核写入该地址，其他核的副本就变成「过期数据」；若不加约束，不同核会读到不同的值，共享内存编程模型直接崩溃——这不是性能问题，而是正确性问题。

朴素方案有两个极端。一是「关掉缓存/写直达到共享总线」：一致性容易，但性能无法接受。二是「每个核随便写」：在「生产者-消费者」「标志位+数据」这类常见并行模式下立刻出错。工程上需要一套协议：在缓存行粒度上维护「谁是最新、谁可以写、谁必须作废」的不变量，同时尽量把一致性流量限制在必要的总线事务上。

MESI 是最经典的监听式（snooping）写无效（write-invalidate）协议：每行缓存处于 Modified/Exclusive/Shared/Invalid 四态之一。它是理解 MESIF、MOESI、目录协议、以及实际 CPU 一致性 bug（如双检锁失效、无锁队列内存序）的基础，也是面试中多核题目的核心。

## 二、核心原理

**四态定义**（相对下一级存储与其它私有缓存）：
- **M（Modified）**：本缓存行是唯一最新副本，且比内存新（脏）。内存副本过期。可直接写，无需总线事务。
- **E（Exclusive）**：本缓存行是唯一副本，且与内存一致（干净）。可写，写时本地转 M，不必广播（因无其它副本）。
- **S（Shared）**：可能多个核同时持有，都与内存一致（干净）。不可直接写；写前必须让其它副本失效并拿独占权。
- **I（Invalid）**：无效，不包含可用数据。

**核心不变量**：
1. 任意时刻，一个地址最多有一个 M 或一个 E，可以有多个 S，但不能 M/E 与他人 S 并存（M/E 独占）。
2. 处于 M 的行，内存副本不确定为新；读它核时由 M 核供应数据或写回后供应。
3. 写权限（可写）等价于处于 M 或 E；要从 S 写，必须先升级（upgrade/BusRdX）。

**典型事务**（总线监听）：
- `BusRd`：本核读未命中，向总线要块。若他人 M，则该核写回/供数并转 S（或 E），请求者得 S；若他人 E/S，则各自转 S，请求者 S；若无，则从内存取，请求者 E。
- `BusRdX`（Invalidate/Read-Exclusive）：本核要写未命中（或 S→M）。他人副本一律转 I；请求者得 M（若供数核为 M 先取数）。
- `Flush/Writeback`：M 核响应他人读时可能写回内存并供数。
- `Upgrade`：S→M，只发失效不取数据（数据已在本地）。

**为什么需要 E 态**：若无 E（如 MSI），任何读未命中都会让块变成 S，下次写都要广播失效；E 让「唯一读者后来写」免广播，减少无效流量。MESI 因此比 MSI 少很多升级事务。典型受益场景是「核内私有数据」与「迁移式共享」（数据在不同核间轮流使用）：读到 E，写本地转 M，完全不碰总线。

**写无效（write-invalidate） vs 写更新（write-update）**：MESI 属于写无效——写之前把他人副本作废，后续本核写全在本地。写更新则每次写广播新值给他人，保持多副本热。写无效在「写后不再被他人读」时省流量，写更新在「写后马上被他人读」时少一次 miss。现代 CPU 几乎都用写无效，配合目录/嗅探把失效精确发给共享者。

**边界条件**：L1 常与 L2 相对做包含/非包含设计；核内 store buffer 使「本核写后读」可本地转发；内存序（TSO）与 `lock` 前缀、fence 影响事务可见时机；伪共享（false sharing）下不同变量同缓存行会反复 S↔M 抖动。DMA、自修改代码、设备 MMIO 还要考虑非一致性代理，需要显式刷缓存或绑定到一致性点。

## 三、形式化与数学基础

设每行状态 $s \in \{M,E,S,I\}$，事件包括本核读 $PrRd$、本核写 $PrWr$、总线读 $BusRd$、总线独占读 $BusRdX$、总线失效 $BusInv$。状态转移可写为：

$$
\delta: \{M,E,S,I\} \times \{PrRd, PrWr, BusRd, BusRdX\} \to \{M,E,S,I\}
$$

关键转移：
$$
S \xrightarrow{PrWr} M \ \text{（发 Upgrade/Invalidate，他人 } S \to I\text{）}
$$
$$
E \xrightarrow{PrWr} M \ \ \text{（无总线事务）},\quad
M \xrightarrow{BusRd} S \ \text{（写回或供数）}
$$
$$
I \xrightarrow{PrRd} S/E,\quad I \xrightarrow{PrWr} M \ \text{（取数并独占）}
$$

一致性流量分析：设写共享工作集，$N$ 核各写同一块序列，平均共享度 $s$（持有副本数）。每次 S→M 升级需 $O(s)$ 次失效广播。若无 E，读未命中总产生 $s \ge 1$；有 E，私有读写迁移（migratory）模式的失效次数近似：

$$Inv_{MESI} \approx W_{mig}, \qquad Inv_{MSI} \approx W_{mig} + R_{mig}$$

其中 $W_{mig}, R_{mig}$ 为迁移式读写次数。MESI 省下的正是「独占读后再写」的失效。

对伪共享：两核写同行不同字，导致每对写之间互发失效，设写率 $r$、核数 $N$，失效流量近似 $O(N r)$，远大于真共享。缓解靠 padding 到整行、按核分区数据结构。

## 四、代码实现

下面用 Python 模拟双核 MESI 监听协议：跟踪每行状态，输出状态转换与总线事务，并验证「S 写必须先失效他人」「E 写不需广播」「M 被他核读要写回」。

```python
"""简化 MESI 监听协议模拟（两核共享一行）"""
from enum import Enum


class S(Enum):
    M = "Modified"
    E = "Exclusive"
    S = "Shared"
    I = "Invalid"


class Line:
    def __init__(self):
        self.state = {0: S.I, 1: S.I}
        self.mem_valid = True      # 内存是否为最新
        self.owner = None
        self.data = 0
        self.bus_log = []


class MESI:
    def __init__(self):
        self.line = Line()

    def _bus(self, msg):
        self.line.bus_log.append(msg)

    def read(self, core: int):
        st = self.line.state[core]
        other = 1 - core
        if st in (S.M, S.E, S.S):
            return  # 命中
        # 本核 I：需要取数
        if self.line.state[other] == S.M:
            self._bus(f"core{core} BusRd -> core{other} Flush/写回")
            self.line.mem_valid = True
            self.line.state[other] = S.S
            self.line.state[core] = S.S
        elif self.line.state[other] == S.E:
            self._bus(f"core{core} BusRd -> core{other} E->S")
            self.line.state[other] = S.S
            self.line.state[core] = S.S
        elif self.line.state[other] == S.S:
            self._bus(f"core{core} BusRd -> 共享命中")
            self.line.state[core] = S.S
        else:
            self._bus(f"core{core} BusRd -> 内存取数, 进入 E")
            self.line.state[core] = S.E
            self.line.mem_valid = True

    def write(self, core: int):
        st = self.line.state[core]
        other = 1 - core
        if st == S.M:
            self.line.data += 1
            return
        if st == S.E:
            self._bus(f"core{core} E->M (本地写, 无总线)")
            self.line.state[core] = S.M
            self.line.mem_valid = False
            self.line.data += 1
            return
        if st == S.S:
            self._bus(f"core{core} Upgrade/BusRdX: 失效 core{other}")
            self.line.state[other] = S.I
            self.line.state[core] = S.M
            self.line.mem_valid = False
            self.line.data += 1
            return
        # I: BusRdX
        if self.line.state[other] == S.M:
            self._bus(f"core{core} BusRdX -> core{other} 供数并失效")
            self.line.mem_valid = False
        else:
            self._bus(f"core{core} BusRdX -> 失效 core{other} 并取数")
            self.line.mem_valid = False
        self.line.state[other] = S.I
        self.line.state[core] = S.M
        self.line.data += 1

    def dump(self, tag):
        print(tag, [(c, self.line.state[c].name) for c in (0, 1)],
              "mem_valid=", self.line.mem_valid, "data=", self.line.data)


if __name__ == "__main__":
    m = MESI()
    m.read(0)      # core0 取数 -> E
    m.dump("r0:")
    m.write(0)     # E->M 无总线
    m.dump("w0:")
    m.read(1)      # 他核读 -> core0 写回, 双方 S
    m.dump("r1:")
    m.write(1)     # S->M, 失效 core0
    m.dump("w1:")
    print("bus:")
    for x in m.line.bus_log:
        print(" ", x)
```

预期输出序列：`r0` 后 core0=E；`w0` 无总线转 M；`r1` 触发写回并双方 S；`w1` 发 Upgrade 失效 core0 后 core1=M。四态转换与总线事件一目了然。

## 五、与其他技术对比

| 协议 | 状态 | 特点 | 代价 |
|------|------|------|------|
| MSI | M/S/I | 最小正确 | 读写共享多失效 |
| MESI | +E | 独占读免广播 | 状态多 1 bit |
| MESIF | +F | Intel：S 中指一个供数核 | 减少供数冲突 |
| MOESI | +O | AMD：脏共享可不写回 | 状态复杂 |
| 目录协议 | 每行记录共享者 | 可扩展到众核/多插槽 | 目录存储与延迟 |

MESI 适合总线/环形互连的中等核数；大规模 NUMA/众核用目录或分布式嗅探（HT、glued/die-to-die）扩展。

## 六、常见误区

1. **「Shared 状态可以直接写」**——错。S 只读；写前必须让其它副本失效并升级到 M（发 Upgrade/BusRdX），否则别人读到旧值。
2. **「MESI 能让 DMA/设备自动一致」**——错。不参与缓存一致的 DMA 读到的是内存，可能比缓存旧；需要软件刷缓存或硬件 I/O 一致性（如 ARM CCI、CXL）。
3. **「双检锁不用 volatile/原子也是安全的」**——错。MESI 保证缓存一致，不保证编译器/CPU 不重排；需要用 acquire/release 或 `std::atomic` 写出正确 DCLP。
4. **「E 态只是性能优化，可有可无」**——语义上 MSI 也能正确，但 E 省掉大量「独占读后再写」的失效事务，对私有迁移数据很关键。
5. **「一致性协议解决 false sharing」**——恰恰相反，伪共享会让 MESI 在同行上高频 S↔M 抖动，必须靠数据布局（padding）解决。

## 七、与开源书/权威来源对应

1. Hennessy & Patterson《Computer Architecture: A Quantitative Approach》第 2.4 节《Cache Coherence》：监听协议、MESI/MOESI 对比。
2. Papamarcos & Patel, ISCA 1984：MESI 协议原始论文。
3. Sorin, Hill & Wood《A Primer on Memory Consistency and Cache Coherence》（Synthesis Lectures，开放 PDF）：一致性与内存序的系统论述。
4. Intel® 64 and IA-32 SDM Vol. 3A《Multi-Processor Management》：实际 CPU 的窥探、锁与刷回指令；gem5 `src/mem/cache/` 与 `protocols/MESI_Two_Level` 可运行开源实现。

## 八、面试题

**1. 从 S 转到 M 需要什么总线事务？**
答：需要 Upgrade/BusRdX（写失效）：广播使其它核该行转 I，本核获得独占写权限后置 M。数据已在本地，通常不必重新取数。

**2. Modified 行有什么特征？被其它核读时会怎样？**
答：M 表示本行脏且独占，内存副本过期。其它核读（BusRd）时，M 核必须供数（或先写回内存再供），并从 M 转为 S（或按协议转 O），请求者获得共享副本。

**3. MESI 比 MSI 好在哪里？**
答：多了 Exclusive：块只被一个核读时进 E，之后写本地转 M，不发总线失效。对「先读后写」的私有/迁移数据，省掉大量升级事务。

**4. 为什么伪共享会让性能掉很多？**
答：两个核写同一缓存行的不同变量，MESI 只能以行为粒度失效，导致反复 S↔M 与总线失效，等于把两个无关变量串行化。解决办法是 padding 或按核分区。

## 九、演进与趋势

众核与 NUMA 下，纯总线嗅探扩展困难，目录协议（directory-based）与分布式嗅探（环、mesh、CHI）成为主流：每行记录共享者向量，点对点失效。ARM 的 ACE/CHI、Intel 的 ring/mesh 互连、AMD 的 Infinity Fabric 都是 MESI 家族的工程化变体。更上层，CXL.cache 把一致性扩展到加速器与内存扩展器；持久内存要求一致性与持久域边界清晰（A/D 域）。异构计算中 GPU/HBM 一致性、DPU 与主机的一致性、以及「一致性近缓存（coherent near-memory）」是活跃方向。软件侧，C++ 内存模型、RISC-V RVWMO、以及 Kernel 的内存序 API 让协议语义成为可移植抽象；调试工具（herd7、TSO tool）能模拟 MESI 事件序。教学与研究仍以 gem5、Sniper、zsim 中的 MESI 模型为标准材料。

## 十、小结

MESI 用 M/E/S/I 四态与总线嗅探事务，在缓存行粒度维护「独占可写、共享只读、失效作废」的不变量，解决多核写一致问题。E 态减少不必要失效，M 态承担脏独占；理解 S→M 升级、M 被读写回等关键转换，是分析并行性能与一致性 bug 的基础。
