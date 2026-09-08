# ROB与异常精确

> 对应 Hennessy & Patterson《Computer Architecture》与 Bryant & O'Hallaron《CSAPP》。

## 一、背景与挑战
精确异常要求：异常发生时，已提交的指令全部生效，未提交的指令似从未执行。乱序执行若不控制提交顺序，就无法满足此要求。

## 二、核心原理
异常指令在 ROB 中标记。提交到该指令时触发 trap，其后的 ROB 项全部清空（flush），已提交架构状态保持，从而恢复点精确对应异常指令。

## 三、形式化与数学基础
设异常指令在 ROB 索引 k，提交指针 head：

    commit entries [head, k-1] 已生效;
    flush entries [k, tail];
    恢复 PC = rob[k].pc;

## 四、代码实现
```c
void handle_exception(int rob_idx) {
    for (int i = rob_idx; i != tail; i = (i+1)&M)
        discard(rob[i]);          // 撤销未完成
    set_pc(rob[rob_idx].pc);
    flush_pipeline();
}
```

## 五、与其他技术对比
无 ROB 的乱序完成无法精确定位异常点；ROB 以顺序提交天然支持精确异常，代价是更大的状态缓冲。

## 六、常见误区
误以为异常指令前已完成的指令也应撤销；精确异常要求它们保留。误以为精确异常仅指缺页。

## 七、与开源书/权威来源对应
CSAPP 第 5 章讲乱序与异常；Hennessy & Patterson 详述精确异常机制。

## 八、面试题
1. 精确异常的定义？答：异常点前后指令状态分界清晰。
2. ROB 如何支持它？

## 九、演进与趋势
中断与异步异常同样借 ROB 顺序提交实现精确性。

## 十、小结
ROB 的顺序提交使乱序执行能精确报告异常点，是异常处理正确性的关键。
