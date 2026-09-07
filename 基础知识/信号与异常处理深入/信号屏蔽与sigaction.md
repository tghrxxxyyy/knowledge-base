# 信号屏蔽与sigaction

> 对应 Kerrisk《The Linux Programming Interface》第 21 章与 Bryant & O'Hallaron《CSAPP》第 8 章。

## 一、背景与挑战
`signal()` 语义历史不一致且处理函数执行期间信号行为依赖实现。现代程序用 `sigaction` 精确控制：指定处理函数、标志、以及处理期间临时屏蔽的信号集，保证可移植与可重入安全。

## 二、核心原理
`sigaction` 填充 `struct sigaction`：`sa_handler/sa_sigaction` 处理入口，`sa_mask` 在处理期间附加阻塞的信号集，`sa_flags` 控制行为（如 `SA_RESTART` 自动重启被中断系统调用，`SA_SIGINFO` 传附带信息）。`sigprocmask` 主动增删阻塞集。

## 三、形式化与数学基础
处理信号 $s$ 时有效阻塞集：
$$mask_{eff} = mask_{base} \cup sa\_mask(s) \cup \{s\}$$
故 $s$ 自身被屏蔽防递归。被阻塞信号停留 `pending`，解除阻塞即递送。系统调用遇信号：`EINTR` 或被 `SA_RESTART` 重启。

## 四、代码实现
```c
struct sigaction sa;
sa.sa_flags = SA_RESTART;
sigemptyset(&sa.sa_mask);
sigaddset(&sa.sa_mask, SIGINT);   // 处理时一并屏蔽 SIGINT
sa.sa_handler = handler;
sigaction(SIGTERM, &sa, NULL);
sigprocmask(SIG_BLOCK, &sa.sa_mask, NULL); // 主动屏蔽
```

## 五、与其他技术对比
`sigaction` vs `signal()`：前者语义确定、可控；后者是前者薄包装且早期不可移植。`sa_mask` 提供临界区式信号互斥。相较互斥锁，信号屏蔽防异步打断而非线程竞争。

## 六、常见误区
误以为 `signal()` 等于 `sigaction`：语义不同。误以为屏蔽信号会丢失：标准信号合并、实时信号排队。误以为 `SA_RESTART` 覆盖所有调用：少数调用（如 `select`）不重启。

## 七、与开源书/权威来源对应
Kerrisk 第 21 章 sigaction/sigprocmask/sa_mask；CSAPP 8.5。

## 八、面试题
问：SA_RESTART 作用？答：被信号中断的系统调用自动重启而非返回 EINTR。问：sigpending 看什么？

## 九、演进与趋势
`signalfd` + epoll 替代部分 sigaction 场景；`SA_RESETHAND` 用于一次性处理。

## 十、小结
sigaction 以精确掩码与标志控制信号的递送与重入边界，是现代信号编程标准接口。
