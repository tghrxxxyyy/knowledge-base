# 完全公平调度CFS

> 对应 Love《Linux Kernel Development》第 4 章与 Linux 内核 `kernel/sched/fair.c`。

## 一、背景与挑战
传统优先级调度难以在大量公平共享 CPU 的进程中保持“比例公平”，且 O(1) 调度器的启发式随负载复杂化而难以调优。CFS 用“虚拟运行时间”这一统一度量取代固定时间片。

## 二、核心原理
CFS 维护一棵按 `vruntime`（虚拟运行时间）排序的红黑树。每个进程的 `vruntime` 按实际运行时间 $r$ 加权累加：
$$ \\Delta vruntime = \\frac{r}{weight / NICE\_0\_LOAD} $$
权重 `weight` 由 nice 值查表得到（nice 每 +1，CPU 份额约减半）。调度器总是选择 `vruntime` 最小者运行，从而逼近“每人获得相等虚拟时间 = 按比例公平”。

## 三、形式化 / 数学基础
设权重和为 $W=\\sum w_i$，进程 $i$ 在窗口内获得 CPU 比例趋近 $w_i/W$。`vruntime` 增长速率与实际运行时间成反比：$vruntime_i \\propto \\frac{t}{w_i}$，故权重大的进程 `vruntime` 增长慢、更易被选中。

## 四、代码实现
简化版 CFS 选程逻辑（示意）：

```c
struct task *pick_next(struct rb_root *root) {
    struct rb_node *n = rb_first(root);   /* vruntime 最小 */
    return rb_entry(n, struct task, node);
}
void update_vruntime(struct task *t, u64 delta) {
    t->vruntime += delta * NICE_0_LOAD / t->weight;
    rb_erase(&t->node, &root);            /* 重新插入以维护有序 */
    rb_insert(&t->node, &root);
}
```

## 五、与其他技术对比
相比 O(1) 的固定优先级数组，CFS 无显式时间片、按比例分配；相比传统 RR，CFS 的“时间片”随负载自适应（目标延迟 `sched_latency` 在进程数多时收紧）。

## 六、常见误区
- 认为 nice 是“优先级数字”，实际它映射到权重比例，nice 差 1 ≈ CPU 比 1.25 倍。
- 忽略 `sched_min_granularity`：进程过多时单进程最小运行时间被约束，避免切换开销过大。
- 误以为 CFS 完全无抢占：仍有时钟 tick 触发 `check_preempt`。

## 七、与开源书 / 权威来源对应
- CSAPP 中文笔记（系统级视角）：https://github.com/Hansimov/csapp
- CS-Notes：https://github.com/CyC2018/CS-Notes
- 参考 Love《Linux Kernel Development》、Wolf《Linux Kernel Programming》。

## 八、面试题
1. CFS 为何用红黑树？查找、插入、删除复杂度？
2. vruntime 如何保证公平？权重如何得出？
3. 进程数极多时 CFS 如何防止切换风暴？

## 九、演进与趋势
引入 `schedutil` 调度器与 EAS（Energy Aware Scheduling）、以及 SCHED_DEADLINE 的 EDF 补充，CFS 逐步融合能效与实时约束。

## 十、小结
CFS 以“vruntime 红黑树”统一表达公平：谁虚拟时间最小谁运行，nice 通过权重表转化为比例份额。
