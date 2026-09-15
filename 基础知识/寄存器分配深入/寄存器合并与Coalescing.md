# 寄存器合并与Coalescing

> 对应 Briggs, Cooper & Torczon 1992（Improved Register Allocation by Copy Coalescing, PLDI）与 Chaitin et al. 1982（Register Allocation via Graph Coloring）。

## 一、背景与挑战

寄存器分配后程序里充斥大量拷贝指令（`a = b`）：参数传递、调用约定整形、SSA 的 φ 节点降级都会产生「把值从一处搬到另一处」的 move。这些 move 既占用寄存器又消耗发射/执行带宽。拷贝合并（coalescing）的直觉是：若两端变量不冲突（不会同时活跃），就让它们共享同一个物理寄存器，从而删掉这条 move。但危险在于：合并会引入新的干涉边（两变量的邻居被合并为一个度数更高的节点），可能把一个原本可着色的图变得不可着色，反而逼出 spill——这就是「合并导致更慢」的经典反例，合并决策必须「保可着色性」。

## 二、核心原理

合并把拷贝两端的变量节点融合为单一节点 $m=a\oplus b$，并删除对应 move。Chaitin 的激进合并（aggressive coalescing）直接合并所有不冲突的对，简单但常因度数膨胀而 spill。Briggs 提出保守合并（conservative coalescing）：仅当合并后节点度数仍低于可用颜色数 $K$（或该节点仍可被简化）才提交合并，否则撤销。这保证合并「不会降低可着色性」，即合并后若不 spill 则原图也必可不着色。合并与着色常交错进行：先合并、再简化、遇不可简化的 spill 候选、再回简化，循环至收敛。SSA 形式下 φ 节点是天然的合并候选点，使合并更安全可控。合并后图的邻居度数维护必须在后续简化中持续更新，否则着色判定会出错。

## 三、形式化与数学基础

设 move 对 $(a,b)$ 且 $a,b$ 互不干涉（无公共邻居冲突）。融合节点 $m=a\oplus b$，其邻居集为二者邻居之并（去重）：

$$ adj(m)=adj(a)\cup adj(b) $$

Briggs 安全条件（保留可着色性）：

$$ |adj(m)| < K \;\lor\; \bigl(\exists\,t\in adj(m): |adj(t)|<K-1\bigr) $$

即融合后节点要么度数低于 $K$，要么至少还有一个邻居可简化（图仍可简化）。若不满足则撤销融合，保留原 move。SSA 形式下 φ 节点是天然的合并候选点：

$$ \phi(x_1,\dots,x_n)\ \Rightarrow\ x_1,\dots,x_n\ \text{可安全合并为同一寄存器（若互不干涉）} $$

该不变量使基于 SSA 的合并几乎免费获得大量安全机会，是现代分配器的主流路径。

## 四、代码实现

```c
// 保守合并：仅在保证可着色性时融合
int coalesce(int a, int b, int K) {
    if (interfere(a, b)) return 0;          // 冲突则不可合并
    int m = fuse(a, b);                      // 融合为 m，合并邻居集
    if (degree(m) < K || simplifiable(m, K)) {
        delete_move(a, b);                   // 删掉这条 move
        return 1;
    }
    undo_fuse(m);                            // 撤销，保留原 move
    return 0;
}
```

## 五、与其他技术对比

| 策略 | 质量 | 风险 | 适用 |
| --- | --- | --- | --- |
| 激进合并（Chaitin） | 高（删更多 move） | 易 spill | 局部/小图 |
| 保守合并（Briggs） | 稳 | 几乎不恶化 | 通用 |
| 迭代合并 + spill | 最高 | 实现复杂 | 生产编译器 |
| 基于 SSA | 安全 | 需 SSA 基础设施 | 现代前端 |

现代分配器普遍采用 Briggs 式保守合并，并借 SSA 的 φ 节点自动获得大量安全合并机会。代价是合并后图可能含「巨型节点」，后续简化需更仔细地维护邻居度数，否则回涂阶段出错。

## 六、常见误区

1. 盲目合并致 spill，反而更慢——合并前务必检查度数，遵循保守条件。
2. 忽略合并后需重算冲突图与邻居度数，否则后续简化判定错误。
3. 认为所有 move 都能删——有 ABI 约束、副作用或跨调用约定的 move 不能合并。
4. 以为合并一定提升性能——若合并出的大节点拖累全局着色，得不偿失。
5. 混淆 coalescing 与 rematerialization——前者是合并拷贝，后者是用重算替代 spill 的 load。
6. 以为 φ 节点合并总是免费——仍需校验互不干涉，否则合并冲突变量直接出错。

## 七、与开源书·权威来源对应

- Briggs, Cooper & Torczon 1992（PLDI）：提出保守合并，证明「不降低可着色性的合并」是安全的，奠定现代合并算法。
- Chaitin et al. 1982（PLDI）：图着色分配奠基，含激进合并的早期形式。
- Appel《Modern Compiler Implementation》ch11：给出合并与着色的实现骨架与迭代流程，明确「merge 后必须重新检查可简化性」。
- Aho《Compilers》（龙书）ch8：在活跃分析与分配框架内简述拷贝合并与寄存器干涉。
- Muchnick《Advanced Compiler Design》：从优化编译角度讨论合并与着色的工程权衡。

## 八、面试题

1. 为什么合并可能反而让程序变慢？
   要点：合并引入新干涉边、抬高节点度数，可能使原可着色图变为不可着色，逼出 spill，spill 代价远高于省下的 move。
2. Briggs 保守合并的安全条件是什么？
   要点：融合后度数 $<K$ 或仍存在可简化邻居，保证可着色性不下降。
3. 合并失败如何回退？
   要点：undo_fuse 撤销融合，保留原 move，不影响后续分配。
4. SSA 如何帮助合并？
   要点：φ 节点天然要求多前驱同值，分配器直接在 SSA 上合并，安全性高、机会多。
5. 合并与 spill 如何权衡？
   要点：优先保守合并删 move；若简化阶段出现不可着色，选 spill 代价最小者，再迭代。

## 九、演进与趋势

现代分配器在 SSA 上做「乐观合并」：先合并、spill 时再拆分回退，平衡质量与编译时延。GPU/向量寄存器分配也借鉴 coalescing 思想，合并向量通道拷贝。

- 合并与 live-range splitting 协同，先拆冲突段再合并，减少巨型节点拖累全局着色。
- 过程间合并（跨函数 caller/callee）进一步消除参数传递 move，降低调用开销。
- 机器学习辅助的合并顺序预测正探索用于决定先合哪些对以最小化 spill。

SSA 形式使拷贝合并几乎「免费」：φ 节点天然要求多前驱同一值，分配器直接在 SSA 上做基于 live-range splitting 的合并。更复杂的 live-range splitting 与 rematerialization 与合并协同，进一步压低 spill 率。研究上还提出「乐观合并」（先合并、spill 时再拆分），在质量与复杂度间再平衡；基于 ML 的合并顺序预测也在探索中。

## 十、小结

合并以「可控」方式消除冗余拷贝，是寄存器分配质量跃升的关键后处理：Briggs 保守合并以「不恶化可着色性」为红线，在删 move 与防 spill 间取得平衡。理解其度数约束与 SSA 加成，方能既享受合并红利又避开 spill 陷阱——记住「合并是优化而非免费午餐」。
