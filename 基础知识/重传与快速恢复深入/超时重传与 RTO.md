# 超时重传与 RTO

> 对应 RFC 793（TCP）重传要求、RFC 6298 RTO 计算，以及 xiaolincoder/hello-http 超时重传章节。

## 一、背景与挑战
TCP 必须保证可靠交付。若一段发出后长期未获 ACK，发送方需重传。判定「长期」的计时器就是重传超时（RTO），其设置过短会盲目重传、过长则恢复慢。

## 二、核心原理
每发出一个段启动重传计时器（基于 RTO）。若在 RTO 内收到覆盖该段数据的 ACK，则停止计时器；否则触发超时重传，并按 Karn 规则将 RTO 指数退避，进入慢启动。超时是「最后手段」，说明连重复 ACK 都没有，网络可能严重拥塞。

## 三、形式化与数学基础
重传计时器：当 send_unacked 非空时，超时发生在最早未确认段的 RTO 之后。退避 RTO_k = min(60, RTO_0 · 2^k)。超时后 cwnd 重置为 1（或 initcwnd 的某种实现），ssthresh = max(flight/2, 2·SMSS)，重新慢启动。

## 四、代码实现
```python
timer = reset(rto)
while not acked( seq ):
    if timer.expired():
        rto = min(60, rto*2)          # 退避
        retransmit(seq)
        cwnd = 1; ssthresh = max(flight//2, 2)
        timer = reset(rto)
```

## 五、与其他技术对比
快速重传（收到 3 个重复 ACK）比重传超时更「早」、更轻量，不进入慢启动而进入快速恢复。QUIC 用基于 RTT 的丢包检测（含时间阈值与乱序阈值）替代纯重复 ACK 计数。

## 六、常见误区
误区一：超时必进慢启动——是的，超时是最严重信号。误区二：RTO 是固定值——由 SRTT/RTTVAR 动态计算。误区三：超时重传一定丢包——也可能是 ACK 丢失导致误超时。

## 七、与开源书/权威来源对应
RFC 793 规定重传；RFC 6298 定 RTO；xiaolincoder/hello-http 给出超时示例；Kurose & Ross 在可靠传输章讨论计时器。

## 八、面试题
超时后 cwnd 怎么变？为何要退避？超时与快速重传区别？RTO 下限为何 1 秒？

## 九、演进与趋势
Tail Loss Probe（TLP）在 RTO 之前发探测段，减少尾部丢包恢复延迟；RACK 用时间序替代重复 ACK 计数，进一步改善超时判断。

## 十、小结
超时重传是 TCP 可靠性的兜底机制，基于 RTO 计时与指数退避，触发后进入慢启动，是网络严重异常时的恢复手段。
