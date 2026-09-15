# 糊涂窗口综合征的避免Clark与Nagle

> 对应 RFC 896 (Nagle 1984)、Clark 1982《Window and Acknowledgement Strategy in TCP》(RFC 813)、RFC 1122 §4.2.3 与 Stevens《TCP/IP Illustrated》Vol.1。

## 一、背景与挑战

TCP 是字节流协议，应用每次 `write` 的边界与 TCP 段（segment）边界无关。当交互式应用以小粒度反复写（每字节一次、每行一次），且接收方几乎同时地读走时，TCP 会退化成一堆「1 字节数据 + 40 字节头」的报文段，这类段被称为 tinygram（小报文段）。

代价是双重的：一是有效载荷利用率极低；二是每字节都要付出一次中断、一次软中断处理、一次路由查找与一次 ACK 的 CPU 成本，在高速链路上成为瓶颈，极端情况下诱发拥塞崩溃。这种病态由 John Nagle 于 1984 年命名并分析，称为糊涂窗口综合征（Silly Window Syndrome，SWS）。

SWS 有两个独立成因：发送方不停产生小段（sender-side SWS），接收方不停通告小窗口诱导发送方产生小段（receiver-side SWS）。只修一端无法根治，必须两端同时约束，这正是 Nagle 算法与 Clark 算法成对出现的原因。

## 二、核心原理

### 发送方：Nagle 算法

规则只有一条：**当且仅当已发送但未被确认的数据（在途数据）为空，或待发数据足以填满一个 MSS 时，才立即发送；否则把数据缓存到发送队列，等 ACK 到来或凑满 MSS 再发。**

其依据是 TCP 的自计时（self-clocking）特性：只要还有小段在途，网络上就存在 RTT 量级的未确认窗口，此时继续塞入新的小段不会提高吞吐，只会增加在途段数量。等 ACK 回来时，先前的小段已抵达接收方，新数据可与后续数据合并成更大的段。

Nagle 并不禁止小包——它只在「有未确认小段在途」时延迟。请求-响应模式（write-request、read-response）每次只有一个未确认段，因此不受影响；受影响的典型是「write-write-read」模式（Stevens 命名的经典反模式），以及单侧连续小写。

### 接收方：Clark 算法

Clark 1982 指出，接收方即使应用每次只读走 1 字节，也不能只把窗口增加 1 字节。接收方应遵循：**只有当可通告窗口至少达到 $\min(MSS, RcvBuffer/2)$ 时才更新并通告新窗口；否则维持旧窗口（哪怕实际有空间），直到空间足够再一次性通告。**

否则发送方会立刻填满这 1 字节空间，形成 tight loop：接收方读 1 字节 → 通告 1 字节 → 发送方发 1 字节 → 接收方再读 1 字节。窗口通告字段本身不额外占空间，但由此引发的数据段代价极高。

RFC 1122 §4.2.3.3 把 Clark 策略形式化为接收方必须遵守的条目，§4.2.3.4 则形式化发送方的 SWS 避免规则。

### 与 delayed ACK 的相互作用

接收方为摊薄 ACK 开销通常延迟发送 ACK（Linux 下 `TCP_DELACK_MIN = HZ/25`，HZ=1000 时为 40ms），期望在延迟窗口内合并两个 ACK 或捎带数据。这恰好与 Nagle 形成负反馈死锁：发送方等 ACK 才肯发下一段，接收方等第二段才肯发 ACK，双方互等一个延迟 ACK 周期。

结果是单次小请求的延迟凭空增加约 40ms（早期 SunOS 为 200ms），在高频 RPC 场景下是灾难性的。工程解法有三类：`TCP_NODELAY` 关闭 Nagle；`TCP_QUICKACK`（Linux）让接收方立即回 ACK；或把 write-write-read 改为 write-read 以消除第二个小段。前两种是绕过而非消除 SWS。

## 三、形式化与数学基础

设有效载荷 $L_{data}$ 字节，TCP 头（含选项）$H_{tcp}$，IP 头 $H_{ip}$，则协议效率为：

$$ \eta = \frac{L_{data}}{L_{data} + H_{tcp} + H_{ip}} $$

取 $H_{tcp}=20$、$H_{ip}=20$（IPv4 无选项）：当 $L_{data}=1$ 时 $\eta = 1/41 \approx 2.4\%$；当 $L_{data}=1460$ 时 $\eta \approx 97.3\%$。SWS 把效率压低了近 40 倍。

再看单位数据的 CPU 成本。设每段固定处理开销为 $c_{seg}$（中断 + 软中断 + 协议栈 + ACK 处理），单位字节成本为 $c_{seg}/L_{data}$，与载荷成反比。Nagle 与 Clark 的作用就是把 $L_{data}$ 推向 $MSS$。

发送方 SWS 避免判定（RFC 1122 §4.2.3.4）可写成：

$$ \text{send} \iff \left( L \ge MSS \right) \lor \left( L \ge \tfrac{1}{2} W_{max} \right) \lor \left( \text{无更多待写数据} \land PSH \right) $$

第三项即 push 判定：应用当前已无更多数据且设置了 PSH 时直接发送，$\tfrac{1}{2}W_{max}$ 是启发式下限，避免窗口本就很小时无谓等待。

接收方通告条件（Clark / RFC 1122 §4.2.3.3）为：

$$ rwnd_{adv} \ge \min\!\left(MSS,\ \frac{RcvBuffer}{2}\right) \quad \text{或} \quad rwnd_{adv} \ge \frac{1}{2}\, rwnd_{max} $$

当真实可用空间小于该阈值时，接收方通告 $rwnd = 0$，把回退责任交给发送方的零窗口探测，这比通告一个 3 字节的窗口更优。

## 四、代码实现

Linux 中 Nagle 判定在 `tcp_nagle_check()` / `tcp_nagle_test()`（`net/ipv4/tcp_output.c`），下面是简化示意：

```c
/* 简化示意：真实实现还处理 URG 与 FIN 的特例 */
static inline bool nagle_check(struct tcp_sock *tp, struct sk_buff *skb,
                               unsigned int mss_now, int nonagle)
{
    if (nonagle & NAGLE_PUSH)        /* TCP_NODELAY 或显式 push */
        return false;
    if (skb->len >= mss_now)         /* 已满 MSS：可发 */
        return false;
    if (!skb_is_last(sk, skb))       /* 队列尾之后还有数据可合并 */
        return false;
    return true;                     /* 小段 + 队列尾 + 无 PUSH → 被延迟 */
}
```

接收方窗口降级保护在 `tcp_select_window()`：

```c
/* 简化示意：SWS 避免，不做非零的小幅收缩 */
static u32 select_window(struct sock *sk)
{
    struct tcp_sock *tp = tcp_sk(sk);
    u32 old_win = tp->rcv_wnd;
    u32 cur_win = tcp_receive_window(tp);
    u32 new_win = compute_new_window(sk);

    if (new_win < cur_win) {         /* 允许缩到 0 施压，但不做小幅收缩 */
        new_win = 0;
        if (old_win < cur_win)
            new_win = old_win;
    }
    tp->rcv_wnd = new_win;
    return new_win;
}
```

应用层两种对立的开关：

```c
int one = 1, zero = 0;
setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &one, sizeof(one));  /* 关闭 Nagle */
setsockopt(fd, IPPROTO_TCP, TCP_CORK,    &one, sizeof(one));  /* 强制攒批 */
/* TCP_CORK 置 1 后最多等 200ms 或凑满 MSS；置 0 时立即 flush。
   适合「先写响应头再写正文」的静态文件服务。*/
setsockopt(fd, IPPROTO_TCP, TCP_CORK, &zero, sizeof(zero));
```

Python 侧只需一行，但要注意它同样放弃了 Nagle 对批量流的合并收益：

```python
import socket
s = socket.create_connection(("example.com", 80))
s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
# 需要攒批时改为在应用层聚合多段业务数据后再一次性 write
```

## 五、与其他技术对比

| 维度 | Nagle（发送方） | Clark（接收方） | TCP_CORK | TCP_NODELAY | QUIC 帧聚合 |
| --- | --- | --- | --- | --- | --- |
| 作用位置 | 发送端内核 | 接收端内核 | 发送端内核 | 发送端内核 | 用户态传输库 |
| 触发条件 | 有未确认小段在途 | 通告窗口过小 | 应用显式置位 | 应用显式置位 | 打包多个 STREAM 帧 |
| 延迟影响 | 可引入 1 RTT 级等待 | 无（仅影响通告） | 最多 200ms | 消除等待 | 由应用/库控制 |
| 带宽影响 | 提高小包效率 | 消除 tinygram | 提高大响应效率 | 小包变多 | 减少每包头部 |
| 典型场景 | 默认开启 | 默认开启 | 静态文件服务 | 低延迟 RPC、游戏 | HTTP/3 |
| 用户可调性 | 仅开/关 | 无开关 | 有超时上限 | 有 | 有 |

与拥塞控制的关系：SWS 是效率问题而非拥塞问题，Nagle 的延迟与 cwnd 无关；但 `TCP_NODELAY` 造成的小包风暴会占用更多网络缓存与 ACK 带宽，间接放大丢包概率。

## 六、常见误区

- **所有服务都该关 Nagle。** 批量吞吐场景（日志投递、文件传输）开启 Nagle 能显著降低段数与 CPU，一刀切关掉是典型的过度优化。
- **只改发送方就能解决 SWS。** 接收方若按字节通告窗口，发送方再守规矩也会被诱导成 tinygram，Clark 侧不可缺。
- **Nagle 必然造成固定 40ms 延迟。** 延迟只出现在「延迟 ACK 与窗口重叠」的特定模式；须用 `tcpdump` 观察到周期性 40ms 才可归因。
- **`TCP_NODELAY` 与 `TCP_CORK` 可随意同开。** 二者语义冲突，CORK 会被 NODELAY 的 push 语义抵消。
- **Nagle 会影响可靠性。** 它只改变发送时机，序号、重传、超时、窗口语义均不变。

## 七、与开源书·权威来源对应

- RFC 896（Nagle, 1984）：提出并命名 tinygram，给出「等待未确认小段被 ACK 后再发」的规则。
- RFC 813 / Clark 1982《Window and Acknowledgement Strategy in TCP》：接收方窗口通告策略的原典，SWS 接收侧来源。
- RFC 1122 §4.2.3.3–4.2.3.4：把 Clark 与发送方 SWS 避免规则形式化为实现必须遵守的条目。
- Stevens《TCP/IP Illustrated》Vol.1 第19–22章：Nagle、delayed ACK、SWS 的抓包示例与 write-write-read 反模式分析。
- Kurose & Ross《Computer Networking》第3章：流量控制一节讨论 Nagle 与 delayed ACK 的相互等待。
- Linux `net/ipv4/tcp_output.c`：`tcp_nagle_check()`、`tcp_select_window()` 可核对上述策略的真实实现。

## 八、面试题

1. **Nagle 与 delayed ACK 同时启用会出现什么问题？**
   要点：发送方等 ACK 才发下一小段，接收方等第二段才回 ACK，互等一个延迟 ACK 周期（Linux 约 40ms）。表现为请求-响应正常、连续小写变慢。解法是 `TCP_NODELAY`、`TCP_QUICKACK`，或消除 write-write-read 模式。

2. **Nagle 会不会影响可靠性？**
   要点：不会。它只调整发送时机，序号、重传、超时、窗口语义不变；被延迟的数据仍在发送队列中，最终会被发出。

3. **接收方为什么不能总是通告「刚好」的窗口大小？**
   要点：会诱导发送方逐字节填入，形成 tinygram 循环，头开销吞掉几乎全部带宽。应等到至少 $\min(MSS, RcvBuf/2)$ 才更新通告。

4. **如何判断线上延迟是 Nagle 造成的？**
   要点：`ss -ti` 看 `rtt`、`snd_wnd`、是否启用时间戳；抓包观察小包后固定约 40ms 才出现 ACK+数据；改为 `TCP_NODELAY` 后延迟消失即可确认。

5. **`TCP_CORK` 与 Nagle 的区别？**
   要点：Nagle 被动、由 ACK 驱动；CORK 是应用显式攒批、最多 200ms 强制 flush，能把多个 `write` 合成一个段，常用于先写头部再写正文的响应。

## 九、演进与趋势

Linux 内核持续微调 Nagle 判定：加入 FIN/URG 特例，`tcp_nagle_test()` 明确排除 FIN 段，避免最后一次写被无谓延迟；`TCP_CORK` 与 `TCP_NODELAY` 分别映射到 `TCP_NAGLE_CORK`、`TCP_NAGLE_OFF` 标志。

在协议层，QUIC（RFC 9000）把可靠传输挪到用户态，以 STREAM 帧为单位按流聚合，并可在一个 UDP 数据报中打包多个帧（coalescing），从根本上不以字节窗口驱动发送，SWS 的语境被弱化；HTTP/3 因此在多请求小消息场景下天然规避 Nagle 与 delayed ACK 的耦合。

数据平面上，GRO/GSO/TSO 让大段在网卡侧被切分或聚合，使内核即使发出 64KB 的逻辑段也只需一次协议处理；sockmap 与 io_uring 则降低小包场景下的每段系统调用成本。但这些是「降低小包代价」，与「减少小包数量」的 Nagle/Clark 思路互补而非替代。

## 十、小结

SWS 的根源是 TCP 字节流语义与应用写边界不匹配，叠加窗口通告的逐字节反馈。发送侧 Nagle 用「在途未确认小段即等待」把数据攒到 MSS，接收侧 Clark 用「窗口增长不足阈值不通告」阻止诱导 tinygram；两者缺一不可，且都会与 delayed ACK 产生延迟耦合。

工程实践上应把它当作场景选择而非全局开关：低延迟请求-响应关 Nagle 并用 `TCP_QUICKACK`，批量传输保留 Nagle 或用 `TCP_CORK` 攒批；排查时以 `ss -ti` 与抓包确认 40ms 周期性等待，再针对性调整。
