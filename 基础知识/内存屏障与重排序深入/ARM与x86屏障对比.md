# ARM与x86屏障对比

> 对应 ARMv8 手册 DMB/DSB 与 Intel SDM 卷3 屏障指令。

## 一、背景与挑战
同一段并发代码在 x86 上正确、在 ARM 上失效，是最常见的移植 bug。根因是两架构内存模型与屏障语义差异巨大。

## 二、核心原理
x86-TSO 仅放松 store→load，因此许多同步「碰巧」正确，典型只需 SFENCE/MFENCE。ARM 为弱模型，读读、写写、读写均可重排，需要 DMB（按方向/领域）或 DSB 显式约束。

## 三、形式化与数学基础
x86 允许重排集合 $R_{x86}=\{\text{store}\to\text{load}\}$。ARM 允许 $R_{ARM}\supset R_{x86}$（含 load→load、store→store 等，除非屏障分隔）。因此 ARM 需更多屏障实例。

## 四、代码实现
```asm
; x86 发布
mov [data], rax
mov [flag], 1      ; 需 sfence 才是强发布（一般 release 由原子指令隐含）

; ARM 发布
str x0, [data]
dmb ish            ; 全系统内部共享域屏障
str x1, [flag]
```

## 五、与其他技术对比
x86 屏障少而语义接近 SC；ARM 屏障细粒度（内部/外部共享域、读写方向），灵活但易错。

## 六、常见误区
误把 x86 的「少屏障」经验套到 ARM。ARM 上缺失 DMB 会导致真实重排错误，而非理论风险。

## 七、与开源书/权威来源对应
ARMv8 手册 Barrier 章节；Intel SDM 卷3 Memory Ordering；RISC-V 的 RVWMO 也类似弱模型。

## 八、面试题
问：为何 x86 程序移植 ARM 常要加屏障？答：x86 默认仅 store→load 重排，ARM 允许更多重排，需显式 DMB 重建顺序。

## 九、演进与趋势
借助 C++ 原子内存序，源码层统一，屏障由编译器按目标架构插入，降低移植负担。

## 十、小结
x86 的「宽松但接近 SC」与 ARM 的「彻底弱序」是并发移植陷阱的根源，抽象内存序是跨平台正解。
