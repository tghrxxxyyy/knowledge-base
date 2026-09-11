# TCP_NODELAY 与禁用 Nagle

> 对应 Linux socket(7)/tcp(7) 的 TCP_NODELAY 选项与 xiaolincoder/hello-http 关于禁用 Nagle 的说明。

## 一、背景与挑战

Nagle 算法虽节省带宽，却会让「先写一小段、等 ACK、再写」的交互式应用出现人为延迟。对延迟敏感的协议（游戏、RPC、实时控制、Redis 协议）需要关闭 Nagle，让每个写立即发出，即设置 TCP_NODELAY。但这会以更多小包为代价，需在延迟与带宽间权衡。

NODELAY 的作用边界常被误解：它只解除 Nagle 的「有未确认小段则暂缓」，并不意味着数据立刻到达对端，也不绕过拥塞控制与窗口。发送是否「快」取决于管道而非该选项；它改变的是「发送方愿意多早把小段交出去」，从而缩短应用感知的首字节往返，这点对延迟敏感链路价值最大。

## 二、核心原理

TCP_NODELAY 为 1 时，内核不再执行 Nagle 的「有未确认小段则暂缓」逻辑，每次 send 只要缓冲有空间就尽快发出（仍受窗口与拥塞控制约束）。代价是可能产生更多小包、降低链路利用率。它与 TCP_CORK（Linux 为 TCP_CORK）相对——后者主动延缓发送以攒大包，与 NODELAY 互斥，常用于 HTTP 响应头+体合并。

在 HTTP/2、gRPC 等基于多路复用的协议里，单连接承载多流，Nagle 与延迟确认的叠加会在连接级放大多路流的队头阻塞；因此这些栈几乎默认 NODELAY，并用帧层批量（如 gRPC 的 coalescing）在用户态合并，既低延迟又不过度碎包。QUIC 则直接以用户态可靠传输规避内核 Nagle。

关键要点：

- 关闭 Nagle 只解除「有未确认小段则暂缓」，不绕过窗口与拥塞控制。
- NODELAY 与 TCP_CORK 语义相反，内核视二者互斥，后设者生效。
- 延迟敏感交互应开 NODELAY，但须配合应用层批量抑制小包率上升。
- 单字节写延迟从「约 1 个 ACK RTT」降为「约 1 个发送时延」。
- 对端仍延迟确认时，单向首段仍可能多等一个 T_dack，需两端协同。
- 多路复用协议（gRPC/HTTP2）默认 NODELAY 并在帧层做批量合并。

## 三、形式化与数学基础

开启 NODELAY 后，发送判定简化为：只要 $\text{flight} < \min(\text{cwnd}, \text{rwnd})$ 且缓冲有数据即发，不再等待 $\text{outstanding}==0$。单字节写的发包延迟从「约 1 个 ACK RTT」降为「约 1 个发送时延」：

$$
\Delta t_{\text{write}} \approx t_{\text{send}} \ll \text{RTT}
$$

但小包率上升，链路有效利用率：

$$
U = \frac{\text{payload}}{\text{payload} + \text{header}} \downarrow
$$

## 四、代码实现

```c
int on = 1;
setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &on, sizeof on);
/* 此后 send 小数据立即发出，不受 Nagle 暂缓 */
/* 若需攒大包，应使用 TCP_CORK 而非 NODELAY */
int cork = 1;
setsockopt(fd, IPPROTO_TCP, TCP_CORK, &cork, sizeof cork);
```

## 五、与其他技术对比

| 选项 | 行为 | 延迟 | 小包率 | 适用 |
|------|------|------|--------|------|
| 默认(Nagle) | 合并小写 | 高 | 低 | 批量 |
| TCP_NODELAY | 立即发 | 低 | 高 | 实时交互 |
| TCP_CORK | 塞住攒包 | 高 | 低 | HTTP 头体合并 |
| NODELAY+CORK | 互斥 | — | — | 不可同时 |

## 六、常见误区

误区一：NODELAY 保证立即到达——只保证「尽快发出」，网络传输延迟仍受路由与 RTT 影响。

误区二：开了 NODELAY 永远更快——小包过多会降低整体吞吐，且低速链路上抬高带宽占用。

误区三：NODELAY 与 Nagle 可同时——二者语义相反，设 NODELAY 即关闭 Nagle。

误区四：CORK 与 NODELAY 可叠加——内核视二者互斥，后设者生效。

误区五：关 Nagle 就解决一切延迟——对端延迟确认仍可能造成单向等待，需两端协同。

补充误区：

- 误区六：认为关 Nagle 即关闭拥塞控制——NODELAY 不绕过 cwnd/rwnd，发送仍受约束。
- 误区七：把 CORK 当作 NODELAY 的「开」——二者方向相反，CORK 是攒包而非立即发。
- 误区八：应用层批量会抵消 NODELAY——正确结合反而最优，但需框架支持 coalescing。
- 误区九：NODELAY 解决所有延迟——对端延迟确认仍可能造成单向等待。
- 误区十：网关层开了 NODELAY 应用就无需关心——端到端每个跳都可能重设该选项。

## 七、与开源书·权威来源对应

man tcp(7) 的 TCP_NODELAY/TCP_CORK；xiaolincoder/hello-http 对比二者；Kurose & Ross 讨论时延与效率权衡；Redis、gRPC 客户端默认启用 NODELAY 以保证交互及时。选型清单：在线交互（RPC、游戏、交易）→ NODELAY + 应用层批量；批量传输/日志 → 保留 Nagle；HTTP 响应头体合并 → 用 CORK 而非反复 NODELAY。

## 八、面试题

TCP_NODELAY 做什么？与 TCP_CORK 区别？何时该开？为何开了仍可能慢？小包率上升为何降低吞吐？为何 CORK 与 NODELAY 互斥？

## 九、演进与趋势

许多现代框架（如 gRPC、Redis 客户端）默认启用 TCP_NODELAY 以保证交互及时；同时用应用层批量合并（pipeline）来兼顾小包问题，而非依赖 Nagle。用户态协议栈与 QUIC 进一步绕过内核 Nagle 逻辑以压低尾延迟，使「低延迟 + 低碎包」由协议层而非 socket 选项来保证。

## 十、小结

TCP_NODELAY 关闭 Nagle 以获得最低交互延迟，适合延迟敏感应用，但需配合应用层批量以降低小包率；它与 CORK 不可并用，是延迟与带宽的经典权衡点，且必须结合对端设置才能真正消除交互卡顿。
