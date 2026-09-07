# 强符号弱符号与COMMON块处理

> 对应 Bryant & O'Hallaron《CSAPP》第 7.4-7.5 节；Levine《Linkers and Loaders》第 5 章。

## 一、背景与挑战
C 允许同一全局名在多处声明，未初始化变量在不同编译单元可能冲突，链接器需要可预测规则，否则多重定义应报错的要报错，可合并的要合并。

## 二、核心原理
强符号：函数与已初始化全局。弱符号：未初始化全局（及 __attribute__((weak))）。决议规则：强+强冲突报错；强+弱取强；弱+弱任选其一（COMMON 模型下合并大小取最大）。Fortran/C 的 COMMON 块即此类合并。

## 三、形式化与数学基础
设同名定义集合 $D=\{d_1,...,d_n\}$，强弱函数 $w(d)\in\{0,1\}$：
$$chosen = \begin{cases} error & \text{if } \sum w(d_i) > 1 \\ d_{\max w} & \text{otherwise} \end{cases}$$
COMMON 合并大小 $size = \max_i size(d_i)$。

## 四、代码实现
```c
// 声明强弱
int strong = 1;                 // 强符号
int weak;                       // 弱符号 -> COMMON
__attribute__((weak)) void f(){} // 弱函数，可被覆盖
```

## 五、与其他技术对比
传统 a.out 用 COMMON 延迟决议；ELF 默认用 .bss 弱符号，行为更确定；weak 属性显式化覆盖点，便于插件与桩。

## 六、常见误区
1. 未初始化全局当强符号——其实进 COMMON，多个不报错。
2. 头文件定义 int x 导致多份弱符号，size 一致尚可，类型不一则 UB。
3. 以为 inline 一定弱——外部链接 inline 仍需一份强定义（C99）。

## 七、与开源书/权威来源对应
CSAPP 7.4-7.5 用 gcc -fno-common 演示冲突；Levine ch5 讲 COMMON 语义。

## 八、面试题
问：两个未初始化全局同名会怎样？strong+weak 如何选？-fno-common 作用？

## 九、演进与趋势
LTO 把符号决议提前到 IR 层，COMMON 语义在 Whole Program 下被更严格类型检查替代。

## 十、小结
强弱符号规则把多定义冲突收敛为可预测决议，COMMON 机制兼容历史遗留合并需求。
