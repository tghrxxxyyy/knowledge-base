# ROB与store队列交互

> 对应 Hennessy & Patterson《Computer Architecture: A Quantitative Approach》第 3 章（store 队列与内存顺序）与 Intel《Software Developer's Manual》卷 3（内存排序模型）。

## 一、背景与挑战

在乱序执行中，store 指令很快就能算完地址与数据，但绝不能立刻写内存：若此时发生异常或分支误预测，该 store 必须「似从未发生」；若它排在一条尚未提交的 load 之后却先写内存，还会破坏程序序与内存模型（如 x86 的 TSO 要求 store 按程序序对其它核可见）。因此 store 的内存写入必须被推迟到「提交」时刻并按 ROB 程序序进行。store 队列（Store Queue, STQ / LSU）就是暂存这些待提交 store 的缓冲，并与 load 队列（LDQ）协作完成内存消歧与转发。没有 STQ，投机执行与精确异常都无法安全实现。

## 二、核心原理

每条 store 在 ROB 占用表项的同时，也在 STQ 中写入「地址、数据、ROB 索引、有效位」。store 在提交前已完成地址/数据计算（或至少地址已知），但数据仅停留在 STQ，不触碰 L1。提交时，store 按 ROB 顺序把 STQ 项写入 L1（并触发后续缓存一致性动作）。load 在执行期做「内存消歧」（memory disambiguation）：它检查 STQ 中「程序序上更早、地址重叠、尚未提交」的 store，直接从其取数（store-to-load forwarding），避免无谓地等 store 提交；若无法静态/动态确认无冲突，则 load 需等待最年长可能冲突的 store 提交后再读缓存。STQ 与 ROB 共用程序序，二者协同保证内存写按序生效且可被推测。

## 三、形式化与数学基础

对 load 地址 $a$，其值来自「程序序上最早的、地址匹配且未提交的 store」：

$$ value(a)=\begin{cases} data(s), & \exists\,s\in STQ:\ s.rob\_idx<a.rob\_idx\land s.addr=a\land s.valid \\ L1(a), & \text{否则} \end{cases} $$

其中 $s.rob\_idx<a.rob\_idx$ 保证只转发「年长于本 load」的 store（程序序在前）。名字依赖（RAW 于内存）由此满足。若存在 `addr` 尚未算出的年长 store，load 必须停顿直到其地址解析并确认不冲突，否则可能误读缓存。提交顺序由 ROB 决定，故 store 对其它核的可见顺序即程序序：

$$ visible\_order = ROB\ 提交顺序 $$

## 四、代码实现

```c
struct stq_entry { uint64_t addr, data; int rob_idx; int valid, addr_rdy; };
struct stq_entry stq[STQ_SZ];
int stq_head, stq_tail;

// load 取值：先在 STQ 中找年长且地址匹配的 store 做转发
uint64_t load_resolve(uint64_t a, int my_rob) {
    uint64_t fwd = 0; int found = 0;
    for (int i = stq_head; i != stq_tail; i = (i+1)%STQ_SZ) {
        if (!stq[i].valid) continue;
        // 只转发程序序更早（rob_idx 更小）的 store
        if (stq[i].addr_rdy && stq[i].addr == a && stq[i].rob_idx < my_rob) {
            fwd = stq[i].data; found = 1; break;
        }
    }
    return found ? fwd : l1_read(a);
}

// 提交时按 ROB 顺序把 store 写回内存
void commit_stores_upto(int head) {
    for (int i = stq_head; i != stq_tail && stq[i].rob_idx <= head; ) {
        if (stq[i].valid) l1_write(stq[i].addr, stq[i].data);
        i = (i+1)%STQ_SZ;
    }
}
```

## 五、与其他技术对比

| 机制 | 内存写入时机 | 异常/推测安全 | 转发 |
| --- | --- | --- | --- |
| 无 STQ（store 早写） | 执行完即写 | 不安全，难回滚 | 无 |
| STQ + 提交时写 | 提交时按序写 | 安全（提交前不可见） | 支持 |
| STQ + 早提交 speculative 写 | 提交前写（带撤标记） | 需复杂撤消 | 支持但风险高 |

STQ 把内存写入延迟到提交，是精确异常、推测安全与内存模型可解释性的共同前提。对比写缓冲（store buffer）：STQ 参与消歧与提交顺序，写缓冲仅吸收提交后写回的延迟。

## 六、常见误区

1. 误以为 store 执行完就写内存——必须 ROB 提交时按序写入，否则破坏异常语义与内存可见性。
2. 误以为 load 总读缓存——忽略 STQ 转发，会让依赖 store 的 load 多等数十周期。
3. 误以为 store-to-load 转发任意方向都可——只能转发「年长于本 load」的 store，反向会违程序序。
4. 混淆 STQ 与写缓冲（write buffer / store buffer）：前者参与消歧与提交顺序，后者仅吸收提交后写回的延迟。
5. 忽略地址未就绪的 store 也会阻塞 load——内存消歧需确认无冲突，否则 load 保守停顿。

## 七、与开源书·权威来源对应

- Hennessy & Patterson 第 3 章：将 STQ / LDQ 与 store 提交、内存消歧、转发一并建模，给出其对 Load-to-use 延迟与 IPC 的影响。
- Intel SDM 卷 3（§8 Memory Ordering）：x86 TSO 模型要求 store 按程序序对其他逻辑处理器可见，STQ 的「按序提交写」正是对该约束的微体系结构实现。
- Bryant & O'Hallaron《CSAPP》第 5 章：以内存级并行（MLP）讲解 load/store 队列如何提升吞吐。
- ARM ARM：Weakly-ordered 模型下 STQ 与屏障指令（DMB）的交互，约束更强。

## 八、面试题

1. store 何时才真正写内存？
   要点：ROB 提交时按程序序写入 L1；执行完只进 STQ，对架构不可见。
2. store-to-load 转发的作用与方向约束？
   要点：隐藏 store 提交延迟、消除内存 RAW 停顿；仅转发年长（程序序在前）且地址匹配的 store。
3. 一条 load 为何可能要等年长 store 的地址算完？
   要点：内存消歧需确认无地址冲突，否则读缓存可能读到本应被该 store 覆盖的旧值。
4. STQ 与写缓冲有何区别？
   要点：STQ 参与提交顺序与消歧、可被推测回滚；写缓冲仅缓存已提交写的回写。
5. x86 TSO 下 STQ 如何保证可见顺序？
   要点：store 对其他核的可见顺序即 ROB 提交顺序，STQ 确保不提前写 L1。

## 九、演进与趋势

STQ 容量与内存消歧精度直接决定 load 可提前多少。现代核引入「推测性 load 提前」（基于冲突预测器）与「store 集预测」（store-set predictor）减少不必要的等待；同时把 STQ 与一致性协议（如 MESI）深度耦合，使提交写触发更细粒度的行状态迁移。非临时 store（non-temporal）与写合并缓冲（WC）则绕过 STQ 直接走弱序路径，优化流式写。

## 十、小结

STQ 与 ROB 协同，把 store 的内存写入推迟到提交并按程序序生效，同时支持 store-to-load 转发以隐藏延迟。它是乱序核在「性能（消歧/转发）」与「正确（异常/内存模型）」之间取得平衡的关键存储结构——理解「提交才写内存、仅转发年长 store」是掌握内存级并行的核心。
