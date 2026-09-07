# vDSO与快速系统调用

> 对应 Kerrisk《The Linux Programming Interface》第 3 章 vDSO 与 Bovet & Cesati《Understanding the Linux Kernel》第 10 章。

## 一、背景与挑战
`gettimeofday`/`clock_gettime` 等只读内核数据（如时钟）被极频繁调用，若每次陷入内核代价过高。vDSO（virtual dynamic shared object）把这类安全只读逻辑映射到用户态，免陷入。

## 二、核心原理
内核把一段代码与数据（时钟源、seqlock 保护的 xtime）映射进每个进程用户地址空间（vDSO 页），glibc 直接调用其中函数读取，无需 syscall。需 seqlock 处理内核并发更新时钟，避免读到撕裂值。

## 三、形式化与数学基础
vDSO 读时钟：
$$read : retry\{ seq=load(seq); t=load(xtime); \} until\; seq\; even$$
无陷入，成本 $\approx$ 几条指令。仅当数据可被安全暴露给用户（只读、无特权）才放入 vDSO。

## 四、代码实现
```c
// glibc 内部：优先走 vDSO，否则退回 syscall
if (vdso_clock_gettime) return vdso_clock_gettime(clk, ts);
else return syscall(SYS_clock_gettime, clk, ts);
// 用户无感知，clock_gettime 通常零陷入
```

## 五、与其他技术对比
vDSO vs 普通 syscall：免陷入；vs vsyscall（旧固定映射）：vDSO 随机化地址更安全；vs async 调用：vDSO 同步只读。

## 六、常见误区
误以为 clock_gettime 总陷入：vDSO 下不陷入。误以为 vDSO 可做任意系统调用：仅只读安全逻辑。误以为 vDSO 数据不会变：内核通过 seqlock 更新。

## 七、与开源书/权威来源对应
Kerrisk 第 3 章 vDSO/vsyscall；内核文档 `Documentation/vDSO`。

## 八、面试题
问：为什么 gettimeofday 几乎免费？答：走 vDSO 用户态读时钟，无 syscall。问：vDSO 安全性如何保障？

## 九、演进与趋势
vDSO 新增 `getrandom`（部分）等；与 CPU 安全缓解（禁止内核映射执行）协同演进。

## 十、小结
vDSO 把只读、无副作用的内核逻辑移到用户态，消除热门系统调用的陷入成本。
