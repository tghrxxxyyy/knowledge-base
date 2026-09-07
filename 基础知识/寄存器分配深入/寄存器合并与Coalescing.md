# 寄存器合并与Coalescing

> 对应 Briggs 1992（合并与图着色寄存器分配）；Chaitin 1982。

## 一、背景与挑战
拷贝指令（a=b）浪费寄存器与周期。若能合并 a、b 到同一寄存器，可删掉拷贝。但合并可能增加干涉边，反而逼出 spill。

## 二、核心原理
合并（coalescing）把拷贝两端的变量并入同一节点。Briggs 提出保守合并：仅当合并后节点度数仍低于 $k$（或合并可简化）才进行，避免引入不可着色的干涉。合并后删除冗余 move。

## 三、形式化与数学基础
若 $move(a,b)$ 且 $a,b$ 不干涉则节点融合 $m=a\oplus b$。Briggs 条件：
$$\forall\ \text{merged node } m,\ |adj(m)| < K \text{ 或 } m \text{ 可简化}$$
保留可着色性，否则撤销合并。

## 四、代码实现
```c
// 保守合并
if (!interfere(a, b)) {
    m = fuse(a, b);
    if (degree(m) < K || simplifiable(m))
        coalesce(m);   // 删 move
    else undo(m);
}
```

## 五、与其他技术对比
激进合并（Chaitin）简单但易溢出；Briggs 保守合并保障质量；迭代合并与 spill 交错进行。

## 六、常见误区
1. 盲目合并致 spill 反而更慢。
2. 忽略合并后需重算冲突图。
3. 认为所有 move 都能删——有副作用或 ABI 约束者不能。

## 七、与开源书/权威来源对应
Briggs 1992 (PLDI) coalescing；Chaitin 1982；Appel ch11 实现细节。

## 八、面试题
问：为何合并可能变慢？Briggs 保守合并条件？合并失败如何回退？

## 九、演进与趋势
基于 SSA 的合并更易安全进行（φ 即天然合并点），现代分配器多用 SSA 辅助。

## 十、小结
合并以可控方式消除拷贝，是寄存器分配质量跃升的关键后处理步骤。
