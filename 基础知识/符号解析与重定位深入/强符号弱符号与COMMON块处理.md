# 强符号弱符号与COMMON块处理

> 对应 Bryant & O'Hallaron《CSAPP》第 7.4-7.5 节；Levine《Linkers and Loaders》第 5 章；并参考 ELF gABI 关于符号绑定（Symbol Binding）与 `SHN_COMMON` 的定义。

## 一、背景与挑战

C 允许同一全局名在多处声明，未初始化变量在不同编译单元中可能冲突。

链接器需要一套可预测规则：多重定义中该报错的要报错，可合并的要合并，不能被某个随机目标文件决定全局语义。

历史上 a.out 用 COMMON 模型延迟决议，ELF 则把「未初始化全局」默认放进 COMMON 节（`SHN_COMMON`），由链接器在最终阶段按规则合并。

强弱符号机制正是为解决「同名多定义」的决议问题而设，是静态链接正确性的基础。

## 二、核心原理

强符号（strong）：已初始化的全局变量、函数定义。

弱符号（weak）：未初始化的全局变量（进 COMMON）、以及用 `__attribute__((weak))` 显式声明的符号。

链接器采用「Unix 链接算法」逐文件扫描：维护未决符号集 U、已定义集 D。

遇到强定义覆盖弱定义；遇到两个强定义报「multiple definition」错误；弱+弱合并，取其中 size 最大者（COMMON 语义）。

`__attribute__((weak))` 让函数可被用户定义覆盖（典型如 `malloc` 钩子、`pthread` 桩），而 `SHN_COMMON` 的 size 在最终布局时取各输入的最大值并分配 `.bss`。

## 三、形式化与数学基础

设同名定义集合 $D=\{d_1,\dots,d_n\}$，强弱函数 $w(d)\in\{0,1\}$：

$$chosen = \begin{cases} error & \text{if } \sum w(d_i) > 1 \\ d_{\max w} & \text{otherwise} \end{cases}$$

COMMON 合并大小：

$$size = \max_i size(d_i)$$

多个弱定义不报错，因为弱意图即「可被覆盖」；强定义出现即终结合并。

## 四、代码实现

```c
// 强弱符号示例
int strong = 1;                        // 强符号（已初始化全局）
int weak;                              // 弱符号 -> SHN_COMMON
__attribute__((weak)) void f(void) {} // 弱函数，可被覆盖

// 若别处提供强定义 void f(void){...}，链接时取强定义
// 若都未提供，weak 引用解析为 0（可用 &f 判空）
```

GCC 10 起默认 `-fno-common`，未初始化全局不再进 COMMON 而直接进 `.bss`。

多个 TU 同名未初始化全局会立即报重复定义，更早暴露错误。

## 五、与其他技术对比

| 模型 | 决议时机 | 多定义行为 | 典型用途 |
| --- | --- | --- | --- |
| a.out COMMON | 延迟 | 合并 | 历史遗留 |
| ELF COMMON | 链接末 | 取最大 size | 兼容 Fortran/C 遗留 |
| `-fno-common` | 编译期 | 立即报错 | 现代默认，早暴露 |
| weak 属性 | 链接期 | 可被覆盖 | 插件/桩/钩子 |

传统 a.out 用 COMMON 延迟决议；ELF 默认用 COMMON 弱符号，行为更确定；weak 属性显式化覆盖点，便于插件与桩。

## 六、常见误区

1. 误以为未初始化全局是强符号：实际进 COMMON，多个不报错（除非 `-fno-common`）。
2. 误以为头文件 `int x;` 安全：多个 TU 包含会产生多份弱符号，size 一致尚可，类型不一则 UB。
3. 误以为 inline 一定弱：外部链接 inline 仍需一份强定义（C99 `inline` 语义），否则链接失败。
4. 误以为 weak 引用一定存在：未提供定义时解析为 0，运行时解引用会段错误，须判空。
5. 误以为 COMMON 大小任意：最终取最大 size，小的 TU 不会缩小已分配空间。

## 七、与开源书·权威来源对应

- CSAPP 7.4-7.5 用 `-fno-common` 演示冲突，并给出链接器符号决议的 Unix 算法。
- Levine《Linkers and Loaders》第 5 章讲 COMMON 语义与历史 a.out 行为。
- ELF gABI 定义 `STB_WEAK`、`SHN_COMMON` 与符号预置（preemption）语义。
- GCC 手册说明 `-fcommon`/`-fno-common` 的默认变更（GCC 10 起 `-fno-common`）。

## 八、面试题

1. 两个未初始化全局同名会怎样？要点：进 COMMON 合并取最大 size；若 `-fno-common` 则报重复定义。
2. strong+weak 如何选？要点：强覆盖弱，链接取强定义。
3. `-fno-common` 的作用？要点：未初始化全局直接进 `.bss`，同名立即报错，更早暴露冲突。
4. weak 属性的典型用途？要点：库提供可覆盖的默认实现（如 `malloc` 钩子、pthread 桩）。

## 九、演进与趋势

- GCC 10 默认 `-fno-common`，使 COMMON 相关隐患在编译期暴露，减少「诡异链接成功」。
- LTO 把符号决议提前到 IR 层，跨 TU 统一检查类型，COMMON 语义在 Whole-Program 下被更严格类型检查替代。
- IFUNC（`STT_GNU_IFUNC`）引入按运行时 CPU 特性选实现的「间接强符号」，模糊了传统强弱边界。

## 十、小结

强弱符号规则把多定义冲突收敛为可预测决议：强+强报错、强覆盖弱、弱+弱合并。

COMMON 机制兼容历史遗留合并需求，而 `-fno-common` 与现代链接器让错误更早暴露，是静态链接正确性的基石。
