# 重排序缓冲 ROB

> 对应 Hennessy & Patterson 量化方法乱序提交章。

## 一、背景与挑战
乱序执行提升 ILP，但必须"按程序序"提交（retire）以保证精确异常与内存语义。ROB 记录已发射但未提交指令，按序提交其结果为架构状态。

## 二、核心原理
指令译码后入 ROB 尾部；执行完在 ROB 内标记完成；ROB 头部连续完成的指令按序提交，写回 ARF/内存。遇异常则丢弃其后所有指令并恢复。

## 三、形式化与数学基础
提交宽度 $R$，窗口大小 $S$。指令在窗内平均延迟 $L$，可重叠执行：
$$IPC \approx \min(R, \frac{S}{L})$$
ROB 大小 $S$ 决定可探索的 ILP 窗口，过小限制调度。

## 四、代码实现
```c
// 循环ROB
struct rob_e { int pc; int dst; int phys; int done; int exc; };
struct rob_e rob[192]; int head, tail;
void retire() {
    while (rob[head].done && !rob[head].exc) {
        commit(rob[head].dst, rob[head].phys); // 按序提交
        head = (head+1) % 192;
    }
    if (rob[head].exc) flush_after(head); // 精确异常
}
```

## 五、与其他技术对比
ROB 提供"乱序执行、按序提交"，区别于纯 Tomasulo（无提交约束）。与 store buffer 配合处理推测存储提交。

## 六、常见误区
误以为乱序执行即乱序可见：提交才生效。误以为 ROB 越大越好：面积与恢复延迟上升。

## 七、与开源书/权威来源对应
量化方法 ROB 与精确异常；CSAPP 异常/恢复类比。

## 八、面试题
问：ROB 如何实现精确异常？答：仅提交到异常点之前的指令，其后丢弃。

## 九、演进与趋势
大 ROB（200+ 项）配合分支预测恢复检查点，提升窗口深度。

## 十、小结
ROB 是乱序处理器正确性的守门人，用"顺序提交"把性能与正确性统一。
