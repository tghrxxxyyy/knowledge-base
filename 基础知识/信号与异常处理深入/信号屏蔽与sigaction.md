# 信号屏蔽与sigaction

> 对应 Kerrisk《The Linux Programming Interface》第 21 章「信号：信号处理器」，以及 Bryant & O'Hallaron《Computer Systems: A Programmer's Perspective》第 8 章异常控制流。

## 一、背景与挑战
早期的 `signal()` 存在两种互不兼容的语义：System V 语义在处理函数执行期间把信号重置为默认动作，BSD 语义则不重置并自动重启被中断的系统调用。更根本的是它无法表达两件关键策略：「处理期间还要屏蔽哪些其他信号」与「是否重启被中断的系统调用」。
`sigaction` 把「处理入口、处理期间附加屏蔽集、行为标志」三者显式分离，使信号递送成为可精确描述的过程。

## 二、核心原理
`sigaction(sig, &act, &oldact)` 的核心是 `struct sigaction`：`sa_handler`（简单处理器）与 `sa_sigaction`（带 `siginfo_t`，需 `SA_SIGINFO`）共用存储；`sa_mask` 给出处理器执行期间**额外**阻塞的信号集；`sa_flags` 控制行为，常用项包括 `SA_RESTART`（自动重启被中断的系统调用）、`SA_SIGINFO`（三参数处理器）、`SA_NODEFER`（不自动屏蔽自身）、`SA_RESETHAND`（进入处理器时重置为默认，等价 System V 语义）、`SA_ONSTACK`（使用 `sigaltstack` 注册的备用栈）、`SA_NOCLDSTOP`/`SA_NOCLDWAIT`（针对 `SIGCHLD`）与 `SA_RESTORER`（glibc 内部登记返回蹦床）。
`sigprocmask(how, &set, &oldset)` 主动修改线程阻塞集，`how` 取 `SIG_BLOCK`/`SIG_UNBLOCK`/`SIG_SETMASK`。多线程程序中 POSIX 规定 `sigprocmask` 行为未定义，应改用 `pthread_sigmask`。
`sigsuspend(&mask)` 是关键原子操作：在**单一系统调用内**替换阻塞集并睡眠直到有信号递送。若拆成 `sigprocmask` + `pause` 两步，两步之间到达的信号会导致永久睡眠（丢唤醒竞态）。
生命周期规则：`fork` 后子进程继承阻塞集；`exec` 后处理函数重置为默认，但**阻塞集保留**——这常导致 `exec` 后的程序莫名不响应某些信号。

## 三、形式化与数学基础
处理信号 $s$ 时的有效阻塞集：

$$ mask_{eff} = mask_{base} \cup sa\_mask(s) \cup \{s\} $$

最后一项在设置 `SA_NODEFER` 时被去掉。该式解释了「处理器为何不会递归重入同一信号」以及「在处理器里屏蔽相关信号可形成临界区」。阻塞只延后递送，不丢弃信号：

$$ s \in blocked \Rightarrow pending' = pending \cup \{s\} $$
$$ s \notin blocked \;\land\; s \in pending \Rightarrow deliver(s) $$

系统调用结果由标志与调用类型共同决定：

$$ result = \begin{cases} restart & SA\_RESTART \in sa\_flags \;\land\; syscall \in \text{Restartable} \\ -EINTR & otherwise \end{cases} $$

`Restartable` 并非全量：`poll`、`select`、`epoll_wait`、`sigsuspend`、`sigtimedwait`、`semop`、`msgrcv`、`nanosleep` 等在 Linux 上即使带 `SA_RESTART` 也可能返回 `EINTR`。

## 四、代码实现
```c
#include <errno.h>
#include <signal.h>
#include <string.h>
#include <unistd.h>

static volatile sig_atomic_t term_seen = 0;

static void on_term(int sig, siginfo_t *info, void *ucontext) {
    int saved = errno;
    (void)sig; (void)ucontext;
    term_seen = 1;
    /* info->si_code 区分 SI_USER（kill）与 SI_QUEUE（sigqueue） */
    (void)info;
    errno = saved;
}

int main(void) {
    struct sigaction sa;
    memset(&sa, 0, sizeof(sa));
    sa.sa_sigaction = on_term;
    sa.sa_flags = SA_SIGINFO | SA_RESTART;
    sigemptyset(&sa.sa_mask);
    sigaddset(&sa.sa_mask, SIGINT);      /* 处理 SIGTERM 期间同时屏蔽 SIGINT */
    sigaddset(&sa.sa_mask, SIGTERM);     /* 显式写出内核的隐式行为 */
    if (sigaction(SIGTERM, &sa, NULL) == -1) return 1;

    sigset_t block_int, prev;
    sigemptyset(&block_int);
    sigaddset(&block_int, SIGINT);
    if (sigprocmask(SIG_BLOCK, &block_int, &prev) == -1) return 1;
    /* ... 临界区：SIGINT 只会 pending，不打断 ... */

    while (!term_seen) {
        /* 原子地恢复掩码并等待，消除 sigprocmask + pause 的丢唤醒窗口 */
        if (sigsuspend(&prev) == -1 && errno != EINTR) return 1;
    }
    return 0;
}
```

用 `sigwaitinfo` 同步收取信号，不进入处理器上下文，因此可自由使用 `malloc` 与加锁：

```c
sigset_t set;
siginfo_t info;
sigemptyset(&set);
sigaddset(&set, SIGTERM);
while (sigwaitinfo(&set, &info) == -1 && errno == EINTR) { /* 重试 */ }
/* signalfd 则可把信号事件加入 epoll，与 IO 事件统一等待 */
```

## 五、与其他技术对比
| 维度 | `sigaction` | `signal()` | `sigprocmask` | `sigsuspend` | `signalfd` |
| --- | --- | --- | --- | --- | --- |
| 目的 | 注册处理器并精确配置 | 简化注册 | 主动改阻塞集 | 原子改掩码并睡眠 | 把信号转成 fd |
| 语义确定性 | 高 | 随实现变化 | 高 | 高 | 高 |
| 可指定处理期屏蔽 | 能（`sa_mask`） | 不能 | 不适用 | 不适用 | 不适用 |
| 是否可加入 `epoll` | 否 | 否 | 否 | 否 | 是 |
| 处理器上下文 | 有（打断指令） | 有 | 无 | 无 | 无 |

与互斥锁的对比值得强调：`sa_mask` 提供的是「对**异步打断**的互斥」，保护同一线程内被信号重入；互斥锁保护的是「多线程竞争」。多线程程序中若信号可能投递给其他线程，仅屏蔽本线程并不足够，必须结合线程定向投递或 `signalfd` 集中收取。

## 六、常见误区
- **以为 `signal()` 就是 `sigaction` 的别名**：glibc 中它是 BSD 语义的包装，但可移植代码不应依赖；`SA_RESTART` 是否存在直接决定是否需要处理 `EINTR`。
- **以为屏蔽信号会丢失它**：标准信号只置 pending 位且会合并，实时信号排队；屏蔽只延后递送。
- **以为 `SA_RESTART` 覆盖所有系统调用**：`epoll_wait`、`poll`、`select`、`sigsuspend`、`nanosleep` 等不会被自动重启。
- **以为屏蔽只影响自己**：屏蔽是**线程级**的；若其他线程未阻塞该信号，内核可能把信号投给别的线程。
- **`sigsuspend` 传错掩码**：必须传「希望生效的掩码」（如 `prev`），传 `NULL` 或当前掩码会造成死等；多线程场景下还应改用 `pthread_sigmask`。

## 七、与开源书·权威来源对应
- Kerrisk《The Linux Programming Interface》第 21 章逐字段讲解 `sigaction`、`sigprocmask`、`sigsuspend` 与 `sa_mask`，并给出「用屏蔽集做临界区」的完整范式。
- Bryant & O'Hallaron《Computer Systems: A Programmer's Perspective》第 8 章 8.5 节从异常控制流角度解释处理器与主控制流的交错。
- Love《Linux Kernel Development》关于信号递送与 `signal_pending` 检查的描述解释「处理器为何总在内核态返回用户态前运行」。
- POSIX 的 `sigaction`、`sigprocmask`、`sigwait` 章节规定标志语义与可重启系统调用清单，具体以官方最新文档为准。
- Kerrisk 整理的 async-signal-safe 函数清单与「`SA_RESTART` 例外表」是工程实践的直接依据。

## 八、面试题
1. **`SA_RESTART` 的作用与局限？**
   要点：让被中断的系统调用自动重启而非返回 `EINTR`；但 `epoll_wait`/`poll`/`select`/`sigsuspend`/`nanosleep` 等不重启，仍须处理 `EINTR`。
2. **`sigsuspend` 相比 `sigprocmask` + `pause` 为什么必要？**
   要点：后者两步之间信号到达会导致丢唤醒进而永久睡眠；`sigsuspend` 把设置掩码与进入睡眠合为一次系统调用。
3. **`sa_mask` 与 `sigprocmask` 的关系？**
   要点：`sa_mask` 只在处理器执行期间叠加生效；`sigprocmask` 修改长期的线程阻塞集，前者用于自动化的短临界区。
4. **多线程程序如何让信号只由一个线程处理？**
   要点：所有线程 `pthread_sigmask` 屏蔽目标信号，专用线程用 `sigwait`/`signalfd` 同步收取。
5. **`SA_RESETHAND` 与 `SA_NODEFER` 分别改变什么？**
   要点：前者进入处理器时把动作重置为默认（一次性）；后者取消「自动屏蔽自身」，允许递归重入，通常只用于可重入的纯标志置位处理器。

## 九、演进与趋势
现代服务程序普遍不再依赖异步处理器，而是把信号「事件化」：`signalfd` 让 `epoll` 统一等待信号，`eventfd`/`timerfd` 处理定时与计数，`pidfd` 系列消除 pid 复用竞态。这把「打断任意指令」的语义转化为「可阻塞读取」，从根本上规避 async-signal-safe 限制与重入问题。语言运行时（Go、Rust）也倾向把信号封装成 channel，只在极少数场景保留真正的异步处理器。

## 十、小结
`sigaction` 用「处理器 + 处理期屏蔽集 + 行为标志」把信号递送变成可精确控制的过程，`sigprocmask` 控制长期阻塞集，`sigsuspend` 以原子方式消除丢唤醒窗口。掌握 $mask_{eff} = mask_{base} \cup sa\_mask \cup \{s\}$、`SA_RESTART` 的例外集合、以及屏蔽集的线程作用域，就掌握了信号编程的边界。工程上优先选择 `signalfd`/`sigwait` 的事件化路线。
