# 溢出调度与Store-Load代价

> 对应 Briggs 1992（改进图着色与溢出）；Chaitin 1982。

## 一、背景与挑战
当变量多于寄存器，必须把部分变量 spill 到栈。简单 spill 在每个使用点插 load、定义点插 store，代价高昂，需要把溢出代价纳入决策。

## 二、核心原理
Briggs 提出基于使用频率的 spill 成本：高使用、低度的变量应优先保留。 spill 后需在每次定义/使用处插入内存访问，并可能拆分存活区间（live range splitting）以减少 spill 范围。

## 三、形式化与数学基础
溢出总成本：
$$C_{spill}(v) = \sum_{u\in uses(v)} w_u \cdot cost(load) + \sum_{d\in defs(v)} w_d \cdot cost(store)$$
其中 $w$ 为执行频次（profile 或静态估计）。分配器选 $\arg\min$ 增量代价。

## 四、代码实现
```c
// 估计 spill 代价
int cost = 0;
for (use u : v.uses) cost += weight(u) * LOAD_COST;
for (def d : v.defs) cost += weight(d) * STORE_COST;
if (cost < KEEP_BENEFIT) spill(v);
```

## 五、与其他技术对比
全局 spill（整存活区间）简单但浪费；live range splitting 仅 spill 冲突段，显著降代价；rematerialization 用重算替代 reload。

## 六、常见误区
1. 以出现次数而非执行频次算代价——热循环 spill 灾难性。
2. 忽略 spill 引入的新干涉边，需重算图。
3. 过度拆分使分配碎片化。

## 七、与开源书/权威来源对应
Briggs 1992 (PLDI) 溢出模型；Appel ch11 讲 splitting；Chaitin 1982。

## 八、面试题
问：spill 代价怎么估？live range splitting 作用？rematerialization 是什么？

## 九、演进与趋势
基于 ML 的代价模型与 profile-guided spill 决策进一步提升密集循环表现。

## 十、小结
溢出不是失败而是权衡，精确的频率感知代价模型决定 spill 对性能的真实影响。
