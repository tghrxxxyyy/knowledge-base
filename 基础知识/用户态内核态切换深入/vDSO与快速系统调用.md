# vDSO与快速系统调用

> 对应 Kerrisk《The Linux Programming Interface》第 3 章 Time 与 Bovet & Cesati《Understanding the Linux Kernel》第 10 章 System Calls；并参考内核文档 `Documentation/vDSO/abi.rst` 与 Drepper《What Every Programmer Should Know About Memory》关于 `rdtsc` 的章节。

## 一、背景与挑战

`gettimeofday`、`clock_gettime(CLOCK_MONOTONIC)` 这类调用只读取内核维护的只读时钟数据（xtime、jiffies、时钟源偏移），本身无副作用、不修改任何内核状态，却被极频繁地调用（每秒可达数百万次）。

若每次都走完整 `syscall` 陷入内核，仅寄存器保存/恢复与返回路径的固定成本就足以淹没「读几个字」的实际工作。

vDSO（virtual dynamic shared object）正是为这类「安全且只读」的逻辑而生：把它映射到每个进程的用户地址空间，让 glibc 直接在用户态完成，从而消除陷入。

vsyscall 是更早期、地址固定的同类机制，因固定可执行映射易被 ROP 利用而被废弃。

vDSO 的代价是内核需维护一份用户态可见的只读数据并解决并发一致性。

## 二、核心原理

内核在建立进程地址空间时，把一段特殊 ELF（vDSO）映射到用户态高地址（随机化位置），其中含时钟读取等函数与一份只读的 `vdso_data` 结构。

该结构由内核在 `update_vsyscall` 中更新，承载当前时钟源、基地址、序列号与墙上时间/单调时间。

用户态函数用 seqlock 读它：先读序号，再读时钟字段，再读序号确认未被内核并发更新，避免读到撕裂值。

需要绝对时间的调用经 `vread_pvclock`/`vread_tsc` 用 `rdtsc` 配合 `vdso_data` 中的倍率/偏移换算成纳秒，全程零陷入。

vDSO 同时导出 `getcpu`、`rt_sigreturn` 等便于用户态的快速路径，并随 `AT_SYSINFO_EHDR` 辅助向量暴露给用户程序。

## 三、形式化与数学基础

vDSO 时钟读取可建模为 seqlock 读：

$$read = retry\{ s = load(seq);\ t = base + (rdtsc() - tsc\_base)\cdot mult/shift;\ \} until\ s\ even\ \land\ seq\ unchanged$$

成本 $\approx$ 几条指令加一次 `rdtsc`，远低于 `syscall` 的几十纳秒。

仅当数据可被安全暴露给用户（只读、无特权状态变更）才放入 vDSO；写类系统调用无法通过此路径加速。

时间命名空间下还需按 `timens` 偏移再平移：$t_{wall} = t_{mono} + tod\_offset + timedns\_offset$。

## 四、代码实现

```c
// glibc 内部 __vdso_clock_gettime 简化逻辑
static int vdso_clock_gettime(clockid_t clk, struct timespec *ts) {
    struct vdso_data *v = __arch_get_vdso_data();
    u32 seq;
    do {
        seq = READ_ONCE(v->seq) & ~1u;          // 取偶数 seq
        barrier();                              // 编译器屏障
        u64 ns = v->monotonic_time_ns +
                 (rdtsc() - v->tsc_base) * v->mult / v->shift;
        ts->tv_sec = ns / 1000000000ULL;
        ts->tv_nsec = ns % 1000000000ULL;
    } while (READ_ONCE(v->seq) != seq);          // 序号变化则重试
    return 0;
}
```

glibc 的 `clock_gettime` 先解析 `vdso` 符号，命中则直接调用，否则退回 `syscall(SYS_clock_gettime, ...)`，用户无感知。`ldd` 程序可见其链接到 `linux-vdso.so.1`。

## 五、与其他技术对比

| 机制 | 是否陷入 | 地址固定 | 可写 |
| --- | --- | --- | --- |
| 普通 syscall | 是 | — | 任意 |
| vsyscall（旧） | 否 | 固定 0xffffffffff600x00 | 否 |
| vDSO | 否 | 随机化 | 否 |
| async 调用 | 否 | — | 视情况 |

vDSO 相较旧式 vsyscall（固定映射、可执行且地址可预测）更安全；相较任意 syscall 免陷入；其语义是同步只读，不同于异步 I/O。

## 六、常见误区

1. 误以为 `clock_gettime` 总陷入：在 vDSO 路径下完全不陷入，且只消耗几十纳秒。
2. 误以为 vDSO 可做任意系统调用：仅放置只读、无副作用、可安全暴露给用户的逻辑。
3. 误以为 vDSO 数据静止不变：内核经 seqlock 持续更新，读端必须配合序号重试。
4. 误以为 `getpid` 也走 vDSO：它需内核查 `task_struct`，属于必陷入调用。
5. 误以为 vDSO 时间绝对精确：受 `TSC` 校准误差、`max_clock_delta` 钳制影响，极端情况下会退化为读回退路径。
6. 误以为 vDSO 在所有时钟源下都快：若内核退回 `jiffies` 时钟源，`vread` 可能仍需额外修正甚至走 syscall。

## 七、与开源书·权威来源对应

- Kerrisk《TLPI》第 3 章讲解 vDSO/vsyscall 的动机、局限与 `clock_gettime` 行为。
- Bovet & Cesati 第 10 章描述系统调用入口与 vDSO 作为「用户态快捷方式」的定位。
- 内核 `Documentation/vDSO` 给出 `vdso_data` 布局、`VDSO_CLOCKMODE` 枚举与时间命名空间模式。
- Drepper 文章说明 `rdtsc`/`rdtscp` 的序列化差异与 `constant_tsc` 对换算稳定性的意义。

## 八、面试题

1. 为什么 `gettimeofday` 几乎免费？要点：走 vDSO 在用户态用 `rdtsc`+seqlock 读时钟，无 syscall 陷入。
2. vDSO 如何保证读到一致时钟？要点：内核用 seqlock 更新 `vdso_data`，用户端读序号—读值—校验序号。
3. 为什么废弃 vsyscall 改用 vDSO？要点：vsyscall 固定可执行映射易被 ROP 利用，vDSO 随机化且只映射数据/代码页。
4. `CLOCK_MONOTONIC` 与 `CLOCK_REALTIME` 在 vDSO 实现上有何不同？要点：前者无需墙上偏移，后者需叠加 `tod_offset` 并可能回拨。

## 九、演进与趋势

- vDSO 新增 `getrandom`（部分架构）直接产出随机数，减少随机数服务陷入。
- 时间命名空间（time namespace）让 `vdso_data` 按命名空间提供不同偏移，配合 `VDSO_CLOCKMODE_TIMENS`。
- 与 KPTI/Spectre 缓解协同：`vsyscall` 模式逐渐被完全移除，vDSO 成为唯一用户态时钟加速路径；`RDTSCP` 序列化改进进一步降低读钟开销。

## 十、小结

vDSO 把只读、无副作用的内核逻辑移到用户态地址空间，用 seqlock 维护并发一致性，从而消除热门系统调用的陷入成本。

它是「把可安全下放的工作交给用户态」的经典工程范例，也是现代 Linux 计时零成本的关键。
