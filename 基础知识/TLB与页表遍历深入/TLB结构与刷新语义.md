# TLB 结构与刷新语义

> 对应 Tanenbaum & Bos《Modern Operating Systems》内存管理章；Bryant & O'Hallaron《CSAPP》9.6 节；Intel SDM Vol.3 TLB 与失效指令说明。

## 一、背景与挑战

若每次访存都要走 4 级页表，等于把 1 次访存放大成 5 次，性能不可接受。TLB（Translation Lookaside Buffer）缓存近期用过的 VA→PA 映射与权限位，命中即零额外访存。

但 TLB 有一个致命的结构性特征：**它是唯一不被硬件一致性协议覆盖的缓存**。数据缓存有 MESI 之类的协议保持多核一致，TLB 没有——一个核改了页表，其他核的 TLB 可能仍缓存旧映射。刷新语义因此成为虚拟内存正确性最易出错的地方：漏刷是偶发、难复现的越权或数据错乱。

## 二、核心原理

TLB 通常分两级：L1 分指令/数据两个小的全相联表（命中延迟极低），L2 为统一的大容量组相联表（约数千项），未命中时由硬件页表遍历器（含遍历缓存）填补。

表项内容通常包括：虚拟页号标签、物理页框号、地址空间标签（PCID/ASID，见相关章节）、权限位（读/写/执行、用户/内核）、以及脏位与访问位的缓存副本。

失效手段分层次：

- **按地址**：x86 的 `INVLPG addr`，只失效本核中该页的项；
- **全刷**：写 CR3（或 CR4.PGE 变化）清空非全局项，但全局页（PTE.G 置位）保留；
- **按标签**：`INVPCID` 精确失效某个 PCID 的项；
- **跨核**：TLB 无一致性，必须通过 IPI（核间中断）通知其他核执行上述失效，即 **TLB shootdown**。

## 三、形式化与数学基础

含 TLB 与遍历的平均访存时间：

$$AMAT_{VA} = t_{hit} + (1 - h_{TLB})\Big(t_{L2} + (1-h_{L2})\,t_{walk}\Big)$$

若遍历失败触发缺页，则再叠加 $t_{fault}$，其量级远超前述各项。

shootdown 的代价可以用参与核数刻画：设需通知 $c$ 个核，每次 IPI 的往返与处理开销为 $\tau$，则一次失效的总代价近似

$$T_{flush} \approx c \cdot \tau + T_{local}$$

因此内核尽量避免逐页 shootdown：把多次失效**批处理**（batch）后一次 IPI 完成，或用范围失效（range flush）替代逐页失效；当范围较大时直接全刷反而更快。批量策略的最优阈值满足"逐页失效成本 = 一次全刷成本"：

$$n^{*} \approx \frac{c \cdot \tau + T_{flushAll}}{T_{invlpg}}$$

## 四、代码实现

```c
/* 单页失效：本核立即执行，跨核需 IPI 广播（简化） */
static inline void local_flush_tlb_page(unsigned long va) {
    __asm__ __volatile__("invlpg (%0)" :: "r"(va) : "memory");
}

/* 惰性批量失效：累积到页表批处理结束再一次做完 */
static void flush_tlb_batched(struct mm_struct *mm,
                              unsigned long start, unsigned long end) {
    if (end - start > PAGE_SIZE * BATCH_LIMIT) {
        flush_tlb_mm(mm);            /* 范围过大：全刷更划算 */
    } else if (cpumask_empty(mm_cpumask(mm))) {
        local_flush_tlb_range(start, end);
    } else {
        /* 远程核：构造失效描述符，一次 IPI 让所有核处理 */
        smp_call_remote_flush(mm, start, end);
    }
}
```

注意失效顺序：**先改页表，再失效 TLB**。若顺序颠倒，中途可能被其他核看到"旧映射 + 新页表"的不一致组合。

## 五、与其他技术对比

| 维度 | 硬件管理 TLB（x86） | 软件管理 TLB（MIPS/早期 SPARC） | 带标签 TLB（PCID/ASID） |
| --- | --- | --- | --- |
| 谁填 TLB | 硬件遍历器 | OS 异常处理程序 | 硬件遍历器 |
| 失效粒度 | 按地址/标签/全刷 | 通常整表或按项遍历 | 按标签精确失效 |
| 切换成本 | 需全刷（或靠标签） | 需重新填装 | 接近零 |
| 一致性维护 | 软件 IPI shootdown | 软件 IPI shootdown | 软件 IPI shootdown |
| 灵活性 | 低 | 高（可自定义结构） | 中 |

## 六、常见误区

1. **以为改了页表 TLB 就自动失效**：必须显式失效，且多核下需要 IPI 通知其他核。
2. **以为只读数据不涉及权限**：TLB 项缓存权限位，改权限（如只读转可写、NX 变更）同样需要失效。
3. **忽略全局页**：置 G 位的映射不受 CR3 写操作影响，漏刷会长期持有旧映射。
4. **忘记指令 TLB 与代码一致性**：自我修改代码后需要同步指令缓存；x86 保证一致性，AArch64 等需显式维护（如 `IC IVAU` + `ISB`）。
5. **认为 shootdown 免费**：大核数机器上频繁逐页 shootdown 可占显著 CPU，是内核热点之一。

## 七、与开源书·权威来源对应

- Bryant & O'Hallaron《CSAPP》9.6 节 TLB 与地址翻译实例。
- Tanenbaum & Bos《Modern Operating Systems》内存管理与 TLB 章节。
- Arpaci-Dusseau《Operating Systems: Three Easy Pieces》TLB 章节（含 shootdown 讨论）。
- Intel SDM Vol.3 中 INVLPG、INVPCID、CR3/CR4.PGE 与 TLB 相关小节；ARM ARM 中 TLBI 指令族与 `ISB`/缓存维护说明。
- Love《Linux Kernel Development》与 Bovet & Cesati《Understanding the Linux Kernel》中 TLB 刷新与 SMP 同步相关章节。
- 具体项数与指令细节随微架构变化，以厂商最新文档为准。

## 八、面试题

1. **为什么多核下修改页表必须 TLB shootdown？** 要点：TLB 不受硬件一致性协议覆盖，其他核可能仍缓存旧映射，必须用 IPI 通知其失效。
2. **INVLPG 与写 CR3 的区别？** 要点：前者只失效本地指定页，开销小；后者清空本地非全局项，影响面大。
3. **为什么内核要批量失效？** 要点：逐页 IPI 开销高，累积后用一次范围失效或全刷可显著降低总代价。
4. **全局页为什么在切换进程时不用刷？** 要点：G 位标记的内核公共映射在所有地址空间共享且内容一致，无需随 CR3 变化失效。
5. **改页表与失效 TLB 的顺序为什么重要？** 要点：必须先写页表再失效；否则其他核可能短暂看到新页表配合旧 TLB 项的混乱状态。
6. **自我修改代码需要做什么？** 要点：写代码段后需保证指令侧可见性——x86 硬件保证，AArch64 需显式缓存维护与屏障。

## 九、演进与趋势

标签化（PCID/ASID）与虚拟化标签（VPID、EPT/NPT 相关 TLB）已成标配；内核侧持续优化 shootdown 的批处理与掩码维护（如按 mm 记录持有该地址空间 TLB 项的 CPU 集合，减少无效 IPI）。硬件侧出现更细粒度的失效原语与范围失效扩展，以降低逐页失效成本。安全侧，KPTI 等缓解措施让页表切换与 TLB 语义更加复杂，也推动了"按标签失效 + 用户/内核页表分离"的组合优化。

## 十、小结

TLB 是虚拟内存性能的关键，也是正确性最难的部分：它没有硬件一致性，所有陈旧映射都必须靠软件显式失效，跨核还要 IPI 广播。掌握"按地址/按标签/全刷 + 批量与顺序约束"这四件事，就掌握了 TLB 刷新语义的全部要点。
