# 陷入返回与Trap帧

> 对应 Bryant & O'Hallaron《CSAPP》第 8 章 Exceptional Control Flow 与 Bovet & Cesati《Understanding the Linux Kernel》第 4 章 Exception Handling；并参考 Intel《SDM》Volume 3 第 6.14 节「Method of Returning from Interrupts and Exceptions」与内核文档 `Documentation/x86/entry_64.rst`。

## 一、背景与挑战

陷入内核时，内核必须保存足够的「陷阱帧（trap frame / `pt_regs`）」以便在处理完后精确恢复用户执行。

帧内容、保存顺序与返回指令（`sysret`/`iret`）决定能否无痕返回：少保存一个寄存器、错一字节偏移，都会在返回后让用户态看到损坏的状态甚至被利用构造提权。

返回路径还要处理信号投递、重调度、KPTI 页表切换等「返回前工作」，这些都在恢复寄存器之前完成，否则会丢失待处理事件。

任何返回路径的疏漏都是高危提权面（如 CVE 历史上 `sysret` 误用导致绕过 SMAP/SMEP）。

## 二、核心原理

陷入瞬间硬件压入返回地址 `rip`、代码段 `cs`、`rflags`、栈指针 `rsp`、栈段 `ss`（视门类型与特权级变化而定）。

内核桩再 `SAVE_ALL` 把通用寄存器压入内核栈，形成 `struct pt_regs`。

处理完成后，内核从 `pt_regs` 恢复通用寄存器，用 `sysret`（快但约束多：要求返回 CPL=3、RIP 经 `rcx`、RFLAGS 经 `r11`）或 `iretq`（通用但慢：从栈弹出 `rip/cs/rflags/rsp/ss`）返回用户。

返回不是简单 `ret`——它跨特权级、恢复段寄存器与标志位，对用户态必须是原子且不可观测中间态。

返回前 `prepare_exit_to_usermode` 检查 `TIF_*` 标志，先处理信号/重调度/页表切换。

注意进入时 `rcx`/`r11` 已被硬件覆盖，故进入路径必须先把它们存入 `pt_regs`。

## 三、形式化与数学基础

trap frame 必须可精确重放：

$$\forall r \in Regs,\ after\_return(r) = before\_enter(r)$$

`sysret` 的约束：

$$RCX \leftarrow RIP,\ R11 \leftarrow RFLAGS,\ CPL: 3 \rightarrow 3$$

`iret` 通用但慢，恢复 $rip,cs,rflags,rsp,ss$ 并据目标 CPL 决定是否换栈。

返回原子性保证用户无法观测到「已切回用户态但未恢复完标志」的中间窗口。

若约束不满足（如返回特权级变化），必须用 `iret`。

## 四、代码实现

```asm
# 返回用户态：从 pt_regs 恢复并由 iretq 弹出硬件帧
RESTORE_ALL                 # 恢复通用寄存器
mov    pt_regs_rsp(%rsp), %rsp_user
# 恢复 GP regs ...
# 此处 rsp 指向硬件压入的 [ss][rsp][rflags][cs][rip]
iretq                       # 弹出 rip, cs, rflags, rsp, ss
# 仅当满足快速返回条件（CPL=3、无栈切换）可用 sysretq：
#   mov rcx, rip; mov r11, rflags; sysretq
```

`prepare_exit_to_usermode` 在恢复前检查 `TIF_SIGPENDING`/`TIF_NEED_RESCHED`/`TIF_KPTI` 等标志，先处理信号或重调度，必要时切回内核页表。

若返回到用户态但需单步（`TF` 标志），还需经 `resume_user_mode` 路径。

## 五、与其他技术对比

| 返回方式 | 速度 | 适用 | 约束 |
| --- | --- | --- | --- |
| `sysret` | 快 | syscall 返回 | CPL=3、无特权级/栈切换 |
| `iret` | 慢 | 中断/异常/远返回 | 通用，可跨特权级 |
| `ret` | 最快 | 函数返回 | 不跨特权级、不恢复段 |

`sysret` 快但仅用于 syscall 返回；`iret` 通用覆盖中断/异常/FAR 返回；相较 `ret`，trap 返回跨特权级并恢复段寄存器与标志。

NMI 返回还用 `iret` 配合 NMI 栈特殊处理，避免重入。

## 六、常见误区

1. 误以为返回只恢复 RIP：还需 `rflags`、段寄存器、用户栈指针，缺一不可。
2. 误以为 `sysret` 与 `iret` 等价：二者约束与恢复语义不同，错用会留下提权窗口。
3. 误以为返回可被用户拦截：硬件强制原子，用户态无法在中间插入代码。
4. 误以为 KPTI 不影响返回：返回前须把 `CR3` 切回用户页表，否则用户态访问内核地址崩溃。
5. 误以为信号处理在 C 处理函数中完成：实际在返回用户态前的 `do_signal` 路径注入。
6. 误以为 `rcx`/`r11` 进入后仍有用户值：硬件在 `syscall` 时已覆盖，必须已从 `pt_regs` 取回。

## 七、与开源书·权威来源对应

- CSAPP 8.1 描述异常返回必须恢复完整硬件上下文。
- Bovet & Cesati 第 4 章讲 `pt_regs` 布局、`SAVE_ALL`/`RESTORE_ALL` 与 `iret` 语义。
- Intel SDM Vol.3 §6.14 给出 `sysret`/`iret` 的逐字段恢复规则与特权级检查细节。
- 内核 `entry_64.rst` 描述 `entry_SYSCALL_64` 与返回路径中 `SWAPGS` 的配对要求。

## 八、面试题

1. 为什么需要保存完整寄存器现场？要点：处理后必须精确恢复用户执行流，任何遗漏都会在返回后产生错乱。
2. `sysret` 与 `iret` 如何取舍？要点：syscall 快速路径用 `sysret`（快但约束强），中断/异常/远返回用 `iret`（通用）。
3. 返回前内核还会做什么？要点：处理信号、`need_resched` 调度、KPTI 页表切换等返回前工作。
4. 为什么 `sysret` 要求 RCX/R11 承载 RIP/RFLAGS？要点：硬件用固定寄存器传参以省去栈操作，故进入时这些值已被覆盖需保存。

## 九、演进与趋势

- KPTI 下返回需额外写 `CR3` 切换用户/内核页表，增加开销。
- 安全缓解要求返回路径校验更多状态（如 Speculative 屏障、CR pinning 防止 GS 基址被篡改）。
- FRED 用统一返回指令简化 `pt_regs` 恢复，减少 `entry/exit` 代码分支，降低侧信道攻击面。

## 十、小结

trap 帧是陷入/返回的「快照」，保证内核处理对用户态透明且原子恢复。

`sysret` 与 `iret` 在速度与通用性之间各有定位，返回前的内核工作则把信号、调度与隔离收尾，整条路径是特权级边界正确性的关键，任何偏差都可能演变为提权漏洞。
