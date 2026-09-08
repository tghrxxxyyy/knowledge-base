# LL/SC与ABA问题

> 对应 ARMv8 手册 LDXR/STXR 与 Power 架构 lwarx/stwcx。

## 一、背景与挑战
加载-链接/条件存储（Load-Link / Store-Conditional, LL/SC）是 CAS 的替代原语，天然避免某些 ABA 问题，但也带来「伪失败」挑战。

## 二、核心原理
LL(addr) 读值并打上「监视」标记；SC(addr, new) 仅当该地址自 LL 后未被其它写改动时才写入并返回成功，否则失败。任何冲突写或上下文切换都可能使 SC 失败。

## 三、形式化与数学基础
设 LL 时刻值 $v_0$。SC 成功条件：
$$Success \iff \neg \exists w: (t_{LL} < t_w < t_{SC}) \land write(addr)$$
即监控区间无写冲突。CAS 比较值，LL/SC 比较「是否被写」。

## 四、代码实现
```asm
; ARM 原子自增
retry:
    ldxr w1, [x0]      ; LL
    add  w1, w1, #1
    stxr w2, w1, [x0] ; SC
    cbnz w2, retry     ; 失败重试
```

## 五、与其他技术对比
LL/SC 不读旧值比较，故天然免疫 ABA（只要地址被写就失败）；但实现依赖监视器，上下文切换/中断易造成伪失败，需重试。

## 六、常见误区
误认为 LL/SC 永不 ABA。虽然不「比较旧值」，但若用读出的旧值计算新值，逻辑层仍可能受 ABA 影响，需版本配合。

## 七、与开源书/权威来源对应
ARMv8 手册对独占监视器与 LL/SC 语义的规定；Hennessy & Patterson 对比 CAS 与 LL/SC 实现。

## 八、面试题
问：LL/SC 为何会伪失败？答：任何对该地址或同监视集的写、异常、上下文切换都可能使 SC 失败，即使「逻辑上」无冲突。

## 九、演进与趋势
大型独占监视器（如 ARM 按缓存行/系统级）减少伪失败；RISC-V 的 lr/sc 遵循类似语义。

## 十、小结
LL/SC 以「写冲突检测」替代「值比较」，规避 CAS 的 ABA，但伪失败要求算法必须可重试。
