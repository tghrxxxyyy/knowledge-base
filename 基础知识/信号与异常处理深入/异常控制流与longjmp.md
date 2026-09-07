# 异常控制流与longjmp

> 对应 Bryant & O'Hallaron《CSAPP》第 8 章异常控制流与 munificent/craftinginterpreters 中错误处理思路。

## 一、背景与挑战
C 无异常机制，深层嵌套调用出错时需逐层返回错误码，冗长易漏。setjmp/longjmp 提供非局部跳转，可在错误处"跳转"回早先保存点，模拟异常退出，但破坏结构化控制流。

## 二、核心原理
`setjmp(env)` 保存当前寄存器/栈上下文到 `jmp_buf` 并返回 0；`longjmp(env, val)` 恢复上下文、令对应 `setjmp` "返回" `val`。这越过中间栈帧直接回到保存点，类似异常 unwind，但不在自动变量析构上做任何清理。

## 三、形式化与数学基础
跳转语义：
$$setjmp(env)=0\; initially;\quad longjmp(env,v) \Rightarrow setjmp(env) "returns" (v\ne0? v:1)$$
被越过栈帧的局部变量处于未定义状态（寄存器变量可能未回写），须用 `volatile` 保活。

## 四、代码实现
```c
jmp_buf env;
if (setjmp(env) != 0) {
    fprintf(stderr, "recovered from deep error\n");
    return 1;
}
deep_parse();   // 内部某处调用 longjmp(env, 1) 跳出
```

## 五、与其他技术对比
longjmp vs try/catch：后者自动栈展开与析构，前者无。vs 错误码返回：后者结构化但冗长。vs 信号：longjmp 不涉内核。

## 六、常见误区
误以为 longjmp 会清理栈对象：不调用析构，资源泄漏。误以为被跳过的变量值可靠：非 volatile 未定义。误以为可在另一线程 longjmp：env 不可跨线程。

## 七、与开源书/权威来源对应
CSAPP 8.5 用 setjmp/longjmp 讲非本地跳转；craftinginterpreters 讨论错误处理权衡。

## 八、面试题
问：longjmp 跳过栈帧为何危险？答：不析构局部对象、变量状态不确定。问：volatile 为何重要？

## 九、演进与趋势
C++ 异常/RAII 取代 longjmp；Go 用 defer+panic/recover 结构化；C 仍偶用 longjmp 写解析器。

## 十、小结
setjmp/longjmp 提供 C 的非局部跳转以模拟异常，但绕过栈清理，须谨慎使用。
