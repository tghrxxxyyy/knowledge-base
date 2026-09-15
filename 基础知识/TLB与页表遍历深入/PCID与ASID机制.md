# PCID 与 ASID 机制

> 对应 Intel SDM Vol.3（Process-Context Identifiers / INVPCID）；ARM Architecture Reference Manual（AArch64 ASID）；Linux 内核内存管理文档。

## 一、背景与挑战

进程切换时若不清空 TLB，新进程就可能命中旧进程遗留的映射，导致数据错乱甚至越权读取。但若每次都全刷 TLB，切换后又必须重新做大量页表遍历，上下文切换成本与工作集大小直接挂钩。

观察是：被换出的进程很可能很快又被换回来（时间片轮转、多线程交互、I/O 唤醒）。如果能让多个地址空间的 TLB 项**同时在 TLB 里共存**，切换时就不必冲掉任何东西。这需要一个能区分地址空间的短标签——x86 称 PCID，ARM 称 ASID。

## 二、核心原理

TLB 表项在原有的虚拟页号标签之外，再增加一个地址空间标签。命中条件变为"虚拟页号匹配 **且** 标签等于当前标签"：

$$hit \iff VA_{page} = tag_{entry} \;\land\; label_{entry} = label_{cur}$$

- **x86-64**：CR4.PCIDE 置位后启用 PCID，CR3 低 12 位不再保留而用于承载 PCID，PML4 基址字段相应上移。提供 `INVPCID` 指令做精细失效，含四种类型：按地址（individual-address）、按单个 PCID（single-context）、全部含全局页（all-context including globals）、全部不含全局页。
- **AArch64**：ASID 位于 TTBR0_EL1/TTBR1_EL1 的高位字段，宽度由 TCR 配置为 8 位或 16 位；TLBI 指令族支持按 ASID 失效（如 `TLBI ASIDE1`、`TLBI VAE1IS`），描述符中的 nG 位标记"非全局"映射。

"全局页"（x86 的 PTE.G 位、ARM 的 nG=0）不受标签影响：内核公共映射、中断向量等在所有地址空间共享，切换时无需失效，进一步降低代价。

## 三、形式化与数学基础

设 TLB 总容量 $T$（项数）、当前驻留 $K$ 个地址空间，若它们均匀占用，则每个空间的有效容量约为：

$$T_{eff} \approx \frac{T}{K_{\text{active}}}$$

切换成本取决于目标标签是否已被换出：

$$Cost_{switch} = \begin{cases} \approx 0 & label_{new} \text{ 仍有条目驻留} \\ O(T) & \text{需要全刷}\end{cases}$$

整体收益可写成"免刷比例" $\alpha$ 的函数：平均切换开销由 $O(T)$ 降为 $(1-\alpha)O(T)$；而代价是每个空间的 TLB 命中率下降，命中率近似随 $K$ 的上升而下降。两者存在最优点：当活跃地址空间数远超 TLB 容量时，标签反而稀释了命中率，此时选择性失效（按 ASID/PCID 刷）优于盲目共存。标签空间有限（x86 为 12 位共约 4096 个），耗尽后必须回收并失效旧标签。

## 四、代码实现

```c
/* 切换地址空间：仅改 CR3 的 PCID 字段，不清 TLB（简化） */
static inline void switch_cr3_pcid(unsigned long pml4, unsigned short pcid) {
    unsigned long cr3 = (pml4 & ~0xFFFUL) | (pcid & 0xFFFUL);
    __asm__ __volatile__("mov %0, %%cr3" :: "r"(cr3) : "memory");
    /* 旧空间的 TLB 项因标签不同，自然不参与命中 */
}

/* 用 INVPCID 精确失效单个地址空间 */
static inline void invpcid_pcid(unsigned long pcid) {
    struct { unsigned long pcid, addr; } d = { pcid, 0 };
    __asm__ __volatile__("invpcid %0, %1"
                         :: "m"(d), "r"(1UL)   /* type 1: single-context */
                         : "memory");
}
```

注意：使用 `INVPCID` 前须确认 CPU 支持（CPUID 特性位），否则只能退化为"移动 CR3 + PCID 0"或全刷；内核通常通过替代（alternatives）/ 特性探针做运行时选择。

## 五、与其他技术对比

| 维度 | 无标签（全刷） | PCID/ASID 共存 | 仅软件选择性失效 |
| --- | --- | --- | --- |
| 切换开销 | 高（TLB 清空 + 预热） | 接近零 | 中（需遍历寻找条目）|
| TLB 有效容量 | 每空间独占 $T$ | 约 $T/K$ | 每空间独占 $T$ |
| 硬件要求 | 无 | 需标签与失效指令 | 无（但需可寻址 TLB 或按地址失效）|
| 标签耗尽处理 | 不适用 | 需回收 + 失效 | 不适用 |
| 典型实现 | 早期 x86、部分 RISC | x86 PCID、ARM ASID | MIPS 软件 TLB |

## 六、常见误区

1. **认为 PCID 数量无限**：12 位标签会耗尽，必须回收并失效对应条目，否则会命中错误的陈旧映射。
2. **把 ASID 等同于 PID**：ASID 是映射后的短标签，与 PID 没有固定对应关系，由内核按需分配与复用。
3. **忘记全局页的例外**：置了 G 位/nG=0 的映射不随标签失效，全刷语义与标签失效语义不同，`INVPCID` 因此区分"含/不含全局页"两种类型。
4. **认为启用 PCID 就一定更快**：活跃地址空间数远超 TLB 容量时命中率下降，收益可能被抵消。
5. **忽略 KPTI 的交互**：启用内核页表隔离后每个进程需要两套页表，标签分配策略必须同步调整。

## 七、与开源书·权威来源对应

- Intel《Software Developer's Manual》Vol.3 中 CR4.PCIDE、CR3 布局与 INVPCID 指令说明。
- ARM《Architecture Reference Manual for ARMv8-A》中 ASID 字段、TLBI 指令与 nG 位说明。
- Love《Linux Kernel Development》与内核 `Documentation/` 中关于 TLB 刷新、PCID 使用的说明。
- Bryant & O'Hallaron《CSAPP》第 9 章 TLB 与地址翻译基础。
- 标签位宽、指令编码与内核默认策略随硬件与版本变化，以官方最新文档为准。

## 八、面试题

1. **PCID 为什么能避免 TLB 全刷？** 要点：TLB 项带地址空间标签，只有标签与当前 CR3 中 PCID 相同才命中，旧项自然失效而不必清除。
2. **ASID 与 PCID 的差异？** 要点：语义相同（地址空间短标签），但载体不同——ASID 在页表基址寄存器字段中、由 TLBI 失效；PCID 在 CR3 中、由 INVPCID 失效。
3. **标签空间耗尽了怎么办？** 要点：回收旧标签（如按 LRU/世代分配），并对被复用的标签执行精确失效，避免陈旧命中。
4. **全局页与标签的关系？** 要点：全局映射不参与标签，切换地址空间时保持有效，因此失效指令需区分是否影响全局页。
5. **什么时候 PCID 收益下降？** 要点：活跃地址空间数远大于 TLB 容量时，每空间有效容量被稀释，命中率下降抵消切换收益。

## 九、演进与趋势

硬件侧，失效粒度持续细化（按地址、按标签、按 VM 标签），虚拟化引入 VPID 与 EPT/NPT 标签，让 Guest 与 Host 的 TLB 项并存；ARM 从 8 位 ASID 扩展到 16 位。软件侧，KPTI 之后标签使用更加精细，Linux 通过特性探针与替代代码在运行时选择最优失效路径，并借助批处理（batching）减少 IPI 次数。

## 十、小结

PCID/ASID 用小标签把"地址空间身份"编码进 TLB，使频繁上下文切换几乎不再付出 TLB 清空代价。它的代价是标签空间有限与有效容量被稀释，因此"何时共存、何时选择性失效"始终是需要按负载调优的工程决策。
