# RCU的Quiescent State与GP检测

> 对应 Linux 内核 Documentation/memory-barriers.txt 与 remzi-arpacidusseau/ostep-code。

## 一、背景与挑战
内核如何知道「所有之前的读者都退出了」？直接跟踪每个读者成本高，RCU 用静止状态（Quiescent State，如上下文切换、idle、用户态返回）作为读者已离开临界区的证据来推进宽限期。

## 二、核心原理
每个 CPU 在到达静止状态时报告自己已通过静止点。当所有 CPU 都至少报告一次静止状态，且发生在宽限期开始之后，说明没有任何读者仍持有旧引用，宽限期结束。经典实现用多级计数器树（rcu_node）聚合各 CPU 的报告。

## 三、形式化与数学基础
令 $Q_i(t)$ 表示 CPU $i$ 在时刻 $t$ 已进入静止状态。宽限期完成条件：

$$ GP\ \text{done} \iff \forall i,\; \exists t_i > GP_{start}:\ Q_i(t_i) = \text{true} $$

即所有 CPU 在宽限期开始后都经历过一次静止态。

## 四、代码实现
CPU 报告静止（概念）：

```c
void rcu_report_qs(void) {
    if (in_rcu_quiescent_state())
        __atomic_store_n(&per_cpu(qs_flag), 1, __ATOMIC_RELEASE);
    // rcu_gp_kthread 检测全部置位后结束 GP
}
```

宽限期等待循环（简化）：

```c
synchronize_rcu() {
    start_gp();
    while (!all_cpus_reported_qs()) cpu_relax();
    end_gp();
}
```

## 五、与其他技术对比
顺序一致的内存模型要求全局可见；RCU 用静止态局部证据近似，避免逐读者跟踪。相比引用计数，RCU 把「何时可回收」从每次读改为周期性宽限期，极大降低读侧成本。

## 六、常见误区
认为静止态等于临界区退出，实际它只是一个可观察的安全点；认为宽限期立即结束，需等所有 CPU 报告；忽略 NO_HZ 空闲 CPU 仍需上报。

## 七、与开源书/权威来源对应
Linux 内核 Documentation/RCU/ 系列与 memory-barriers.txt；OSTEP 仓库示例；Lamport 1978 关于分布式状态的思路可类比。

## 八、面试题
静止状态是什么；为何不需要逐读者跟踪；多级 rcu_node 作用；NO_HZ 如何影响 GP。

## 九、演进与趋势
Tree RCU 扩展到数百核；回调批处理减少唤醒；加速宽限期（expedited）用于启动等场景。

## 十、小结
RCU 通过让各 CPU 在静止状态上报来证明旧读者已全部离开，从而以极低读侧成本确定宽限期结束，是多核 RCU 可扩展的关键。
