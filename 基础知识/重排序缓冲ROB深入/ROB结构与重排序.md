# ROB结构与重排序

> 对应 Hennessy & Patterson《Computer Architecture: A Quantitative Approach》第 3 章（ROB 与乱序提交）与 Smith & Pleszkun 1985（ROB 原始设计）。

## 一、背景与挑战

经典 Tomasulo 算法让指令「完成即写回」，解决了乱序执行中的冲突，但无法保证「对外顺序生效」——完成序不等于程序序。为了让乱序执行既提升 ILP 又不破坏顺序语义，需要一种结构记录每条指令的「出生顺序」，并在最后一级按该顺序放行。重排序缓冲（Reorder Buffer, ROB）正是这一结构：它把乱序完成的指令重新按程序序「排序」后提交，从而支撑精确异常与推测执行。没有 ROB，乱序核就无法同时满足「高吞吐」与「程序序承诺」。

## 二、核心原理

ROB 是一块按程序序分配的 FIFO 环形缓冲。取指/译码后，每条指令（无论是否会被重命名）都获得一个 ROB 表项，记录其 PC、目标架构寄存器、目的物理寄存器、旧物理寄存器、结果值、完成与异常标记。指令执行完毕（写回）时把结果填入对应 ROB 项并置 `done`。提交指针从队头（`head`）按序推进：仅当队头连续若干项都 `done` 且 `!exc` 时，才把它们的寄存器值写回架构态、回收旧物理寄存器、放行 store。因此 ROB 在「乱序完成」与「顺序提交」之间架起一座桥——内部任意并行，对外严格顺序。ROB 还兼作精确异常的索引：异常点即 ROB 中第一个未提交项，重启 PC 直接取其 `pc`。

## 三、形式化与数学基础

设 ROB 容量 $M$，表项 $e_i=(pc_i, arch_i, phys_i, old_i, val_i, done_i, exc_i)$。提交指针 $head$、分配指针 $tail$。分配时 $tail\leftarrow(tail+1)\bmod M$（满则反压前端）。提交推进条件为：

$$ \forall\, j\in[head, head+k):\ done_j=1\land exc_j=0,\quad k\le C $$

每提交一项回收 $old_j$ 到自由表：

$$ freelist \leftarrow freelist \cup \{old_j\} $$

当 $head=tail$（空）或满（`tail+1==head` 环形）时分别停止提交/分配。ROB 的存在使提交序 $\equiv$ 程序序，从而精确异常点可由 ROB 索引精确定位，且推测恢复只需截断 ROB 尾部。

## 四、代码实现

```c
struct rob_entry {
    uint64_t pc;
    int arch_dst;      // 架构目标寄存器，或 -1
    int phys_dst;      // 重命名后的物理寄存器
    int old_phys;      // 被覆盖的旧物理寄存器（提交时回收）
    uint64_t val;
    int done, exc, is_store, stq_id;
};
#define M 256
struct rob_entry rob[M];
int head, tail;        // 环形指针

void commit() {
    while (head != tail && rob[head].done && !rob[head].exc) {
        if (rob[head].is_store)
            stq_commit(rob[head].stq_id);
        else if (rob[head].arch_dst >= 0)
            arch_reg[rob[head].arch_dst] = rob[head].val;
        free_phys(rob[head].old_phys);   // 回收旧物理寄存器
        head = (head + 1) & (M - 1);
    }
}
```

## 五、与其他技术对比

| 方案 | 是否支持精确异常 | 顺序提交 | 额外状态 |
| --- | --- | --- | --- |
| 纯 Tomasulo（完成即写回） | 否 | 否 | 少 |
| ROB + 顺序提交 | 是 | 是 | ROB 表 |
| ROB + 未来文件（future file） | 是 | 是 | ROB + 物理寄存器堆 |
| 检查点 + 重命名 | 是（更强推测） | 是 | 检查点存储 |

ROB 以「一份顺序记录」统一解决了提交、异常、恢复三件事，是乱序核的事实标准。未来文件方案把值存 PRF、ROB 仅存指针，本质等价但更适合大容量场景。

## 六、常见误区

1. 误以为 ROB 越大越好——容量增大时唤醒/提交关键路径与检查点逻辑变慢，且收益在 ILP 受限时递减。
2. 误以为完成即可见——写回只进 ROB，提交才进架构态。
3. 误以为 ROB 只服务于提交——它同时为精确异常定位、推测恢复、store 排序提供统一索引。
4. 混淆 ROB 与发射队列（RS / scheduler）：RS 管「何时发射」，ROB 管「何时提交」。
5. 误以为 ROB 项可随意丢弃——未提交项一旦因异常/误预测丢弃，其占用的物理寄存器须归还 freelist，否则泄漏。

## 七、与开源书·权威来源对应

- Smith & Pleszkun 1985（IEEE TC）：提出用重排序缓冲实现精确中断（precise interrupt），是 ROB 的思想源头。
- Hennessy & Patterson 第 3 章：把 ROB 与 Tomasulo、寄存器重命名、精确异常纳入同一量化框架，给出面积/延迟/IPC 的权衡。
- Bryant & O'Hallaron《CSAPP》：以 SEQ+/PIPE 流水线说明「按序提交」如何保证程序员可见状态正确。
- Intel SDM / ARM ARM：现代核 ROB 的工程配置（具体容量以官方最新文档为准）。

## 八、面试题

1. ROB 为何需要按序提交？
   要点：保证架构可见顺序与精确异常；乱序提交会让异常点之后的指令提前生效。
2. ROB 与寄存器重命名如何配合？
   要点：分配时一并完成重命名，ROB 记新旧物理寄存器，提交时回收旧者、释放 freelist。
3. 为什么纯 Tomasulo 不支持精确异常？
   要点：完成即写回，异常发生时无法界定哪些指令「已生效」。
4. ROB 满时前端会发生什么？
   要点：分配指针追不上提交，取指/译码被反压停顿，直到提交腾出表项。
5. 异常点如何由 ROB 定位？
   要点：异常点即 ROB 中第一个未提交项，重启 PC 取其 `pc`，之前全提交、之后全丢弃。

## 九、演进与趋势

为缓解大 ROB 的延迟与功耗，现代核采用分区 ROB（按区域分桶、降低单点唤醒复杂度）、数据捕获（提交时直接从 ROB 取数减少总线竞争）、与物理寄存器文件（PRF）深度整合（ROB 仅存指针，值存 PRF）。SMT 下多线共享 ROB，并结合优先级提交以压低尾延迟。研究还探索「可变容量 ROB」按负载动态开关分区节能。

## 十、小结

ROB 以 FIFO 顺序约束把「乱序完成」重新整理为「顺序提交」，是乱序执行实现对程序序承诺、支持精确异常与推测执行的结构基石。理解 ROB 即理解了现代高性能核正确性的核心——它让内部并行与外部顺序语义达成统一。
