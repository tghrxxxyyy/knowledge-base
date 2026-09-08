# ROB容量与性能

> 对应 Hennessy & Patterson《Computer Architecture》。

## 一、背景与挑战
ROB 容量决定了可同时「在途」的指令数，直接限制可跨越的 cache 缺失与长延迟操作数量，从而影响 IPC。

## 二、核心原理
更大的 ROB 容纳更多未完成指令，更好隐藏长延迟；但唤醒/提交逻辑与检查点随容量增大而变慢、变耗电，存在收益递减。

## 三、形式化与数学基础
性能受限于：

    IPC ≈ min( width, ROB_size / avg_latency_to_hide )

超过后收益递减。

## 四、代码实现
```c
#define ROB_SZ 192
struct rob_entry rob[ROB_SZ];
int head, tail, count;
int rob_full() { return count >= ROB_SZ; }  // 反压前端
```

## 五、与其他技术对比
小 ROB 易满导致前端停顿；超大 ROB 频率与功耗受限。现代高端核约 192-352 项。

## 六、常见误区
误以为翻倍 ROB 即翻倍 IPC；ILP 与端口才是上限。误以为 ROB 仅影响提交。

## 七、与开源书/权威来源对应
Hennessy & Patterson 量化 ROB/窗口大小与 IPC 关系。

## 八、面试题
1. ROB 满会怎样？答：反压取指/译码，暂停发射。
2. 为何收益递减？

## 九、演进与趋势
分区与数据捕获 ROB 降低大容量代价；与 SMT 共享。

## 十、小结
ROB 容量是 ILP 挖掘的关键资源，需在计算能力、功耗与延迟间平衡。
