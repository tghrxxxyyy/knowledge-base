# 内存消歧与load投机

> 对应 Hennessy & Patterson《Computer Architecture》。

## 一、背景与挑战
load 指令依赖前面 store 的地址；若地址未知，load 必须等所有前序 store 地址算出（保守），这会限制乱序并行。内存消歧（memory disambiguation）允许 load 在 store 地址未知时投机提前执行。

## 二、核心原理
硬件猜测 load 与所有未决 store 不冲突，先发 load；待 store 地址就绪后核对，若真冲突则检测并回滚 load 及其后续依赖链，重取正确值。

## 三、形式化与数学基础
冲突判定：

    conflict = exists store s (程序序在前): addr(s) == addr(load) 且 load 已投机完成
    若冲突 -> 标记 load 误推测, 触发恢复。

## 四、代码实现
```c
void check_disambig(int load_rob, uint64_t addr) {
    for (int i = stq_head; i != stq_tail; i = (i+1)&M) {
        if (stq[i].valid && stq[i].addr == addr) {
            if (stq[i].rob_idx > load_rob) recover(load_rob); // 真冲突
        }
    }
}
```

## 五、与其他技术对比
保守策略（load 等所有前序 store 地址）安全但慢；投机消歧更快但需检测与回滚硬件。

## 六、常见误区
误以为 load 可无代价提前；冲突检测回滚有延迟代价。误以为消歧总能提升性能。

## 七、与开源书/权威来源对应
Hennessy & Patterson 论述 load 投机与冲突检测。

## 八、面试题
1. 内存消歧为何可能需回滚？答：若与 store 真冲突则投机错误。
2. 保守策略缺点？

## 九、演进与趋势
store 地址预测、更早地址计算优化消歧准确率。

## 十、小结
内存消歧通过 load 投机隐藏 store 地址延迟，但需硬件冲突检测与回滚作为保障。
