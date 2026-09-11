# 缓冲区调优与 autotuning

> 对应 Linux Documentation/networking/ip-sysctl.txt 的 tcp_rmem/tcp_wmem 与 RFC 7323，结合 xiaolincoder/hello-http。

## 一、背景与挑战

固定大小的 socket 缓冲难以适配从局域网到跨洋长肥管道的巨大差异。缓冲过小限制吞吐（管道填不满），过大浪费内存并增加延迟与重传代价。Linux 的 TCP 缓冲 autotuning 自动按实际网络条件调整，是现代默认最佳实践，使单台机器在不同网络下都接近最优吞吐。

autotuning 的核心思想是「让缓冲跟着实际带宽-延迟走」：内核用拥塞控制测得的 BtlBw 与实际 RTT 推算合适缓冲，并在空闲内存允许范围内动态调整，避免人工设死的上限在跨网络时要么浪费要么不够。手动 SO_*BUF 在开启 autotuning 时只作为上限发挥作用，且内核会再翻倍以容纳元数据与 skb 结构。

## 二、核心原理

tcp_rmem/tcp_wmem 各为三元组 (min, default, max)，单位字节。autotuning 在 [min, max] 区间内依据实测吞吐、RTT 与空闲内存动态设置每个 socket 的实际缓冲（即「真实窗口/BDP」）。SO_RCVBUF/SO_SNDBUF 的手动设置在开启 autotuning 时仅设定上限（且内核仍翻倍）。窗口缩放（WSOPT）使 max 可远大于 64KB。

除 tcp_rmem/tcp_wmem 外，tcp_mem 控制整体 TCP 内存压力（以页为单位），超过第三值会触发内存回收甚至丢包；tcp_adv_win_scale 调节窗口与缓冲的换算比例。调优时应整体看待，而非孤立改一个参数，否则可能在内存与吞吐间顾此失彼，反而引发更隐蔽的抖动。

关键要点：

- autotuning 让缓冲随 BDP 动态调整，区间由 tcp_rmem/tcp_wmem 三元组界定。
- 手动 SO_*BUF 在开启 autotuning 时仅作上限，且内核会再翻倍。
- WSOPT 使 max 可远大于 64KB，是长肥管道跑满吞吐的前提。
- tcp_mem 是系统级 TCP 内存压力上限，超第三值触发回收甚至丢包。
- tcp_adv_win_scale 调节窗口与缓冲的换算比例，影响实际通告窗口。
- BBR 与 autotuning 协同，弱化对超大固定缓冲的依赖。

## 三、形式化与数学基础

目标缓冲约等于带宽-延迟积：

$$
BDP = BtlBw \cdot RTprop
$$

autotuning 使 $\text{rcv\_buf}$ 趋近 BDP 且不超 max。吞吐上限：

$$
\text{throughput} \approx \frac{\min(\text{window}, \text{cwnd})}{RTT}
$$

当 $\text{window} < BDP$ 时吞吐被流控限制，故高 BDP 网络需足够大的 tcp_*mem max 与 WSOPT。设实际窗口 $W = \min(\text{autotuned}, 2\cdot\text{SO\_BUF}, \text{rwnd\_field} \ll wscale)$。

## 四、代码实现

```bash
# 接收缓冲三元组：min default max（字节）
sysctl -w net.ipv4.tcp_rmem="4096 87380 16777216"
# 发送缓冲三元组
sysctl -w net.ipv4.tcp_wmem="4096 16384 16777216"
sysctl -w net.ipv4.tcp_window_scaling=1
sysctl -w net.ipv4.tcp_moderate_rcvbuf=1   # 开启接收自动调优
```
```c
/* 手动设置仅作上限，autotuning 在区间内动态调整 */
int rcv = 8 << 20;
setsockopt(fd, SOL_SOCKET, SO_RCVBUF, &rcv, sizeof rcv);
```

## 五、与其他技术对比

| 方式 | 自适应 | 调优负担 | 适用 |
|------|--------|----------|------|
| 固定 SO_RCVBUF | 否 | 高（需按网络算 BDP） | 老旧系统 |
| autotuning (默认) | 是 | 低 | 现代 Linux |
| BBR + autotuning | 是 | 低 | 高 BDP 网络 |
| UDP 缓冲 | 否 | 中 | 无拥塞控制场景 |

## 六、常见误区

误区一：调大 SO_RCVBUF 一定能提速——受 max 与对端窗口共同限制，越界无效。

误区二：autotuning 永不超限——仍在 max 内，max 设太小仍会限吞吐。

误区三：缓冲越大越稳——过大增加内存压力与重传代价，且延迟上升。

误区四：关掉 autotuning 更可控——多数情况下反而劣化跨网络吞吐。

误区五：只看 tcp_rmem——忽略 tcp_mem 的系统级内存压力会触发全局丢包。

补充误区：

- 误区六：autotuning 让手工调优无用——max 与 WSOPT 仍决定上限。
- 误区七：内存大就设超大缓冲——tcp_mem 系统级压力会拖垮其他连接。
- 误区八：autotuning 消除 RTprop 测量——仍需 BBR/拥塞控制提供 BDP 估计。
- 误区九：调大 max 一定更快——受对端窗口与拥塞共同约束。

## 七、与开源书·权威来源对应

Linux ip-sysctl.txt 文档 tcp_rmem/tcp_wmem；RFC 7323 窗口缩放；xiaolincoder/hello-http 给出高 BDP 调优示例；Kurose & Ross 讨论 BDP；BBR 论文（Cardwell 2017）描述带宽-延迟探测。落地建议：现代发行版默认开启 autotuning，多数场景无需手工设 SO_RCVBUF；仅在已知长肥管道且默认 max 不足时调大 tcp_*mem.max 并保留 WSOPT。

## 八、面试题

autotuning 依据什么调整？BDP 怎么算？为何还要 WSOPT？手动 SO_RCVBUF 的作用边界？min/default/max 各代表什么？tcp_mem 为何重要？

## 九、演进与趋势

BBR 与 autotuning 协同：BBR 测量 BtlBw/RTprop 后，内核更易把缓冲设到合适 BDP；部分场景用 BBR 可弱化对大缓冲的依赖，但仍需足够的 max 上限支撑高吞吐。eBPF 也用于按应用精细调优缓冲，甚至按 socket 粒度动态调整 tcp_*mem 区间，走向「感知型」网络栈。

## 十、小结

TCP 缓冲 autotuning 按 BDP 自动调整收发缓冲，结合窗口缩放，使单台机器在不同网络条件下都接近最优吞吐，是默认应开启的关键机制，而非手工调大 SO_*BUF；整体看待 tcp_rmem/tcp_wmem/tcp_mem 才能避免隐性瓶颈。
