# Intel TSX指令集

> 对应 Intel SDM 卷3 中 TSX（Transactional Synchronization Extensions）章节。

## 一、背景与挑战
Intel 在 Haswell 引入 TSX，用 HLE（Hardware Lock Elision）与 RTM（Restricted Transactional Memory）提供 HTM，让临界区在无冲突时并行执行。

## 二、核心原理
RTM 用 XBEGIN/XEND 界定事务，XABORT 显式中止。HLE 用 XACQUIRE/XRELEASE 前缀「消除」锁的互斥性：事务成功则锁从未真正被持有。冲突或容量超限触发中止并回退到普通锁路径。

## 三、形式化与数学基础
事务容量受 L1 缓存写集/读集限制，设上限 $C$。若 $|W_T|+|R_T|>C$ 或遇中断/系统调用，则：
$$Abort(T) \iff capacity\_exceeded \lor external\_conflict \lor privileged\_event$$

## 四、代码实现
```asm
; RTM 临界区
xbegin .abort
  ; 临界区代码
xend
  jmp .done
.abort:
  ; 回退到普通加锁路径
  lock; inc [counter]
```

## 五、与其他技术对比
RTM 灵活、可包裹任意代码；HLE 兼容旧锁、改动小但需硬件支持。二者都以中止回退为安全网。

## 六、常见误区
误认为 TSX 永不失败。容量、页表、系统调用、中断都会中止，必须提供回退路径，否则正确性问题。

## 七、与开源书/权威来源对应
Intel SDM 卷3 TSX 章节详述 XBEGIN/XEND/XABORT 与中止原因编码；HLE 的 XACQUIRE/XRELEASE 语义。

## 八、面试题
问：TSX 为何需要回退路径？答：事务可能中止（容量/冲突/特权事件），回退到传统锁保证最终能完成临界区。

## 九、演进与趋势
由于多次微码漏洞（如 TSX 相关 erratum），Intel 在部分型号禁用 TSX（RTM 被 MSR 关闭），工业采用受限。

## 十、小结
TSX 把事务内存带进 x86，但中止与淘汰现实提醒：HTM 是优化而非银弹，回退路径不可或缺。
