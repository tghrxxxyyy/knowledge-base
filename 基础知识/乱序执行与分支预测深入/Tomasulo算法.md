# Tomasulo算法

> 对应 Hennessy & Patterson 第3章；经典 Tomasulo 1967 IBM 360/91 浮点调度。

## 一、背景与挑战

如何用硬件动态调度、自动越过无关指令并消除 WAR/WAW，避免编译器调度的局限。

## 二、核心原理

核心结构：保留站(Reservation Station)缓存等待操作数的指令、每站有值或“产生者标签”；寄存器文件存状态(值或标签)。执行单元完成时通过“公共数据总线(CDB)”广播(标签,值)，匹配标签者接收。寄存器重命名隐含于保留站标签中。

## 三、形式化 / 数学基础

当指令 $I$ 源为寄存器 $r$，查 RAT：若 $r$ 指向就绪值则取之，否则记录产生者标签 $t$。完成后 CDB 广播 $(t,v)$，所有等待 $t$ 的站更新：

$$operand \leftarrow v \quad if\ pending\_tag == t$$

标签分配保证 WAW/WAR 被重命名为不同物理目的地。

## 四、代码实现

```c
# 伪代码：发射时绑定标签
def issue(instr):
    rs = alloc_rs()
    rs.op = instr.op
    rs.src1 = val_or_tag(instr.r1)
    rs.src2 = val_or_tag(instr.r2)
    RAT[instr.rd] = rs.tag   # 重命名：后续读 rd 等到此标签
```

## 五、与其他技术对比

- Tomasulo 动态、硬件完成重命名；编译器静态调度无此弹性。
- 现代实现把 RAT/PRF 显式化（见寄存器重命名）。

## 六、常见误区

- 误以为 Tomasulo 不重命名：其实标签机制即隐式重命名。
- 混淆保留站与 ROB：前者调度，后者顺序提交。

## 七、与开源书 / 权威来源对应

- Hennessy & Patterson《Computer Architecture: A Quantitative Approach》
- CSAPP 中文笔记：https://github.com/Hansimov/csapp

## 八、面试题

- CDB 作用？答：结果广播，匹配标签的保留站接收，实现唤醒。
- Tomasulo 如何消除 WAR？答：重命名使读写指向不同物理位置。

## 九、演进与趋势

现代将保留站与重命名表/物理寄存器文件分离，规模更大。

## 十、小结

Tomasulo 用标签+CDB 实现硬件动态调度与隐式重命名，是乱序执行的理论基石。
