# epoll 在内核中的 eventpoll 实现

> 对应 Linux 内核源码 fs/eventpoll.c、Bovet & Cesati《Understanding the Linux Kernel》I/O 事件通知章、Love《Linux Kernel Development》等待队列与回调机制，以及 man 2 epoll_wait。

## 一、背景与挑战
只停在 API 层面无法解释三类现象：连接数极大时为何仍高效、为何偶发「就绪事件被吞」、EPOLLONESHOT 与 EPOLLEXCLUSIVE 的语义约束为何古怪。这些问题必须回到 `struct eventpoll` 与回调路径才能回答。

## 二、核心原理
`struct eventpoll` 的关键字段：
- `rbr`：红黑树根，管理全部 epitem，按 `(file*, fd)` 索引。
- `rdllist`：就绪链表，承载待收割的 epitem。
- `ovflist`：溢出链表，处理回调重入。
- `wq`：本实例等待队列，epoll_wait 阻塞于此。
- `mtx`：保护结构性修改；就绪链表另有独立自旋锁。
- `rdcand`/`rdcnt`：决定走单链表路径还是「扫描加排序」路径的阈值。

三条主流程：
1. `epoll_ctl(ADD)` 分配 epitem 挂入红黑树，并构造 `eppoll_entry` 等待项挂到目标 fd 的等待队列，回调为 `ep_poll_callback`。
2. 目标 fd 就绪时驱动 `wake_up`，回调把 epitem 的 `rdllink` 链入 `rdllist`，并按需唤醒 `ep->wq`。
3. `epoll_wait` 若链表为空则挂入 `wq` 睡眠；唤醒后走 `ep_scan_ready_list`，对每个就绪项重新调用 `ep_item_poll` 复核，把真实掩码拷回用户数组。

两个设计要点：
- **必须复核**：入队到收割之间事件可能已被其他线程消费，复核可避免虚假就绪（spurious readiness）；LT 下复核不通过会被重新挂回。
- **`ovflist` 的必要性**：扫描 `rdllist` 时持有链表锁，若此时驱动再次回调，不能直接改 `rdllist`，只能挂入 `ovflist`，扫描结束后合并，从而保持回调路径 $O(1)$ 且无死锁。

EPOLLONESHOT：上报后内核清除该 epitem 的就绪掩码，不再触发回调，直到 `EPOLL_CTL_MOD` 重新武装。EPOLLEXCLUSIVE：借助等待项的排他标志，使同一 fd 上多个 epoll 等待者只唤醒一个。

## 三、形式化与数学基础
注册成本由红黑树保证：

$$T_{ctl}(N) = O(\log N)$$

通知路径只做固定次数指针操作，与监控总数无关：

$$T_{notify} = O(1)$$

收割成本与就绪数 $m$ 成线性，且 $m \ll N$ 时远小于全量扫描：

$$T_{wait} = O(m) \ll O(N)$$

设注册变更频率为 $r$、就绪频率为 $q$，单位时间内核开销：

$$C = r \cdot O(\log N) + q \cdot O(1) + q \cdot O(m)$$

选用红黑树而非哈希表的理由是：最坏 $O(\log N)$、无重哈希抖动、天然有序便于遍历。

## 四、代码实现
```c
/* 就绪回调：运行于中断/软中断或唤醒上下文，不能睡眠 */
static int ep_poll_callback(wait_queue_entry_t *wait,
                            unsigned mode, int sync, void *key) {
    struct epitem *epi = ep_item_from_wait(wait);
    struct eventpoll *ep = epi->ep;

    if (READ_ONCE(ep->ovflist) != EP_UNACTIVE_PTR) {   /* 正在扫描 */
        if (epi->next == EP_UNACTIVE_PTR) {
            epi->next = READ_ONCE(ep->ovflist);
            WRITE_ONCE(ep->ovflist, epi);
        }
        return 1;
    }
    if (!ep_is_linked(&epi->rdllink)) {                /* 幂等去重 */
        list_add_tail(&epi->rdllink, &ep->rdllist);
    }
    if (waitqueue_active(&ep->wq))                     /* 无等待者则不唤醒 */
        wake_up(&ep->wq);
    return 1;
}
```

```c
/* 收割：摘链后逐个复核就绪掩码，再拷回用户态 */
static int ep_send_events(struct eventpoll *ep,
                          struct epoll_event __user *events, int maxevents) {
    struct ep_send_events_data esed = { events, maxevents };
    return ep_scan_ready_list(ep, ep_send_events_proc, &esed, 0, 0);
}
```

## 五、与其他技术对比

| 维度 | epoll（eventpoll） | kqueue | Windows IOCP | poll/select |
|---|---|---|---|---|
| 注册结构 | 红黑树 + 就绪链表 | knote 列表 + 过滤器 | 完成端口队列 | 每次调用全量传参 |
| 通知语义 | 就绪通知 | 就绪通知 | 完成通知 | 就绪通知 |
| 每轮复杂度 | $O(m)$ | $O(m)$ | $O(m)$ | $O(N)$ |
| 事件携带信息 | 掩码 + data | filter + flags | 完成键与字节数 | revents |
| 主要限制 | 一个 fd 多实例各持 epitem | 过滤器开销 | 与同步模型不兼容 | fd 数上限 |

## 六、常见误区
误区一：epoll 完全无锁。红黑树持 `mtx`、就绪链表有自旋锁，只是把竞争从每次 wait 摊薄到每次注册与就绪。
误区二：回调会立即唤醒用户线程。回调只入队，且仅在 `wq` 有等待者时才唤醒；用户不在 wait 时事件静静躺在链表里。
误区三：epitem 与 fd 一一对应。一个 fd 被 N 个 epoll 实例监控就有 N 个 epitem，这正是 EPOLLEXCLUSIVE 的前提。
误区四：认为链上的项一定就绪。所以才需要 `ep_item_poll` 复核；LT 复核不通过会重新挂回，ET 则直接丢弃。

## 七、与开源书·权威来源对应
- Linux 内核 fs/eventpoll.c：`eventpoll`、`epitem`、`ep_poll_callback` 的唯一权威实现，字段名与行为以该版本源码为准。
- Bovet & Cesati《Understanding the Linux Kernel》：VFS file 操作与 `poll` 方法族，是读懂回调路径的前置。
- Love《Linux Kernel Development》：等待队列、`wake_up` 系列与中断上下文的可睡眠性约束。
- man 2 epoll_wait、man 7 epoll：可观测行为、EINTR 与 maxevents 语义，以官方最新文档为准。

## 八、面试题
1. `ep_poll_callback` 做了什么？
   要点：挂入 rdllist 或 ovflist、幂等去重、按需唤醒 ep->wq，全程不睡眠。
2. rdllist 与 rbr 的分工？
   要点：rbr 管稳定注册集合（$O(\log N)$），rdllist 管瞬时就绪集合（$O(1)$ 入队）。
3. 为什么说 epoll 是回调驱动？
   要点：就绪探测从「wait 时轮询」转移到「事件源唤醒时回调」，wait 只做收割。
4. EPOLLONESHOT 在内核如何实现？
   要点：上报后清除就绪掩码，不再触发回调，须 MOD 重新武装。
5. ovflist 解决什么问题？
   要点：扫描 rdllist 期间持锁，新就绪不能直接入链，否则破坏遍历。

## 九、演进与趋势
内核持续细化 `eventpoll` 的锁粒度，引入 `ovflist` 处理重入、`rdcand` 优化小规模就绪，并补全 EPOLLEXCLUSIVE 的多消费者支持。上层演进包括 BPF 挂载点让用户程序干预事件路径、io_uring 用共享内存环削减每次 wait 的系统调用。具体特性与阈值以官方最新文档为准。

## 十、小结
epoll 的高效来自四件套的组合：红黑树管理注册、就绪链表承载事件、回调入队、收割时复核。注册付 $O(\log N)$，通知保持 $O(1)$，收割只与就绪数 $m$ 成正比。`ep_poll_callback` 是驱动与用户态收割之间的桥梁，`ovflist` 与 `ep_item_poll` 分别解决重入安全与虚假就绪。
