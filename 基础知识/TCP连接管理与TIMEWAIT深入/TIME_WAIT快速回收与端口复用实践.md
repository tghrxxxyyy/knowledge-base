# TIME_WAIT快速回收与端口复用实践

> 对应 Linux 内核 `Documentation/networking/ip-sysctl.txt`、RFC 7323（TCP Timestamps）、图解网络（xiaolincoder/hello-http）。

## 一、背景与挑战
在频繁主动关闭的高并发服务中，单机可能出现数万 TIME_WAIT 套接字，耗尽可用本地端口范围（如默认的 32768–60999），导致新连接报「Cannot assign requested address」。如何在保证协议正确性的前提下缓解端口耗尽，是工程实践中的常见课题。

关键认知是：TIME_WAIT 不能也无必要被「秒级回收」，真正可行的是「安全复用」与「扩大供给」。盲目追求快速回收往往会引入旧报文串扰或 NAT 侧的随机 RST，得不偿失。

还需区分两种不同的「端口不够用」：一是**出向端口耗尽**（本机作为客户端主动关闭，本地临时端口被 TIME_WAIT 占满），二是**入向端口冲突**（重启服务时绑定仍在 TIME_WAIT 的监听端口失败）。前者需 `tcp_tw_reuse` + 扩大端口范围，后者只需 `SO_REUSEADDR`。混淆二者是最常见的调参方向错误。

## 二、核心原理
根本手段是扩大可分配端口与加快安全复用。端口复用依靠 `SO_REUSEADDR`/`SO_REUSEPORT` 让监听套接字或多个进程共享同一端口；出向连接的 TIME_WAIT 复用由 `tcp_tw_reuse` 在启用时间戳时完成——内核通过比较报文时间戳判定新报文更新，从而安全复用旧的 TIME_WAIT 四元组。

`SO_REUSEADDR` 主要解决「绑定处于 TIME_WAIT 的监听地址」，`SO_REUSEPORT` 允许多个套接字（乃至多进程）负载均衡地绑定同一端口，常用于多核服务。`tcp_tw_reuse` 的复用安全性由 PAWS 保证，而非简单复用。

`tcp_tw_reuse` 的三条生效前提必须同时满足：连接为出向（本机主动发起连接）、本端启用了 TCP Timestamps、且新连接的时间戳严格大于 TIME_WAIT 套接字记录的时间戳。缺任一条，内核就不会复用而是继续占用端口。此外它只作用于「已进入 TIME_WAIT 且超过 1 秒」的套接字，因此对瞬时端口压力缓解有限。

`SO_REUSEPORT` 的另一重要特性是「由内核按四元组哈希分发到各监听套接字」，即同一连接始终落到同一进程，不会在进程间漂移；这使滚动重启时可以「先起新进程再关旧进程」而不丢新连接，是「平滑发布」的常用手法。

## 三、形式化与数学基础
可用本地端口数约为：

$$ N_{port} = (R_{high} - R_{low} + 1) \times N_{dst\_ip} \times N_{dst\_port} $$

其中 $R_{high},R_{low}$ 为 `ip_local_port_range` 上下界，后两项为不同远端 IP 数与端口数。在单一远端四元组下，能并发的连接数受端口数约束，故扩大 `ip_local_port_range` 与多目标分摊是提升上限的直接方式。

启用时间戳后，`tcp_tw_reuse` 的复用安全性由 PAWS 保证：

$$ TS_{new} > TS_{tw} \;\Rightarrow\; \text{可复用该 TIME\_WAIT 四元组} $$

更精确地，实际并发上限还受「连接平均生存时间」约束。设每秒新建连接数为 $Q$、每条连接的四元组占用时长为 $T_{occ}$（含 TIME_WAIT 的 60 秒），则稳态占用端口数约 $Q \cdot T_{occ}$，必须不超过 $N_{port}$，即

$$ Q_{max} \approx \frac{N_{port}}{T_{occ}} $$

这个式子把「端口耗尽」的根因暴露得很清楚：要么降低 $T_{occ}$（缩短 TIME_WAIT 或让其落在被动方），要么提高 $N_{port}$（扩端口、多目标），要么降低 $Q$（用连接池把短连接变长连接）。调参只能改善前两项，第三项才是根治。

## 四、代码实现
内核参数调整示例：

```bash
sysctl -w net.ipv4.tcp_tw_reuse=1
sysctl -w net.ipv4.ip_local_port_range="1024 65535"
```

绑定复用端口的示意：

```c
int one = 1;
setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));
setsockopt(fd, SOL_SOCKET, SO_REUSEPORT, &one, sizeof(one));
bind(fd, (struct sockaddr *)&addr, sizeof(addr));   // 多进程可同时绑定
```

`SO_REUSEPORT` 由内核做一致的源端口/四元组哈希分发，天然实现多进程负载均衡，避免「惊群」。

还需在客户端侧显式启用时间戳，否则 `tcp_tw_reuse` 不会生效：

```c
int on = 1;
setsockopt(fd, IPPROTO_TCP, TCP_TIMESTAMP, &on, sizeof(on));   // 若内核未默认开启
```

## 五、与其他技术对比
相较于曾经存在的 `tcp_tw_recycle`（已在新版内核移除），`tcp_tw_reuse` 只作用于出向连接且依赖时间戳，对 NAT 对端更友好。与应用层长连接、连接池相比，内核级复用无需修改业务代码，但无法消除挥手本身。

相较「盲目调大 `tcp_max_tw_buckets`」，复用与扩端口是更具扩展性的解法——前者只是延迟上限，后者才真正提高并发能力。

| 手段 | 作用对象 | 是否安全 | 是否根治 |
| --- | --- | --- | --- |
| `SO_REUSEADDR` | 监听套接字绑定 | 安全 | 仅解决重启绑定 |
| `SO_REUSEPORT` | 多进程共享监听端口 | 安全 | 提升入向并发 |
| `tcp_tw_reuse` | 出向 TIME_WAIT 复用 | 安全（需时间戳） | 缓解端口耗尽 |
| `tcp_tw_recycle` | 出向（已移除） | 对 NAT 有害 | 已废弃 |
| 连接池/长连接 | 应用连接模型 | 安全 | 根治（减少挥手） |

## 六、常见误区
误区一：启用 `tcp_tw_recycle` 加速回收——该选项因对 NAT 环境有害（基于时间戳误判对端 RTT 而发 RST）已被移除，照搬旧文会导致配置无效甚至连接异常。误区二：以为 `SO_REUSEADDR` 能解决出向客户端端口耗尽——它主要服务于监听套接字，出向复用要靠 `tcp_tw_reuse`。

误区三：以为扩大端口范围就能无视 TIME_WAIT——当远端四元组唯一时仍受限于 $N_{port}$ 上限。误区四：未启用 TCP Timestamps 就指望 `tcp_tw_reuse` 生效——缺少 PAWS 它不敢复用。误区五：把 `SO_REUSEPORT` 当 `SO_REUSEADDR` 用——二者语义不同，混用会踩坑。

误区六：以为 `tcp_tw_reuse` 对服务端有效——它只作用于出向连接，服务端作为被动关闭方时无用。误区七：以为 TIME_WAIT 会占用完整 socket 内存——内核用轻量 `inet_timewait_sock` 表示，内存开销远小于 ESTABLISHED。

## 七、与开源书·权威来源对应
- 图解网络（xiaolincoder/hello-http）：详解 `tcp_tw_reuse` 与端口范围调优的适用边界。
- Linux `Documentation/networking/ip-sysctl.txt`：描述各 `tcp_tw_*` 参数语义与 `ip_local_port_range`。
- RFC 7323：定义 TCP Timestamps 与 PAWS，是安全复用的基础。
- RFC 9293：TIME_WAIT 与端口复用的规范约束。
- Stevens《TCP/IP Illustrated》卷一 18.6：TIME_WAIT 不可轻率消除的原理。

## 八、面试题
1. 服务端出现大量 TIME_WAIT 应优先调哪个参数？答：先判断谁主动关闭；若为客户端侧可开 `tcp_tw_reuse`，扩大 `ip_local_port_range`，并考虑连接池减少短连接；若服务端主动关闭应改连接模型。
2. `SO_REUSEADDR` 与 `SO_REUSEPORT` 区别？答：前者允许绑定 TIME_WAIT 地址；后者允许多套接字共享端口做负载均衡。
3. 为什么 `tcp_tw_reuse` 必须配合时间戳？答：靠 PAWS 时间戳判定新旧报文，避免复用后收到迟到旧报文。
4. `tcp_tw_recycle` 为何被移除？答：它用对端时间戳推断 RTO，对 NAT 后多主机造成随机 RST，危害大于收益。
5. 端口耗尽与 TIME_WAIT 数量不等价，为什么？答：端口占用还与远端四元组多样性、连接建立速率、TIME_WAIT 落点有关，单一后端下少量 TIME_WAIT 也可耗尽端口。
6. `SO_REUSEPORT` 如何处理滚动重启？答：新旧进程可同时绑定同一端口，内核按四元组哈希稳定分发，旧进程停止接收新连接后可等存量连接自然结束。

## 九、演进与趋势
随着 `tcp_tw_recycle` 退役，社区更强调正确设计连接生命周期：服务端保持被动关闭、客户端使用连接池、必要时以 `tcp_tw_reuse` 兜底。可观测性上，eBPF 工具可实时统计 TIME_WAIT 分布，帮助把「凭经验调参」变为「按数据决策」。

`SO_REUSEPORT` 的演进还包含「平滑卸载」（如把某端口从某进程摘下时不丢连接），使滚动发布更稳。连接池与 HTTP 多路复用则从架构层消除短连接，是最彻底的「快速回收」。

## 十、小结
缓解 TIME_WAIT 压力应以扩大端口范围、复用端口、使用连接池为主，谨慎使用 `tcp_tw_reuse`，坚决避免已废弃的 `tcp_tw_recycle`。正确性优先于激进回收，连接模型优化胜过内核参数对抗。判断「谁主动关闭、端口被谁占用」永远应先于调参动作。
