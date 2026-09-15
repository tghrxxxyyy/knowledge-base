# 溢出调度与Store-Load代价

> 对应 Briggs, Cooper & Torczon 1992（Improved Register Allocation by Copy Coalescing, PLDI）与 Chaitin et al. 1982（图着色分配中的 spill 处理）。

## 一、背景与挑战

当变量数超过物理寄存器数 $K$ 且不能全部着色时，必须把部分变量 spill 到栈（内存）。朴素 spill 在每个使用点插入 load、每个定义点插入 store，代价高昂——尤其当被 spill 的变量位于热循环内部、每次迭代都被反复存取。因此 spill 不是「失败」而是权衡：关键是把 spill 代价纳入决策，优先 spill「代价最小」的变量，并通过存活区间拆分（live-range splitting）与重算（rematerialization）降低实际开销。spill 决策的质量，往往比着色算法本身更影响最终性能。

## 二、核心原理

Briggs 提出频率感知的 spill 代价模型：每个变量 $v$ 的总 spill 代价等于其所有使用/定义点的执行频次乘单次 load/store 代价之和。分配器在选择 spill 候选时优先选「代价增量最小」的节点，使整体 spill 开销最低。进一步，完整存活区间 spill 常浪费——只在区间冲突的那一段 spill（splitting），其余段仍用寄存器；或对可廉价重算的值（如常量、简单算术）用 rematerialization 重新计算代替 reload，彻底省掉 load。spill 还会引入新的干涉（spill 代码本身用寄存器），需重算冲突图。高质量的分配器在「简化—spill—重算」间迭代，直到图可 $K$-着色，且每次 spill 选代价最小者，使总 Store/Load 代价受控。

## 三、形式化与数学基础

变量 $v$ 的溢出总成本（含频率权重 $w$）：

$$ C_{spill}(v)=\sum_{u\in uses(v)} w_u\cdot cost(load)+\sum_{d\in defs(v)} w_d\cdot cost(store) $$

其中 $w$ 为执行频次（profile 或静态估计，如循环深度）。分配器在着色失败处选：

$$ spill\ \arg\min_{v} \bigl(C_{spill}(v)\ \text{s.t. removing }v\text{ 使图可 }K\text{-着色}\bigr) $$

live-range splitting 把 $v$ 拆为若干子区间，仅 spill 冲突子段；rematerialization 用 $cost(recompute)$ 替代 $cost(load)$，当 $cost(recompute)<cost(load)$ 时优先重算。设子区间 $v_i$ 的 spill 代价 $c_i$，拆分后总代价：

$$ C_{split}(v)=\sum_i \min(c_i,\ cost(recompute(v_i))) $$

显著低于整区间 spill 的 $C_{spill}(v)$，尤其热循环中只 spill 跨调用段时。

## 四、代码实现

```c
// 估计 spill 代价，按频率加权
int spill_cost(var *v) {
    int cost = 0;
    for (use u : v->uses) cost += u.weight * LOAD_COST;
    for (def d : v->defs) cost += d.weight * STORE_COST;
    return cost / (degree(v) + 1);   // 度数高暗示冲突严重
}

void choose_spill(graph *G, int K) {
    while (!colorable(G, K)) {
        var *v = min_by(G->nodes, spill_cost);   // 选代价最小者
        split_or_spill(v);                        // 拆分或直接 spill
        rebuild_interference(G);                  // spill 引入新干涉，重算
    }
}
```

## 五、与其他技术对比

| 策略 | 质量 | 代价 |
| --- | --- | --- |
| 整区间 spill | 简单 | 浪费（非冲突段也 spill） |
| live-range splitting | 高 | 实现复杂、区间碎片化 |
| rematerialization | 高 | 仅适用于可廉价重算值 |
| 频率感知选择 | 高 | 需 profile/静态估计 |

全局 spill 简单但浪费；拆分与重算显著降代价，是现代分配器标配。三者常组合：先拆分到冲突段，再对可重算子段用 rematerialization，最后仅 spill 真正必要的子段。

## 六、常见误区

1. 以「出现次数」而非「执行频次」算代价——热循环内低出现、高执行的变量被漏判，spill 灾难性。
2. 忽略 spill 引入的新干涉边，未重算冲突图导致后续着色错误。
3. 过度拆分使区间碎片化，反而增加分配与调度复杂度。
4. 以为 spill 是分配失败——它是正常的资源权衡，频率感知能把它控制在最小。
5. 忽略 rematerialization 的适用面——常量、栈地址、简单移位等重算比 reload 更省。
6. 以为 spill 只影响性能——过多 spill 还会增大代码体积与指令缓存压力。

## 七、与开源书·权威来源对应

- Briggs, Cooper & Torczon 1992（PLDI）：给出频率感知的 spill 代价模型与迭代着色-spill 流程。
- Appel《Modern Compiler Implementation》ch11：详述 live-range splitting 与 spill 代码插入。
- Chaitin et al. 1982：最早在图着色框架内处理 spill（「potential spill」机制）。
- Muchnick《Advanced Compiler Design》：从优化编译视角讨论 spill 与 rematerialization。
- Aho《Compilers》（龙书）ch8：在分配框架下简述 spill 的代价权衡。

## 八、面试题

1. spill 代价怎么估计才合理？
   要点：按执行频次加权每处 load/store 代价，而非简单计数；热路径优先避免 spill。
2. live-range splitting 的作用？
   要点：只 spill 冲突的那段存活区间，其余段仍留寄存器，显著降低实际内存访问。
3. rematerialization 是什么？何时用？
   要点：用重算代替 reload，适用于常量/廉价可重算值，当重算代价低于 load 时优先。
4. spill 为何要重算冲突图？
   要点：spill 插入的 load/store 自身用寄存器、且拆分改变区间，引入新干涉边。
5. 为什么不能只按出现次数选 spill？
   要点：出现少但热循环内的变量代价远高于出现多却冷的路径，频次才是真实代价。

## 九、演进与趋势

基于 ML 的 spill 代价模型与 profile-guided 决策进一步提升密集循环表现；SSA 上的拆分更精确；splitting 与 coalescing 协同（先拆后合）成为高质量分配器的核心循环。联合调度（unified regalloc + scheduling）在 spill 插入点选择上协同指令调度，进一步降低 spill 的流水级代价。JIT 中则用轻量 spill 启发式控制编译时延。

## 十、小结

溢出不是分配的失败而是资源权衡，精确的「频率感知代价模型」决定 spill 对性能的真实影响。配合 live-range splitting 与 rematerialization，可以把 spill 代价压到最低——关键在于「spill 谁、spill 哪一段」，而非「是否 spill」。理解这三者的协同，是高质量寄存器分配器的分水岭。
