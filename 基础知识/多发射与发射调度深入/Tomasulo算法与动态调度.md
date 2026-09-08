# Tomasulo算法与动态调度

> 对应 Hennessy & Patterson《Computer Architecture》。

## 一、背景与挑战
传统按序发射在遇到长延迟操作（如浮点、cache 缺失）时整条流水线停顿。Tomasulo 通过寄存器重命名与保留站实现乱序执行、乱序完成。

## 二、核心原理
每条指令在发射时分配保留站与物理寄存器（重命名），操作数一旦就绪即从 CDB（公共数据总线）前递，源操作数「按名」而非「按序」获取，从而消除 WAR/WAW 伪相关。

## 三、形式化与数学基础
映射表 RAT 将逻辑寄存器映射到保留站/物理寄存器：

    phys = RAT[logical]
    结果产生时广播 (phys_tag, value) 于 CDB, 匹配者捕获。

## 四、代码实现
```c
struct rs { int busy; int op; int src1, src2; int rdy1, rdy2; int dst_tag; };
void issue(instr *i) {
    int s = alloc_rs();
    rs[s].src1 = RAT[i->rs1]; rs[s].src2 = RAT[i->rs2];
    rs[s].dst_tag = new_tag();
    RAT[i->rd] = rs[s].dst_tag;  // 重命名
}
```

## 五、与其他技术对比
Tomasulo 用重命名消除 WAR/WAW，优于记分牌；但乱序完成需 ROB 保证提交顺序与精确异常。

## 六、常见误区
误以为 Tomasulo 本身保证按序提交；需配合 ROB。误以为重命名无限，实际物理寄存器有限会引入停顿。

## 七、与开源书/权威来源对应
Hennessy & Patterson 以 IBM 360/91 浮点单元讲解 Tomasulo。

## 八、面试题
1. CDB 的作用？答：广播前递结果给等待的保留站。
2. Tomasulo 如何消除 WAW？

## 九、演进与趋势
现代 OoO 核心仍基于 Tomasulo+重命名+ROB 框架。

## 十、小结
Tomasulo 通过保留站与寄存器重命名实现高效的乱序执行，是现代动态调度核心。
