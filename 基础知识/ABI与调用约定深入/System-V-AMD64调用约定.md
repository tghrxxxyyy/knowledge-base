# System V AMD64 调用约定

> 对应 Bryant & O'Hallaron《CSAPP》第 3.7 节；System V AMD64 ABI 规范。

## 一、背景与挑战
不同编译器、语言须就函数如何传参、返回值、用哪些寄存器达成一致的二进制接口（ABI），否则链接后运行即崩。

## 二、核心原理
System V AMD64 用寄存器优先传参：整型/指针依次用 rdi, rsi, rdx, rcx, r8, r9；浮点用 xmm0-7；超出部分压栈（右到左）。返回值经 rax（及 rdx 对 128 位）；被调用者保存 rbx, rbp, r12-r15。

## 三、形式化与数学基础
第 $i$ 个整型参数寄存器：
$$reg(i) = [rdi,rsi,rdx,rcx,r8,r9][i],\quad i<6$$
否则栈槽偏移 $8 \times (i-5)$。浮点类独立寄存器集 xmm0..xmm7，不占整数序。

## 四、代码实现
```asm
# 调用 f(a,b,c,d,e,f,g)
mov rdi, a
mov rsi, b
mov rdx, c
mov rcx, d
mov r8,  e
mov r9,  f
push g          ; 第7个参数入栈
call f
```

## 五、与其他技术对比
Microsoft x64 用 rcx,rdx,r8,r9 且栈上预留 home space；System V 不预留。二者不二进制兼容，跨平台需分别编译。

## 六、常见误区
1. 忘记第 7+ 参数入栈顺序（右到左）。
2. 忽略 16 字节栈对齐（call 前 rsp%16==0 要求）。
3. 浮点/整型寄存器独立计数易混。

## 七、与开源书/权威来源对应
CSAPP 3.7；System V AMD64 ABI 官方文档；CyC2018/CS-Notes 图解。

## 八、面试题
问：前六个整参用哪些寄存器？第7个怎么传？为何要栈对齐？

## 九、演进与趋势
调用约定稳定多年；向量调用（AVX）扩展参数分类；ABI 工作组持续修订。

## 十、小结
System V AMD64 以寄存器优先加栈兜底定义参数传递，是 Linux 生态二进制兼容基石。
