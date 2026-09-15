# Tomasulo算法与动态调度

> 对应 Tomasulo 1967 "An Efficient Algorithm for Exploiting Multiple Arithmetic Units"（IBM Journal of R&D）/ Hennessy & Patterson《Computer Architecture》动态调度章节 / Hwu & Patt 1987 "Checkpoint Repair for Out-of-Order Execution Machines"。

## 一、背景与挑战

1960 年代 IBM 360/91 的浮点单元面对一个尖锐问题：浮点除法与内存缺失的延迟长达数十拍，按序发射时后面所有指令都必须等待，即使它们与之毫无关系。更要紧的是**编译器无法解决它**——缓存是否命中、存储地址何时解析，都是运行期信息。

Tomasulo 算法的目标是让硬件以「数据流」方式调度：一条指令只要源操作数就绪就能执行，与前后指令是否在等长延迟无关。这要求同时解决两件事：消除名字相关（WAR/WAW），以及在结果产生的那一刻把值送到所有等待者手上。

## 二、核心原理

Tomasulo 用三件套实现「按名取操作数」：

1. **保留站（RS）**：每个功能单元前挂一组。发射时分配一项，把源操作数解析为「值或标签」——若该源寄存器的当前生产者尚未写回，就存生产者标签（$Q_j$/$Q_k$）；否则存值（$V_j$/$V_k$）。
2. **公共数据总线（CDB）**：功能单元算完把 `(标签, 值)` 广播给所有 RS 与寄存器堆，等待该标签的项捕获值并置就绪。
3. **寄存器状态表**：记录「哪个标签将写这个寄存器」，发射时据此决定取标签还是取值，同时约束寄存器堆的写只在标签仍为最新时生效。

标签机制天然消除 WAR 与 WAW：产生 WAR 的读在发射时就把当前映射固定下来，后来的写持有新标签，不会影响它；两个产生 WAW 的写各持不同标签，只有最后发射者的标签会更新寄存器状态表。Tomasulo 因此允许**乱序完成**——任何 RS 结果就绪即可广播。

乱序完成留下两个必须外部补足的问题：**精确异常**（中间指令异常时已广播的结果无法撤回）与**推测执行回滚**（误预测路径已写入寄存器堆）。原始设计靠「异常时排空流水线并重放」近似，代价高。现代解法是在其上叠加**重排序缓冲（ROB）**：结果先写入 ROB 或物理寄存器，只有按序提交时才更新架构状态。

## 三、形式化与数学基础

每个 RS 项的状态可记为 $s = (busy,\ op,\ Q_j,\ V_j,\ Q_k,\ V_k,\ tag)$，其中 $Q_j = \bot$ 表示 $V_j$ 有效。发射时的解析规则是

$$
(Q_j, V_j) = \begin{cases}
(\text{RST}[r_j],\ \bot), & \text{RST}[r_j] \neq \bot \quad(\text{生产者未写回}) \\
(\bot,\ \text{Reg}[r_j]), & \text{否则}
\end{cases}
$$

广播时的捕获规则为：凡 $Q_j = tag$ 的项执行 $(V_j \leftarrow val,\ Q_j \leftarrow \bot)$，$Q_k$ 同理。寄存器堆的写受结果状态表约束，仅当 `RegStat[r] == tag` 时写，从而保证 WAW 语义。

乱序完成对精确异常的威胁可形式化如下。设指令按程序序为 $i_1, i_2, \dots$，若 $i_3$ 异常而 $i_4, i_5$ 已完成并广播，则状态已混入 $i_4, i_5$ 的效果，而架构只允许反映 $i_1, i_2$。引入按序推进的提交边界 $T$ 即可修复：

$$
\text{ArchState} = \bigcup_{i \le T} \text{effects}(i)
$$

ROB 维护 $T$ 单调前进，异常或误预测时丢弃所有 $i > T$ 的效果。这解释了现代实现的复杂度重心在 ROB 与恢复逻辑，而非保留站本身。

## 四、代码实现

```c
/* Tomasulo 核心：按名解析发射 + CDB 广播前递 */
#include <stdint.h>
#define N_RS   32
#define NO_TAG (-1)

typedef struct {
    uint8_t busy, op;
    int16_t qj, qk;              /* 源标签；NO_TAG 表示 vj/vk 有效 */
    int64_t vj, vk;
    int16_t tag;
} rs_t;

static rs_t    rs[N_RS];
static int16_t regstat[32];       /* 寄存器 -> 将写它的标签 */
static int64_t regfile[32];
static int16_t next_tag;

int issue(uint8_t op, int rs1, int rs2, int rd) {
    int s = -1;
    for (int i = 0; i < N_RS; i++) if (!rs[i].busy) { s = i; break; }
    if (s < 0) return -1;                          /* 保留站耗尽：发射停顿 */
    rs[s].busy = 1;  rs[s].op = op;
    rs[s].qj = regstat[rs1];  rs[s].vj = regfile[rs1];
    rs[s].qk = regstat[rs2];  rs[s].vk = regfile[rs2];
    rs[s].tag = next_tag++;
    regstat[rd] = rs[s].tag;                        /* 新映射：WAR/WAW 消除 */
    return s;
}

void broadcast(int16_t tag, int64_t val, int rd) {
    for (int i = 0; i < N_RS; i++) {
        if (!rs[i].busy) continue;
        if (rs[i].qj == tag) { rs[i].vj = val; rs[i].qj = NO_TAG; }
        if (rs[i].qk == tag) { rs[i].vk = val; rs[i].qk = NO_TAG; }
    }
    if (rd >= 0 && regstat[rd] == tag) {            /* 只有最新标签能写寄存器 */
        regfile[rd] = val;  regstat[rd] = NO_TAG;
    }
}
```

工程要点：CDB 条数决定每周期能广播多少结果，是乱序核心的关键带宽参数；寄存器堆的写必须与结果状态表比对；要支持精确异常与推测执行，须让 `broadcast` 只写 ROB 或物理寄存器，由提交阶段写入架构状态。

## 五、与其他技术对比

| 方案 | 消除 WAR | 消除 WAW | 精确异常 | 乱序完成 | 主要代价 |
| --- | --- | --- | --- | --- | --- |
| 按序发射 | 否 | 否 | 天然 | 否 | 长延迟无法隐藏 |
| 记分牌 | 靠等待 | 否 | 天然 | 是 | WAW 停顿，无前递 |
| Tomasulo（原始） | 是 | 是 | 否（排空重放） | 是 | 无法回滚，异常代价高 |
| Tomasulo + ROB | 是 | 是 | 是 | 是 | ROB 面积与恢复逻辑 |
| Tomasulo + PRF + 重命名 | 是 | 是 | 是 | 是 | 重命名与空闲池管理 |

## 六、常见误区

- 「Tomasulo 保证按序提交」：它只保证数据流正确，提交顺序需 ROB 提供，原始设计甚至不具备精确异常。
- 「重命名与 Tomasulo 是互斥方案」：现代核心是「标签机制 + 物理寄存器重命名 + ROB」的融合体，标签即物理寄存器号。
- 「CDB 越多越快」：条数增加带来仲裁、广播扇出与功耗代价，需与发射宽度匹配。
- 「有前递就不需要读寄存器堆」：前递只覆盖「生产者仍在流水线中」的窗口，寄存器堆读取仍是常态路径；保留站或物理寄存器耗尽都会导致发射停顿。

## 七、与开源书·权威来源对应

1. Tomasulo, *An Efficient Algorithm for Exploiting Multiple Arithmetic Units*, IBM Journal of R&D, 1967：保留站、CDB 与寄存器状态表的原始设计。
2. Hennessy & Patterson《Computer Architecture: A Quantitative Approach》：以 IBM 360/91 讲解 Tomasulo 并给出与记分牌的对比。
3. Hwu & Patt, *Checkpoint Repair for Out-of-Order Execution Machines*, ISCA 1987：检查点修复与精确异常。
4. Smith & Pleszkun, *Implementing Precise Interrupts in Pipelined Processors*：重排序缓冲的系统分析。
5. Intel 优化手册与 AMD 软件优化指南中乱序调度与调度停顿的性能事件：以官方最新文档为准。

## 八、面试题

1. **CDB 的作用？** 要点：广播 `(标签, 值)`，让所有等待该结果的保留站同时捕获，实现按名前递，替代按序写回。
2. **Tomasulo 如何消除 WAW？** 要点：两个写各持不同标签，寄存器状态表只记录最后发射者，只有它能写回寄存器。
3. **与记分牌的关键差异？** 要点：记分牌无重命名，WAR/WAW 靠等待解决且无前递；Tomasulo 用标签消除伪相关并通过 CDB 前递。
4. **为什么需要 ROB？** 要点：乱序完成破坏按序提交与精确异常，ROB 提供程序序边界，使架构状态只在提交时更新。
5. **保留站耗尽会怎样？** 要点：发射停顿，新指令无法进入调度，窗口利用率下降，长延迟不再被隐藏。

## 九、演进与趋势

现代乱序核心仍是「Tomasulo + 重命名 + ROB」的框架，但部件在工程上分化：保留站与物理寄存器堆融合（RS 存标签、值放 PRF），CDB 被多端口总线或交换网络取代。趋势是做大调度窗口同时保主频，因此出现分布式调度、流水化唤醒与推测唤醒撤销。另一条线是用 PGO 与编译器调度先降低乱序压力；安全方向上，投机状态的彻底回滚已成硬性要求。

## 十、小结

Tomasulo 的精髓是**用标签把「值」变成「谁的输出」**，从而让 WAR/WAW 自然消失，并让结果在产生瞬间被所有等待者捕获。它解决了乱序执行的核心难题，却把「提交顺序与精确异常」留给了 ROB；现代处理器正是两者的组合体。
