# epoll 的 LT 与 ET 触发模式

> 对应 man 7 epoll 中 Level-Triggered 与 Edge-Triggered 的语义规定、Stevens《UNIX Network Programming》第 1 卷的非阻塞 I/O 讨论，以及 Love《Linux System Programming》对 EAGAIN 与部分读写的说明。

## 一、背景与挑战
epoll 提供水平触发（LT，默认）与边缘触发（ET）两种模式。它们不是性能调优选项，而是**语义契约**：选错会导致事件彻底丢失（数据永远读不到）或事件循环忙等（CPU 跑满）。正确使用的前提是理解「触发条件」与「fd 阻塞性」的耦合关系。

## 二、核心原理
LT 语义：只要 fd 就绪（读缓冲非空、写缓冲有空间），每次 `epoll_wait` 都报告该事件。应用可分多次处理，行为与 select/poll 一致，容错高，但同一事件可能被多次上报。

ET 语义：仅在状态跃迁（不可读→可读，不可写→可写）时报告一次。此后若未把数据消费干净就不会再收到通知。因此 ET 强制两个条件：
1. fd 必须非阻塞。循环读到 `EAGAIN` 是唯一收尾信号；阻塞 fd 会在最后一次 read 上挂起整个事件循环。
2. 必须循环读写直到 `EAGAIN`（读侧无数据，写侧对端窗口已满）。

三个边界行为：
- `EPOLLOUT` 在 ET 下只在「上次写不动→这次能写」时报告一次。若一直可写就会一直报告形成忙等，故应「只在 write 返回 EAGAIN 时才注册 EPOLLOUT，写出后可写后立刻注销」。
- `EPOLLRDHUP` 可感知对端半关闭，配合 ET 避免遗漏 EOF。
- LT 走「扫描并排序」路径时会把仍就绪的项重新挂回就绪链表，ET 则不重新挂回。

## 三、形式化与数学基础
令 $B(t)$ 为读缓冲未读字节数，就绪指示函数：

$$I(t) = \begin{cases} 1, & B(t) > 0 \\ 0, & B(t) = 0 \end{cases}$$

LT 触发集合为每周期都报告：

$$T_{LT}(t) = \{\, f \mid I_f(t) = 1 \,\}$$

ET 触发集合为上升沿：

$$T_{ET}(t) = \{\, f \mid I_f(t) = 1,\ I_f(t^-) = 0 \,\} = \left\{\, f \ \middle|\ \frac{d}{dt} I_f > 0 \,\right\}$$

推论：ET 下若只做部分消费，$B(t)$ 仍大于 0，$I(t)$ 保持 1，$\Delta I = 0$，不再通知。故 ET 的正确性条件是读循环把缓冲读空：

$$\text{correct} \iff \bigwedge_{f} \left( \text{read until } errno = EAGAIN \right)$$

写侧同理：设发送缓冲剩余空间为 $W(t)$、可写指示 $J(t) = [W(t) > 0]$，若长期保持注册 EPOLLOUT 且始终可写，则唤醒率趋于每周期一次，形成忙等。

## 四、代码实现
```c
#include <sys/epoll.h>
#include <fcntl.h>
#include <errno.h>
#include <unistd.h>

static int watch_et(int epfd, int fd, uint64_t ctx) {
    int fl = fcntl(fd, F_GETFL, 0);
    if (fl < 0) return -1;
    fcntl(fd, F_SETFL, fl | O_NONBLOCK);          /* ET 的前提：非阻塞 */

    struct epoll_event ev;
    memset(&ev, 0, sizeof ev);
    ev.events = EPOLLIN | EPOLLET | EPOLLRDHUP;
    ev.data.u64 = ctx;
    return epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);
}

/* ET 读取：必须读到 EAGAIN 才算本轮收工 */
static int on_readable_et(int fd, char *buf, size_t cap) {
    for (;;) {
        ssize_t n = read(fd, buf, cap);
        if (n > 0) { handle(buf, (size_t)n); continue; }
        if (n == 0) return 0;                     /* 对端关闭：EOF */
        if (errno == EAGAIN || errno == EWOULDBLOCK) return 1;  /* 读完 */
        if (errno == EINTR) continue;
        return -1;                                /* 真错误 */
    }
}

/* ET 写侧要点：write 返回 EAGAIN 时才 MOD 注册 EPOLLOUT，
   写出完毕立刻 MOD 撤销，否则一直可写会导致空转忙等 */
```

## 五、与其他技术对比

| 维度 | LT（水平触发） | ET（边缘触发） | IOCP 完成模型 |
|---|---|---|---|
| 触发条件 | 状态持续满足即报告 | 只在状态跃迁报一次 | 异步操作完成时投递 |
| 是否要求非阻塞 | 不要求，但推荐 | 强制要求 | 不适用 |
| 应用消费契约 | 可分多次处理 | 必须读到 EAGAIN | 按完成包处理 |
| 丢事件风险 | 低 | 高，读不干净即丢 | 无 |
| CPU 开销特征 | 可能重复上报 | 通知更少，误用会忙等 | 无轮询 |
| 编程复杂度 | 低 | 高 | 中高 |

## 六、常见误区
误区一：ET 更快所以无脑用 ET。ET 减少的是重复通知，读取循环不完整会永久丢事件——正确性优先。
误区二：ET 模式可以用阻塞 fd。循环末次 read 会阻塞，整个事件循环停摆，这是最典型的生产事故。
误区三：EPOLLOUT 在 ET 下只报一次。恰恰相反，一直可写会一直报，必须按需注册与撤销。
误区四：LT 模式下不处理事件没关系。长期不读会每轮重复上报形成空转，虽不丢事件但浪费 CPU。
误区五：把 read 返回 0 当成 EAGAIN。返回 0 表示对端关闭（EOF），与 EAGAIN 语义完全不同。

## 七、与开源书·权威来源对应
- man 7 epoll：明确要求 ET 必须配合非阻塞 fd 与「读到 EAGAIN」的循环，是语义规定的权威来源。
- Stevens《UNIX Network Programming》第 1 卷：非阻塞 I/O、部分读写的处理惯用法与 EAGAIN 语义。
- Love《Linux System Programming》：read/write 返回值语义、EINTR 处理与短读写场景。
- Stevens《TCP/IP Illustrated》第 1 卷：TCP 收发缓冲与窗口机制，解释 EPOLLOUT 何时从不可写变为可写。

## 八、面试题
1. ET 为什么必须配合非阻塞 fd？
   要点：循环读取靠 EAGAIN 收尾，阻塞 fd 会在末次 read 上挂起整个事件循环。
2. LT 模式下不处理事件会怎样？
   要点：下一轮 wait 继续上报，形成重复通知与空转；事件不丢但浪费 CPU。
3. EPOLLOUT 在 LT 与 ET 下行为有何差异？
   要点：LT 只要可写就持续上报；ET 只在不可写转可写时上报一次，需按需注册与撤销。
4. 什么场景适合 ET？
   要点：连接数大、就绪稀疏、应用能保证非阻塞循环读尽。
5. 如何避免 ET 下的事件饥饿？
   要点：每次读到 EAGAIN，必要时限制单次处理量并做公平调度，防止单个连接独占循环。

## 九、演进与趋势
EPOLLONESHOT 提供第三种控制：事件上报后自动失效，须 `EPOLL_CTL_MOD` 重新武装，与多线程 worker 池配合可保证同一 fd 同一时刻只被一个线程处理。EPOLLEXCLUSIVE 则从唤醒侧减少惊群。二者与 ET 正交：ET 决定何时通知，ONESHOT 决定通知几次后失效，EXCLUSIVE 决定通知谁。

## 十、小结
LT 是「状态满足就报」，ET 是「状态刚变化才报」。LT 稳健易写、可能重复上报；ET 通知更少、吞吐更好，但严格要求非阻塞 fd 与读到 EAGAIN 的循环，并需对 EPOLLOUT 按需注册。选择依据是对正确性与通知开销的权衡，而非笼统的「谁更快」。
