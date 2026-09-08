# 物理寄存器文件与RAT

> 对应 Hennessy & Patterson《Computer Architecture》。

## 一、背景与挑战
重命名需要一个大得多的实际寄存器堆（PRF）存放多版本值，并由 RAT 将架构寄存器映射到物理项。二者协同实现乱序与快速恢复。

## 二、核心原理
PRF 持有所有架构可见与投机值。RAT 每架构寄存器指向当前最新物理项；检查点机制在分支处保存 RAT 快照，便于错误投机恢复。

## 三、形式化与数学基础
映射与回收：

    free_list 维护空闲物理项;
    RAT[a] 变更时旧项入 pending_free;
    提交回收 / 恢复时回滚 free_list 与 RAT。

## 四、代码实现
```c
int RAT[32];
int PRF[PHYS][2]; // [值, 就绪]
int checkpoint_rat[NC][32];
void checkpoint(int c) { memcpy(checkpoint_rat[c], RAT, sizeof RAT); }
void restore(int c) { memcpy(RAT, checkpoint_rat[c], sizeof RAT); }
```

## 五、与其他技术对比
架构寄存器堆固定 32 项受限；PRF 数百项支持重命名与多版本；代价是多端口与映射管理。

## 六、常见误区
误以为 PRF 越多越好；面积与端口延迟限制。误以为 RAT 不需检查点。

## 七、与开源书/权威来源对应
Hennessy & Patterson 描述 PRF、RAT 与检查点恢复。

## 八、面试题
1. 检查点 RAT 用于什么？答：快速恢复投机错误。
2. 物理寄存器何时真正空闲？

## 九、演进与趋势
数据捕获（结果直接经旁路不写 PRF）减少 PRF 写端口压力。

## 十、小结
PRF 与 RAT 构成重命名的物理基础，配合检查点实现高效乱序与恢复。
