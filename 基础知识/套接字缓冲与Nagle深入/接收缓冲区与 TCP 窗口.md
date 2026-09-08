# 接收缓冲区与 TCP 窗口

> 对应 RFC 793 窗口字段、RFC 7323 窗口缩放与 xiaolincoder/hello-http 的接收缓冲说明。

## 一、背景与挑战
TCP 用「接收窗口（rwnd）」告知对端自己还能收多少数据，防止发送方淹没接收方。rwnd 直接由接收缓冲区剩余空间决定。窗口过小会限制吞吐（尤其长肥管道），窗口缩放则解决 16 位窗口上限不足的问题。

## 二、核心原理
接收方在每次 ACK 中通告 rwnd = 接收缓冲剩余（受 SO_RCVBUF 限制）。发送方保证「已发未确认」不超过 rwnd。RFC 7323 的窗口缩放（WSOPT）在握手时协商一个移位因子（0–14），使窗口最大可达约 1 GB，适配高 BDP 网络。接收缓冲不足会直接「缩小窗口」形成流控背压。

## 三、形式化与数学基础
通告窗口 rwnd = RCV_BUF - 已收未读（应用未取走的数据）。有效窗口 = min(cwnd, rwnd)（发送方视角）。开启缩放后，实际窗口 = 报文 window 字段 << wscale。为避免「小窗口傻等」，TCP 用糊涂窗口综合征（SWS） avoidance：仅当窗口增长到足够大才通告/发送。

## 四、代码实现
```bash
# 握手启用窗口缩放（wscale=7 表示 <<7）
sysctl -w net.ipv4.tcp_window_scaling=1
```
```c
int rcv = 4 << 20;  /* 4 MB 接收缓冲 */
setsockopt(fd, SOL_SOCKET, SO_RCVBUF, &rcv, sizeof rcv);
```

## 五、与其他技术对比
UDP 无流控窗口，接收缓冲溢出即丢包；TCP 窗口是端到端流控核心。QUIC 的 flow control 在流与连接两级独立做窗口，比 TCP 的单连接窗口更细。

## 六、常见误区
误区一：窗口越大越好——受 RCV_BUF 与对端 cwnd 共同限制，且过大增加内存与重传成本。误区二：16 位窗口够用——长肥管道下必须 WSOPT。误区三：窗口只由对端控制——本端应用读取速度直接决定剩余空间。

## 七、与开源书/权威来源对应
RFC 793 定义窗口；RFC 7323 窗口缩放；man socket(7) 的 SO_RCVBUF；xiaolincoder/hello-http 图示窗口；Kurose & Ross 讨论流控。

## 八、面试题
rwnd 由什么决定？为何需要窗口缩放？糊涂窗口综合征是什么？SO_RCVBUF 与吞吐关系？

## 九、演进与趋势
自动调优（tcp_rmem）按 BDP 动态扩缩接收缓冲；Linux 还支持 TCP 接收缓冲的 forward RTT 感知，进一步适配高带宽延迟网络。

## 十、小结
接收缓冲区大小直接映射为 TCP 接收窗口，是端到端流控的闸门；窗口缩放让高 BDP 网络也能获得足够吞吐。
