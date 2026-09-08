# ROB与推测状态恢复

> 对应 Hennessy & Patterson《Computer Architecture》与 Böhme 2018（Meltdown）。

## 一、背景与挑战
分支预测与投机执行让指令在「可能错误」的路径上运行。一旦预测错误，必须撤销这些投机指令对架构/微架构状态的所有影响。

## 二、核心原理
投机指令在 ROB 中标记 speculative 位。预测失败时，从错误分支点之后所有 ROB 项被丢弃，RAT 恢复到分支点快照，流水线清空并沿正确路径重取。

## 三、形式化与数学基础
恢复需回滚：

    RAT := snapshot_at_branch
    物理寄存器 freelist := state_at_branch
    ROB := 仅保留 [head, branch_rob_idx)

## 四、代码实现
```c
void mispredict_recover(int branch_rob) {
    RAT = saved_rat[branch_rob];          // 恢复映射
    free_list_restore(checkpoint[branch_rob]);
    head = branch_rob + 1;                // 丢弃其后
    clear_pipelines();
}
```

## 五、与其他技术对比
基于 ROB 的集中恢复统一处理；有些设计用影子 RAT/检查点减少恢复延迟。

## 六、常见误区
误以为仅撤销架构寄存器足够；微架构状态（如 TLB 填充、缓存）未必回滚，正是侧信道根源。

## 七、与开源书/权威来源对应
Meltdown/Böhme 2018 揭示投机执行留下的微架构痕迹；Hennessy & Patterson 讲恢复。

## 八、面试题
1. 预测错误如何恢复？答：ROB 截断 + RAT 快照恢复。
2. 为何微架构状态难完全回滚？

## 九、演进与趋势
检查点 RAT、快速 flush 与安全性（防投机侧信道）成为重点。

## 十、小结
ROB 通过截断与映射快照恢复，使错误投机对架构态无影响，但其微架构残留引发安全问题。
