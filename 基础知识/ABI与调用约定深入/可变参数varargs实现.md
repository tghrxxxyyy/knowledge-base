# 可变参数varargs实现

> 对应 Bryant & O'Hallaron《CSAPP》第 3.7 节；System V AMD64 ABI varargs 规则。

## 一、背景与挑战
printf 等接受不定数量、类型的参数。调用约定须保证被调能从寄存器与栈中按顺序取参，且不依赖类型信息。

## 二、核心原理
x86-64 上，前 5 个整参在 rdi..r9、浮点在 xmm0..xmm7，多余落栈。va_list 结构记录当前抓取位置（gp 寄存器区、fp 寄存器区、栈溢出区及偏移）。va_arg 据请求类型推进对应指针并取值。

## 三、形式化与数学基础
va_list 偏移推进：
$$off = \begin{cases} gp\_off += 8 & INTEGER \\ fp\_off += 16 & SSE \\ stack\_off += 8 & overflow \end{cases}$$
源地址 $=\ reg\_save\_area + off$ 或 $overflow\_arg\_area + stack\_off$。

## 四、代码实现
```c
#include <stdarg.h>
int sum(int n, ...) {
    va_list ap; va_start(ap, n);
    int s = 0;
    for (int i=0;i<n;i++) s += va_arg(ap, int);
    va_end(ap); return s;
}
```

## 五、与其他技术对比
cdecl（32 位）全栈传递使 va_arg 简单；x86-64 因寄存器传参需 reg_save_area 暂存，va_list 更复杂但更快。

## 六、常见误区
1. 用错 va_arg 类型导致读错寄存器/栈区。
2. 忘记 va_end 致未定义行为。
3. 可变参数无法类型安全，错误类型静默错读。

## 七、与开源书/权威来源对应
CSAPP 3.7 varargs；System V AMD64 ABI；CyC2018/CS-Notes。

## 八、面试题
问：va_list 存什么？为何 x86-64 的 varargs 复杂？va_arg 如何取值？

## 九、演进与趋势
C23 引入类型安全的可选参数提案探索；多数 API 转向显式数组/结构体。

## 十、小结
varargs 借 reg_save_area 与偏移游标在寄存器+栈混合布局上重建参数序列。
