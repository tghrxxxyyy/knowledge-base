# System V AMD64 调用约定

> 对应 Bryant & O'Hallaron《Computer Systems: A Programmer's Perspective》第 3.7 节；System V AMD64 ABI（x86-64 psABI）官方规范；Agner Fog《Calling Conventions》手册。

## 一、背景与挑战

不同编译器、不同语言、甚至同一编译器的不同版本，必须就「函数如何传参、返回值放哪、哪些寄存器 caller/callee 各自负责保存」达成一致，这个二进制层面的契约就是 ABI（Application Binary Interface）。若约定不一致，链接能通过但运行即崩——因为调用方和被调方对寄存器布局的理解不同。System V AMD64 ABI 是 Linux/macOS/BSD 等类 Unix 系统的事实标准，也是理解反汇编、手写汇编、FFI（外部函数接口）与 JIT 编译器不可绕过的基础。

## 二、核心原理

System V AMD64 采用**寄存器优先**传参：整型与指针参数依次使用 rdi, rsi, rdx, rcx, r8, r9；浮点参数依次使用 xmm0..xmm7；第 7 个及之后的参数按**右到左**压栈。返回值经 rax（128 位整数再用 rdx 携带高位）；浮点返回值走 xmm0。寄存器保存责任划分：调用者保存（caller-saved，易被函数破坏，调用方若需保留须自己存）rdi, rsi, rdx, rcx, r8, r9, r10, r11 及 xmm0..xmm15；被调用者保存（callee-saved，函数须原样恢复）rbx, rbp, r12..r15, rsp。调用前 `rsp` 必须 16 字节对齐（call 指令再压 8 字节返回地址，使被调入口处 rsp%16==8）。

## 三、形式化与数学基础

第 $i$ 个整型参数（0 基）的寄存器映射：

$$
reg(i) = [rdi, rsi, rdx, rcx, r8, r9][i],\quad i < 6
$$

第 7 个起落入栈，偏移为 $8 \times (i - 5)$（相对栈顶，右到左）。浮点类使用独立寄存器集 xmm0..xmm7，不占用整数序。返回值位宽：

$$
ret \in \begin{cases}
rax & |ret| \le 64 \\
(rax, rdx) & 64 < |ret| \le 128
\end{cases}
$$

对齐约束：$\forall\ entry,\ rsp \equiv 0 \pmod{16}$ 于 `call` 之前。这一约束是 SSE 指令（要求 16 字节对齐操作数）能安全生成的前提。

## 四、代码实现

```asm
# 调用 f(a,b,c,d,e,f,g)，第 7 个参数 g 入栈
mov  rdi, a
mov  rsi, b
mov  rdx, c
mov  rcx, d
mov  r8,  e
mov  r9,  f
push g                 # 第 7 个参数，右到左实际只有一个时即栈顶
call f
add  rsp, 8            # 调用方负责清栈
# 返回值在 rax
```

```asm
# 被调函数序言/尾声示例（保留 callee-saved 寄存器）
f:  push rbp
    mov  rbp, rsp
    push rbx            ; rbx 是 callee-saved，须保存
    ...                 ; 函数体可自由使用 rdi..r11 / xmm0..xmm15
    pop  rbx
    pop  rbp
    ret
```

## 五、与其他技术对比

| 维度 | System V AMD64 | Microsoft x64 | 32 位 cdecl |
|------|----------------|---------------|-------------|
| 整参寄存器 | rdi..r9（6 个） | rcx,rdx,r8,r9（4 个） | 无，全栈 |
| 浮参寄存器 | xmm0..xmm7 | xmm0..xmm3 | 无 |
| 栈上 home space | 不预留 | 预留 32 字节影子空间 | 不适用 |
| 栈对齐 | call 前 16 字节 | 16 字节 | 4 字节 |

## 六、常见误区

1. 忘记第 7+ 参数入栈顺序为**右到左**，多个栈参数时顺序易错。
2. 忽略 `call` 前 `rsp` 必须 16 字节对齐，否则 SSE 存取可能触发 #GP。
3. 浮点与整数寄存器**独立计数**，误以为传了浮点会占用整数名额。
4. 误用 caller-saved 寄存器跨调用：r10/r11 等在被调函数里可能被破坏，需调用方先保存。
5. 以为 callee-saved 寄存器「一定被保存」——只有被调真正用到并修改时才需压栈，未用则不保存。

## 七、与开源书·权威来源对应

- CSAPP 第 3.7 节：以实例讲解 x86-64 过程调用与寄存器使用。
- System V AMD64 ABI（x86-64 psABI）：寄存器序、保存责任、对齐的权威定义。
- Agner Fog《Calling Conventions for different C++ compilers》：跨平台调用约定对照。

## 八、面试题

1. 前六个整参用哪些寄存器？答：rdi, rsi, rdx, rcx, r8, r9。
2. 第 7 个参数怎么传？答：按右到左压栈；返回值仍在 rax。
3. 为何要 16 字节栈对齐？答：SSE 指令要求 16 字节对齐的内存操作数，ABI 据此约定 call 前对齐以简化代码生成。
4. 哪些寄存器调用后可能变？答：caller-saved 的 rdi..r11、xmm0..xmm15；callee-saved 的 rbx,rbp,r12..r15 由被调负责恢复。

## 九、演进与趋势

调用约定核心框架多年稳定，但随 AVX/AVX-512 扩展，向量参数分类与 xmm 寄存器数量（至 xmm15）持续细化；ABI 工作组还讨论新增指令（如 rsp 之外的新栈相对寻址）等细节。Red Hat 维护的 x86-64 psABI 文档是持续演进的权威来源，具体以官方最新文档为准。

## 十、小结

System V AMD64 以「寄存器优先 + 栈兜底」定义了参数传递、返回值与寄存器保存责任的完整契约，是 Linux 生态二进制兼容的基石。掌握它，才能读懂函数序言/尾声、手写正确的内联汇编与链接多语言模块。
