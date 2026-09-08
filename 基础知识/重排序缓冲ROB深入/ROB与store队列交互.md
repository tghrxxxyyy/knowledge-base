# ROB与store队列交互

> 对应 Hennessy & Patterson《Computer Architecture》与 Intel SDM 卷3。

## 一、背景与挑战
store 指令在乱序执行中完成计算但不立即写内存（否则破坏顺序与异常语义）。store 队列（STQ）暂存地址与数据，待提交时按序写内存。

## 二、核心原理
store 在 ROB 中占据表项并写入 STQ（含地址、数据、ROB 索引）。提交时按 ROB 顺序将 STQ 项写入 L1。load 可通过 STQ 做 store-to-load 转发（同地址最新 store 未提交时直接取数）。

## 三、形式化与数学基础
load 取值规则：

    value = 最新 (按程序序) 且地址匹配的未提交 store 数据,
            否则来自缓存/L1.

## 四、代码实现
```c
struct stq_entry { uint64_t addr; uint64_t data; int rob_idx; int valid; };
uint64_t load_with_forward(uint64_t a) {
    for (int i = stq_head; i != stq_tail; i = (i+1)&M)
        if (stq[i].valid && stq[i].addr == a) return stq[i].data; // 转发
    return l1_read(a);
}
```

## 五、与其他技术对比
无 STQ 则 store 必须早写内存，破坏投机与异常语义；STQ 将内存写延迟到提交，保证顺序与精确异常。

## 六、常见误区
误以为 store 完成即写内存；需提交才生效。误以为 load 总读缓存，忽略 STQ 转发。

## 七、与开源书/权威来源对应
Hennessy & Patterson 描述 STQ 与 store 提交；Intel 内存模型涉及写可见顺序。

## 八、面试题
1. store 何时真正写内存？答：ROB 提交时按序写入。
2. store-to-load 转发作用？

## 九、演进与趋势
STQ 容量与内存消歧（memory disambiguation）影响 load 提前能力。

## 十、小结
STQ 与 ROB 协同，将 store 的内存写推迟到提交并按序生效，同时支持转发以隐藏延迟。
