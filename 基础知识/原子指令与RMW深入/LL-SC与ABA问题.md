# LL/SC与ABA问题

> 对应 ARMv8-A 架构手册 LDXR/STXR 独占访问描述、Power ISA 的 lwarx/stwcx，以及 Herlihy & Shavit《The Art of Multiprocessor Programming》对 CAS 与 LL/SC 的对比。

## 一、背景与挑战

比较并交换（CAS）是通用 RMW 原语，但它有一个根本缺陷：用「值相等」推断「状态未变」。若内存内容从 A 变成 B 又变回 A，CAS 会误判为无冲突并覆盖掉中间的所有变更，这就是 ABA 问题。带版本号的宽 CAS 可以缓解，但硬件支持参差不齐。

加载-链接/条件存储（Load-Link / Store-Conditional, LL/SC）换了一个思路：不比较值，而由硬件记录「这个地址自 LL 之后有没有被写过」。只要被写过，SC 就失败。这从语义层面消除了 ABA。代价是出现了新的失效模式——**伪失败（spurious failure）**：即使逻辑上无冲突（例如发生了中断、上下文切换、甚至无关的缓存驱逐），SC 也可能失败，算法必须能重试。

## 二、核心原理

LL/SC 是一对指令：

- `LL(addr)`：读数并设置一个与该地址绑定的**独占监视器（exclusive monitor）**；
- `SC(addr, new)`：仅当监视器仍然有效（该地址自 LL 后未被任何人写入）时，写入 `new` 并返回成功（通常在目标寄存器写 0）；否则**不写入任何内容**并返回失败（写非 0）。

RISC 架构上通常还要求 LL 与 SC 之间不得有其它内存访问、不得有分支进入、甚至不得有函数调用（以各手册规定为准）。ARMv8 用 `LDXR`/`STXR` 并配 `CLREX` 显式清除监视器；RISC-V 用 `lr.w`/`sc.w`。Power 的 `lwarx`/`stwcx.` 把结果反映在条件寄存器上。

监视器的作用域决定伪失败频率：

- **本核私有监视器**：最省硬件，但任何上下文切换（切换进程/线程会执行 `CLREX` 语义的清监视操作）、中断、异常都可能让 SC 失败。
- **按地址/按缓存行**：监视范围更精确，但需要每核记录若干条目。
- **系统级监视**：可跨核检测冲突，硬件成本最高，但伪失败更少。

## 三、形式化与数学基础

设 LL 发生在时刻 $t_{LL}$ 并读到值 $v_0$，SC 请求发生在 $t_{SC}$。SC 成功的必要条件是该地址在区间内无冲突写：

$$Success \iff \neg \exists w:\; (t_{LL} < t_w < t_{SC}) \;\land\; \text{write}(addr)$$

注意这是**充分必要**条件在理想监视器下成立；实际硬件可能更保守，即存在

$$\neg Success \;\land\; \neg \exists w$$

的情形，这正是伪失败。工程含义是：算法必须以「循环直到成功」编写，且循环体必须是**无副作用可重放**的。

与 CAS 的对照：CAS 的判定谓词是 $A = e$（值相等），LL/SC 的判定谓词是 $\text{version}(addr) = \text{version at LL}$（版本未变）。后者更强，因此 ABA 在 LL/SC 上不成立——只要中间有任何写入，version 就变了。

## 四、代码实现

```asm
; ARM64 原子自增：LL/SC 循环
retry:
        ldxr    w1, [x0]        ; LL: 读并建立独占监视
        add     w1, w1, #1
        stxr    w2, w1, [x0]    ; SC: 失败时 w2 != 0，内存不变
        cbnz    w2, retry       ; 重试
        dmb     ish             ; 如需 release 语义可在此加屏障
```

```c
/* 用 LL/SC 实现的无锁 push（示意，需配内存回收） */
bool push(Node **head, Node *n) {
    Node *old;
    do {
        old = load_link(head);     /* 建立监视并读出当前 head */
        n->next = old;             /* 每轮都用最新 old 重写 next */
    } while (!store_conditional(head, n));  /* 失败则重放整段 */
    return true;
}
```

C++ 中并无直接暴露 LL/SC 的接口；`std::atomic::compare_exchange_weak` 允许伪失败，正是为了在 LL/SC 或 LL/SC 模拟的机器上映射为该原语，因此弱版本必须写在循环里。

## 五、与其他技术对比

| 维度 | LL/SC | CAS | 带版本号的宽 CAS |
| --- | --- | --- | --- |
| 冲突判定 | 地址是否被写过 | 值是否相等 | 值 + 版本号是否相等 |
| ABA 免疫 | 是（任何写都失败） | 否 | 是 |
| 伪失败 | 有（中断/切换/驱逐） | 无 | 无 |
| 可表达任意更新 | 是（循环重放） | 是 | 是 |
| 硬件成本 | 需独占监视器 | 校值逻辑简单 | 需双字/多字原子 |
| 常见平台 | ARM、Power、RISC-V | x86（`CMPXCHG`） | 部分 CPU 的 `CMPXCHG16B`/`CASP` |

## 六、常见误区

- **「LL/SC 永不 ABA」**：指令层面成立，但若算法把 LL 读出的旧值拿去做逻辑计算（例如「若指针指向已释放节点则跳过」），上层逻辑仍可能受 ABA 影响，需要配合版本或安全内存回收。
- **「SC 失败说明有冲突」**：伪失败是常态，尤其在 LL 与 SC 之间发生中断或上下文切换时。
- **「LL 与 SC 之间可以随便写代码」**：多数架构规定该区间内不得有其它内存访问/系统调用，否则监视器被清除，代码必须足够短。
- **「用 compare_exchange_strong 更省事」**：在 LL/SC 机器上强版本需要内部循环伪装成无伪失败，开销更高；在 CAS 机器上两者等价。选弱版本 + 外层循环通常更优。
- **「LL/SC 能实现 wait-free」**：LL/SC 提供的是 lock-free 能力，单线程仍可能反复伪失败而饥饿；wait-free 需要额外机制。

## 七、与开源书·权威来源对应

- **ARMv8-A Architecture Reference Manual**：独占访问（Exclusive access）与 `LDXR`/`STXR`/`CLREX` 语义、监视器粒度规定。
- **Power ISA**：`lwarx`/`stwcx.` 的保留（reservation）语义与条件寄存器约定。
- **RISC-V ISA Manual, Volume I: Unprivileged**：`lr`/`sc` 的语义与实现建议。
- **Herlihy & Shavit《The Art of Multiprocessor Programming》**：CAS 与 LL/SC 的等价性与差异，共识数层次。
- **Hennessy & Patterson《Computer Architecture》**：原子指令的实现与一致性开销。
- **C++ 标准（如 [atomics] 章节）**：`compare_exchange_weak` 的伪失败允许，以官方最新标准文本为准。

## 八、面试题

**Q1：LL/SC 为什么会出现伪失败？**
要点：中断、异常、上下文切换、缓存驱逐或实现上的保守策略都会清除监视器，即使逻辑上无冲突；因此必须循环重试。

**Q2：LL/SC 相比 CAS 的根本优势是什么？**
要点：判定依据从「值是否相等」变成「地址是否被写」，从语义上排除 ABA。

**Q3：为什么 `compare_exchange_weak` 一定要放在循环里？**
要点：弱版本允许伪失败，可能在值未变时也返回失败；只有强版本才保证「值相等则必成功」。

**Q4：LL/SC 循环里能调用函数吗？**
要点：一般不行。函数调用可能触发内存访问或被清除监视器，导致恒定失败。

**Q5：在 ARM 上如何选 LSE 与 LL/SC 路径？**
要点：运行时探测 HWCAP 中的 LSE 位，有则走 `LDADD` 等单指令版本，无则回落到 `LDXR`/`STXR` 循环。

## 九、演进与趋势

- **大型/系统级独占监视器**：ARM 从早期按核私有发展为按地址/缓存行，显著降低伪失败率；`LSE` 原子指令进一步绕开监视器循环。
- **RISC-V**：基础 A 扩展的 `lr`/`sc` 语义与 ARM 类似，`Zalrsc` 方向讨论更强的地址绑定保证。
- **编译器与语言层**：`compare_exchange_weak` 的语义正是为适配 LL/SC 而设计，抽象机器上保留「可伪失败」这一自由度。
- **与安全回收配合**：LL/SC 不解决内存回收，仍需 hazard pointer、epoch 或 RCU 之类的方案。

## 十、小结

LL/SC 以「写冲突检测」替代 CAS 的「值比较」，在指令语义层面规避 ABA，代价是硬件监视器带来的伪失败。它迫使算法写成可重放的短循环，并与内存回收机制配合。理解 LL/SC 是理解 `compare_exchange_weak` 为何存在、以及 ARM/RISC-V 上无锁代码为何要落地两条路径的关键。
