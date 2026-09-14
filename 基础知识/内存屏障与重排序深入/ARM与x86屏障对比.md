# ARM与x86屏障对比

> 对应 ARMv8 架构参考手册 DMB/DSB 章节；Intel SDM 卷3「Memory Ordering」。

## 一、背景与挑战

同一段并发代码在 x86 上正确、在 ARM 上失效，是最常见的跨平台移植 bug。根因是两架构内存模型与屏障语义差异巨大：x86 是强序 TSO，ARM 是弱序。源码若直接依赖 x86「碰巧正确」的行为，移植到 ARM 会暴露真实重排错误。理解差异才能写出可移植并发。典型案例：Linux 内核早期在 ARM 多核上出现的「自旋锁解锁后读」错乱，正是缺失 DMB 所致，后来统一用 `smp_mb()` 抽象屏蔽差异。

难度还来自三个方面：其一，错误是「必现但偶发可见」——重排本身确定发生，只是多核交叉执行时才被观测到，单核回归测试极难捕获；其二，屏障是「欠约束则错、过约束则慢」的连续谱，没有唯一正确答案；其三，两架构原子指令隐含的顺序语义不同，x86 的 `lock` 前缀自带全屏障，ARM 的 `ldxr/stxr` 却不隐含任何跨变量顺序，照抄 x86 心智模型必然出错。

## 二、核心原理

x86-TSO 仅放松 store→load，因此多数同步「碰巧」正确，典型只需 SFENCE/MFENCE 或在原子指令隐含的强序。ARMv8 为弱模型，读读、写写、读写、写读只要无依赖均可重排，需 DMB（Data Memory Barrier，按方向/共享域）或 DSB（Data Synchronization Barrier）显式约束。ARM 的 DMB 还分 inner-shareable（ISH，核间）与 outer-shareable（OSH，含设备等）域，以及 load/store/any 方向，细粒度但易错。DSB 比 DMB 更重：它等所有未决访存完成才让后续指令执行，常用于切换页表/MMIO。

三者语义差别可用一句话概括：

- `DMB`：只做「顺序约束」，不等待任何访存完成，后续指令可继续发射，代价最低。
- `DSB`：既做顺序约束又「等完成」，适合「写完页表必须确认生效再执行后续指令」。
- `ISB`：冲刷并重取流水线（指令流同步），与数据序无关，常用于改写系统寄存器（如 SCTLR）之后。

方向后缀进一步细分：`st` 只约束 store 之间顺序，`ld` 只约束 load 之间顺序，无后缀为全方向。合理使用方向后缀可显著降低屏障代价，但选错方向等同于没插屏障。

## 三、形式化与数学基础

x86 允许重排集合 $R_{x86}=\{\text{store}\to\text{load}\}$。ARM 允许 $R_{ARM}\supset R_{x86}$（含 load→load、store→store、load→store 等），除非被屏障分隔。故 ARM 需更多屏障实例来重建同等顺序。可写：对被放松的每对序 $a\prec_{po}b$，若需保留，则插入屏障使 $a\ \text{before}\ b$ 在全局可见。直观上 ARM 需要「在每对被放松的序之间都插一道墙」，x86 只需在少数地方。

更形式化地，可把每个架构定义为「保留序」集合 $\prec_{model}$：合法执行必须满足 $\prec_{model}\ \subseteq\ \prec_{hb}$，其中未列入 $\prec_{model}$ 的程序序边允许被重排。x86 的 $\prec_{model}$ 包含除 store→load 外的所有程序序边；ARM 的 $\prec_{model}$ 仅包含由数据依赖、地址依赖、控制依赖与屏障强制的边。因此「移植到 ARM」的成本可精确量化为「需要补回多少条 $\prec_{po}\setminus\prec_{ARM}$ 中的边」。

## 四、代码实现

```asm
; x86 发布（TSO 下 mov 本身有较强序，release 由原子隐含）
    mov [data], rax
    mov [flag], 1          ; 一般 release 由原子指令隐含，必要时 sfence
; ARM 发布（弱序，必须显式 DMB）
    str x0, [data]
    dmb ish                ; 内部共享域全屏障，保证 str data 先于 str flag 可见
    str x1, [flag]
```

注意：ARM 上若漏 `dmb ish`，其他核可能看到 `flag==1` 却读到 `data` 旧值。x86 上同样的 `mov` 序列因 TSO 天然保序，无需额外指令。

对等的 acquire 侧写法如下（消费者读 flag 后必须再插一道屏障，否则数据读可能先于标志读对外可见）：

```asm
    ldr x1, [flag]         ; 读标志
    dmb ish                ; 保证后续 ldr data 不早于 ldr flag 可见
    ldr x0, [data]
```

等价的语言级写法是 `store(release)` 与 `load(acquire)` 配对：编译器在 ARM 上为 release 生成 `dmb ish`（或 `stlr`），在 x86 上仅用普通 `mov` 即可，这正是「一份源码、两套屏障」的价值。

## 五、与其他技术对比

| 架构 | 默认重排 | 屏障指令 | 语义粒度 | 易错点 |
| --- | --- | --- | --- | --- |
| x86 | 仅 store→load | SFENCE/LFENCE/MFENCE | 粗 | 误以为全序 |
| ARM | 几乎全可重排 | DMB（域+方向）/DSB/ISB | 细 | 漏 DMB 致真实错乱 |
| RISC-V | 弱（RVWMO） | fence（pred/succ 位掩码） | 细（位掩码） | 掩码写错等于无屏障 |
| POWER | 弱（更弱） | hwsync/lwsync/isync | 细 | 别名混淆 |

x86 屏障少且接近 SC；ARM 屏障灵活但需精确选择域与方向，否则要么不充分（bug）要么过度（性能差）。RISC-V 的 `fence rw,rw` 与 ARM 的 `dmb ish` 作用近似，但以前置集/后置集位掩码表达，语义更正交；POWER 的 `lwsync` 则是「除 store→load 外全序」的轻量屏障。

## 六、常见误区

1. 误把 x86「少屏障」经验套到 ARM——ARM 上缺失 DMB 会导致真实重排错误，而非理论风险。
2. 误用 DSB 代替 DMB——DSB 等所有访存完成才继续，过重且常用于系统级而非普通同步。
3. 误以为 ISB 管数据序——ISB 只冲刷流水线（指令流），不约束数据访存的顺序。
4. 误以为 `dmb ish` 与 `dmb osh` 等价——前者只保核间（inner shareable），设备/外设域需用 osh 或 sy。
5. 误以为屏障有「刷新缓存」作用——屏障只约束顺序，缓存一致性由硬件协议（MESI 等）保证，二者职责不同。
6. 误以为 `dmb ishst` 可替代全屏障——写写屏障不约束读顺序，含读的同步协议仍需全屏障。

## 七、与开源书·权威来源对应

- ARMv8 架构参考手册 Barrier 章节定义 DMB/DSB/ISB 及 ISH/OSH 域。
- Intel SDM 卷3「Memory Ordering」列出 x86 保证与放松项。
- RISC-V 的 RVWMO 也属弱模型，与 ARM 思路相近，DMB 对应 fence 指令。
- Linux 内核 `Documentation/memory-barriers.txt` 用「谁在等谁」的通俗模型解释各架构屏障配对规则。

## 八、面试题

1. 为何 x86 程序移植 ARM 常要加屏障？答：x86 默认仅 store→load 重排，ARM 允许更多重排，需显式 DMB 重建顺序。
2. DMB ISH 与 DSB 区别？答：DMB 只约束后续访存顺序、不阻塞执行；DSB 等所有未决访存完成才继续，更重。
3. ARM 上漏屏障为何「真实出错」而非偶发？答：弱模型下重排是常态，多核一定会出现可见性错乱，必现而非偶发。
4. ISH 与 OSH 区别？答：ISH 覆盖核间共享域，OSH 还覆盖外设等外部共享域；选错域会漏保设备可见性。
5. 为何 x86 的 `lock` 前缀可省去显式屏障？答：`lock` 隐含全屏障语义，同时禁止编译器与 CPU 重排，故 CAS 之后无需再加 MFENCE。
6. 写写屏障（`dmb ishst`）能否保证「数据先于标志」？答：能保证两个 store 之间的顺序，但不约束读；若同步协议还含读，需全屏障。

## 九、演进与趋势

借助 C++ 原子内存序（memory_order），源码层统一写一次，屏障由编译器按目标架构插入（x86 多半为空、ARM 插 DMB），大幅降低移植负担。RISC-V 同样走「源码写序、工具链插屏障」路线。内核侧用 `smp_mb()`/`smp_wmb()` 等抽象进一步屏蔽差异。

硬件侧亦有演进：ARMv8 的 `LDAR`/`STLR` 把 acquire/release 语义直接编入单条访存，比「普通访存 + DMB」更省；ARMv8.1 LSE 提供原子 RMW 指令族进一步降低屏障需求。值得强调的是，「屏障复杂度」正被语言与工具链逐步吸收，手写屏障在应用层应被 `std::atomic` 取代，只在内核、运行时与驱动中仍是必需品。

## 十、小结

x86 的「宽松但接近 SC」与 ARM 的「彻底弱序」是并发移植陷阱的根源。把同步意图表达为语言级内存序（而非手写屏障）是跨平台正解。实践中若必须手写，应遵循两条纪律：其一，先明确「需要保留哪条程序序边」，再按架构语义选最小充分屏障；其二，任何「发布数据再置标志」的结构都要在两侧成对插入 release/acquire 语义的屏障，缺一侧即等于无同步。
