> 对应 Linux 内核 Documentation（scheduler/sched-deadline.rst）与 Liu & Layland 1973 的 EDF 可调度性理论。

## 一、背景与挑战
仅用固定优先级难以在复杂任务集上保证「所有任务在截止期前完成」。挑战是引入基于任务自身参数（周期/运行时间/截止期）的调度，并提供可证明的接纳控制，拒绝不可调度的任务集。

## 二、核心原理
SCHED_DEADLINE 采用 EDF（Earliest Deadline First）：每个任务带 runtime（C）、deadline（D）、period（P）。运行时按「绝对截止期最早者优先」。内核用 CBS（Constant Bandwidth Server）做带宽隔离与接纳控制，保证任务不超过其预留带宽，且若 Σ(C_i/P_i) <= 1（对 D=P 情况）则 EDF 可调度。

## 三、形式化与数学基础
任务 τ_i 参数 (C_i, D_i, P_i)。利用率：
```
U_i = C_i / P_i
```
EDF 可调度充分条件（D_i = P_i 时）：
```
Σ_{i} U_i <= 1
```
更一般（D_i <= P_i）用 Liu & Layland 充分必要条件近似。CBS 维护服务器预算 B 与补充周期，超额时推迟到下一周期，隔离误用：
```
if (consumed > B):  defer until (now + (P - elapsed))
```

## 四、代码实现
```c
// kernel/sched/deadline.c（简化）
static void task_tick_dl(struct rq *rq, struct task_struct *p)
{
    if (p->dl.runtime <= 0) {                  // 预算耗尽
        // CBS: 补充预算并可能推迟
        p->dl.runtime = p->dl.dl_runtime;
        p->dl.deadline = rq_clock(rq) + p->dl.dl_deadline;
        resched_curr(rq);
    }
}
static struct task_struct *pick_next_task_dl(struct rq *rq)
{
    // 选绝对截止期最早者
    return __pick_first_dl_entity(&rq->dl);
}
```

## 五、与其他技术对比
- 固定优先级（FIFO/RR）：实现简单但利用率低（约 69% 上限）。
- EDF：利用率可达 100%，但需参数与接纳控制。
- CFS：非实时，无截止期概念。

## 六、常见误区
- 误区：SCHED_DEADLINE 仅按优先级。它按「绝对截止期」动态排序。
- 误区：任何任务都能被接纳。内核做 CBS 检查，超额会被拒绝（EAGAIN）。

## 七、与开源书/权威来源对应
- Linux 内核 Documentation/scheduler/sched-deadline.rst 权威描述。
- Liu, C.L. & Layland, J. 1973「Scheduling Algorithms for Multiprogramming」EDF 理论。
- GitHub CyC2018/CS-Notes 提及 EDF 概念。

## 八、面试题
1. EDF 相比固定优先级调度利用率上限是多少？
2. CBS 在 SCHED_DEADLINE 中的作用？
3. 接纳控制为什么拒绝 ΣU>1 的任务集？

## 九、演进与趋势
SCHED_DEADLINE 自 3.14 合入主线，逐步支持非对称多核（学生会调度）、与 cgroup 限流协作，成为嵌入式硬实时首选。

## 十、小结
SCHED_DEADLINE 用 EDF + CBS 提供基于截止期的可证明实时调度，利用率可达 100%，是硬实时场景的理论最优实践。
