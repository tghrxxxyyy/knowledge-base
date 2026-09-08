# ROB结构与重排序

> 对应 Hennessy & Patterson《Computer Architecture》。

## 一、背景与挑战
乱序执行提升吞吐，但程序语义要求结果按序「提交」（retire/commit）。重排序缓冲（ROB）记录指令原顺序，使乱序完成的指令按序提交。

## 二、核心原理
ROB 是 FIFO 环形缓冲，按程序顺序分配表项。指令完成时将结果写入对应 ROB 项并标记完成；提交指针从队头按序提交，仅当前面所有指令均已完成后才推进。

## 三、形式化与数学基础
设提交指针 head，完成标记 done[i]：

    commit advances while done[head] == 1
    每次提交可释放物理寄存器与更新 RAT 旧映射。

## 四、代码实现
```c
struct rob_entry { int pc; int dst; uint64_t val; int done; int exception; };
void commit() {
    while (rob[head].done && !rob[head].exception) {
        arch_reg[rob[head].dst] = rob[head].val; // 提交到架构态
        free_phys(rob[head].old_phys);
        head = (head + 1) & MASK;
    }
}
```

## 五、与其他技术对比
无 ROB 的 Tomasulo 仅乱序完成，不支持精确异常；ROB 提供按序提交，是精确异常与推测的基础。

## 六、常见误区
误以为 ROB 越大越好；容量受提交宽度与恢复复杂度限制。误以为完成即可见。

## 七、与开源书/权威来源对应
Hennessy & Patterson 将 ROB 与乱序提交、精确异常一并讨论。

## 八、面试题
1. ROB 为何需要按序提交？答：保证架构可见顺序与精确异常。
2. ROB 与寄存器重命名如何配合？

## 九、演进与趋势
分区 ROB 与数据捕获降低提交级延迟；与 store 队列紧密耦合。

## 十、小结
ROB 以 FIFO 顺序约束将乱序执行的结果按序提交，是实现精确异常与推测执行的基石。
