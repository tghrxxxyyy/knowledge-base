# 异常控制流与longjmp

> 对应 Bryant & O'Hallaron《Computer Systems: A Programmer's Perspective》第 8 章「异常控制流」、Kerrisk《The Linux Programming Interface》第 6 章，以及 ISO C 标准 7.13 节「非局部跳转」。

## 一、背景与挑战
C 语言没有内建异常机制。深层嵌套调用（递归下降解析器、解释器求值循环、回调驱动的状态机）在出错时只有两条路：逐层返回错误码，或者直接终止进程。错误码方案要求每一层都写 `if (rc == ERR) return ERR;`，冗长、易漏，并且要求所有中间函数的返回类型都能承载错误信息——当函数本已需要用返回值表达业务结果时就会冲突（例如 `read` 既要返回字节数又要返回错误）。

`setjmp`/`longjmp` 提供「非局部跳转」：在深层任意位置一次性跳回早先保存的执行点，效果上等价于一次**不带清理**的异常展开。它绕过了语言的标准控制结构，因此编译器优化、栈帧布局、资源生命周期都不再受语言规则保护——这正是它强大又危险的根源。

## 二、核心原理
`setjmp(env)` 把当前「执行上下文」写入 `jmp_buf` 并返回 0。上下文至少包含返回地址（PC）、栈指针（SP）、被调用者保存寄存器（x86-64 上的 `rbx`、`rbp`、`r12`–`r15`），在部分 ABI 与实现中还包含浮点控制字与信号掩码。之后任意深度的调用中执行 `longjmp(env, v)`，全程不进入内核，纯粹在用户态把寄存器文件恢复成 `setjmp` 时刻的模样，于是控制流「从 `setjmp` 返回」，返回值是 `v`（若 `v == 0` 则实为 1，以区分首次返回）。

关键性质：`longjmp` 只恢复**寄存器**，不恢复**内存**。两次调用之间的所有栈帧被直接抛弃（SP 回退后其内存被后续调用复用），因此没有析构、没有 `fclose`、没有解锁。glibc 的 `setjmp` 会用 `PTR_MANGLE` 对保存的 SP/PC 做异或混淆，防止攻击者通过覆写 `jmp_buf` 劫持控制流；开启 `_FORTIFY_SOURCE` 后 `longjmp` 走 `__longjmp_chk`，会校验目标帧是否仍在当前栈上，跳向已返回的帧直接 `abort`。

## 三、形式化与数学基础
设执行状态为寄存器组 $R$ 与内存 $M$。`setjmp` 保存 $R_0 = R$，`longjmp` 恢复寄存器但不触碰内存：

$$ setjmp(env) = 0,\qquad longjmp(env, v) \Rightarrow R \leftarrow R_0,\; M \text{ 不变} $$

第二类返回的取值为：

$$ setjmp(env)\ \text{在 } longjmp(v) \text{ 后返回}\ \begin{cases} 1 & v = 0 \\ v & v \ne 0\end{cases} $$

由此可推出「跳过的变量不可靠」这一规则的精确条件：对在 `setjmp` 与 `longjmp` 之间被修改的自动变量 $x$，

$$ \left(x \notin volatile\right) \lor \left(x \text{ 未被分配到内存}\right) \Rightarrow value(x)\ \text{未定义} $$

栈回退把栈指针从深度 $d_1$ 恢复到 $d_0$，中间帧 $F_{d_0+1},\dots,F_{d_1}$ 的内存被标记为可复用而非清零，这就是「值可能被后续调用覆写」的形式化来源。跳转代价为 $O(1)$：只写/读固定大小的 `jmp_buf`，不随栈深度增长——这与基于表的栈展开形成根本对比。

## 四、代码实现
```c
#include <setjmp.h>
#include <stdio.h>

static jmp_buf env;

static void deep(int depth) {
    char scratch[256];                 /* 中间帧的局部数组 */
    scratch[0] = (char)depth;
    if (depth == 0) longjmp(env, 42);  /* 从最深栈帧一次性跳出 */
    deep(depth - 1);
}

int main(void) {
    int rc = setjmp(env);              /* 首次返回 0 */
    if (rc != 0) {                     /* longjmp 后回到这里 */
        printf("unwound with code %d\n", rc);
        return 0;
    }
    deep(64);
    return 1;                          /* 不可达 */
}
```

下面演示 `volatile` 的必要性，以及信号处理中必须使用 `sigsetjmp`。

```c
volatile int keep = 0;   /* 必须 volatile，否则可能常驻寄存器 */
int lost = 0;
if (setjmp(env) == 0) { keep = 1; lost = 1; deep(8); }
/* 回到此处：keep 保证可见，lost 的值未定义 */

sigjmp_buf sig_env;
if (sigsetjmp(sig_env, 1) == 0) {
    /* 第二参数非 0 表示同时保存信号掩码 */
} else {
    /* siglongjmp(sig_env, 1) 会一并恢复信号掩码 */
}
```

## 五、与其他技术对比
| 维度 | longjmp | 错误码返回 | C++ 异常 | Go panic/recover |
| --- | --- | --- | --- | --- |
| 栈展开方式 | 直接回退 SP，不展开 | 逐层显式返回 | 逐帧调用析构（表驱动或 SJLJ） | 逐帧执行 defer |
| 资源清理 | 无，需手工 | 由调用者负责 | RAII 自动 | defer 自动 |
| 运行时开销 | $O(1)$，无元数据表 | 每个调用点判断分支 | 零成本（.eh_frame）或 SJLJ | 每次 defer 有记录开销 |
| 跨线程 | 未定义行为 | 天然安全 | 未定义行为 | 安全 |
| 类型安全 | 无 | 弱 | 强 | 弱（interface{}） |
| 典型用途 | 解析器、协程栈切换 | 系统调用 | 通用错误路径 | 通用错误路径 |

## 六、常见误区
- **以为会析构或释放资源**：`longjmp` 不调用任何清理代码。`malloc` 得到的块、持有的互斥锁、打开的文件都会泄漏或永久锁死；锁泄漏尤其致命，往往演变为整个进程死锁。
- **以为跳过的局部变量值可靠**：只有 `volatile` 限定且取过地址的变量才有保证。未定义行为有两个来源——值被优化进寄存器未回写，以及值虽在内存但被后续栈帧覆写。
- **以为可以跨线程 `longjmp`**：`jmp_buf` 内嵌该线程的栈指针，跳到另一线程的栈上必然破坏内存，属未定义行为，`__longjmp_chk` 会直接拒绝。
- **以为可以在信号处理函数里安全 `longjmp`**：必须用 `sigsetjmp`/`siglongjmp` 且 `savesigs` 非零，否则信号掩码不一致，从处理函数返回后中断行为异常。
- **以为 `setjmp` 是普通函数**：它是宏，且 C 标准限制它只能出现在 `if`、`switch`、比较、循环条件等少数上下文中；把返回值赋给变量后再判断会丧失第二类返回语义。
- **以为 `longjmp(env, 0)` 能传递「0」**：它会被规范化为 1，因此不能用 0 表示成功。

## 七、与开源书·权威来源对应
- Bryant & O'Hallaron《Computer Systems: A Programmer's Perspective》第 8 章 8.5 节以 `setjmp`/`longjmp` 讲解非局部跳转，并将其定位为实现异常机制的低层原语。
- Kerrisk《The Linux Programming Interface》第 6 章对比 `setjmp` 与 `sigsetjmp`，说明信号掩码保存的语义差异与使用场景。
- ISO C 标准 7.13 节规定 `jmp_buf`、`setjmp`、`longjmp` 的接口与未定义行为边界（含「跳向已返回的函数」这一禁区）。
- Love《Linux Kernel Development》中关于异常与中断的讨论可对照理解「异常控制流」的两个层次：内核层用硬件机制，用户层用 `longjmp` 模拟。
- Brewer 等人关于 SJLJ 异常实现的编译器文档（GCC `-fsjlj-exceptions`）说明同一原语如何被用于语言运行时。

## 八、面试题
1. **为什么 `longjmp` 之后局部变量的值可能不可靠？**
   要点：中间栈帧内存被复用；非 `volatile` 变量不保证可见性；寄存器变量未回写。解法是 `volatile` 或把状态放到堆/静态区。
2. **`setjmp` 返回 0 与 `longjmp(env, 0)` 的关系？**
   要点：`longjmp` 第二参数为 0 时 `setjmp` 返回 1，以保证能区分首次返回，因此返回值 0 不能承载「正常」语义。
3. **`longjmp` 与 C++ 异常在实现上的根本区别？**
   要点：前者只恢复寄存器、不做栈展开；后者依赖 `.eh_frame`/`.gcc_except_table` 或 SJLJ 链逐帧调用析构。二者混用属未定义行为，会跳过析构并破坏异常表状态。
4. **在信号处理函数中如何正确跳出？**
   要点：`sigsetjmp`/`siglongjmp` 且保存信号掩码；只能调用 async-signal-safe 函数；跳出后应重新检查被阻塞的信号集。
5. **`_FORTIFY_SOURCE` 下 `longjmp` 做了什么额外检查？**
   要点：反混淆被混淆的 SP/PC；校验目标栈帧仍位于同一栈且未返回；失败则终止进程而非跳转。

## 九、演进与趋势
主流语言逐步放弃 `longjmp` 风格的错误处理：C++ 用 RAII 与零成本异常，Go 用 `defer` + `panic`/`recover` 保证展开时执行清理，Rust 用 `Result` 把错误显式编码进类型，Zig 用 `errdefer`。但 `longjmp` 仍活跃在两处：一是 C 生态的解析器与轻量解释器——Lua 的错误抛出（`lua_error` 到 `lua_pcall` 的捕获路径）就是典型；二是协程与用户态线程的栈切换原语，`ucontext`、`boost.context`、各类 fiber 库都以保存/恢复寄存器组为核心，与 `setjmp` 同源。此外编译器还提供语义更弱的 `__builtin_setjmp`（不保存信号掩码、不保证浮点寄存器），适合作为语言运行时内部的轻量原语。可以预期，只要存在「栈式语言运行时 + 低成本异常捕获」的需求，这一原语就不会消失。

## 十、小结
`setjmp`/`longjmp` 用「保存并恢复寄存器组」实现了 C 的非局部跳转，以 $O(1)$ 代价换取跨越任意深度的控制转移，代价是完全绕过栈清理与类型系统。使用时必须同时满足三条纪律：目标帧仍然存活、跨过的资源显式回收、被跨越的变量用 `volatile` 或堆对象保存。它既是理解「异常控制流」这一抽象的最简实现，也是现代协程栈切换与 SJLJ 异常模型的技术源头。
