# TCP Reno与快速重传

> 对应 RFC 5681 (Reno 行为) 与 Jacobson 1988；参考 xiaolincoder/hello-http。

## 一、背景与挑战
丢包后若等 RTO 超时再重传，吞吐骤降且恢复慢。Reno 引入基于重复 ACK 的快速重传/快速恢复，避免等到超时。

## 二、核心原理
- 收到 3 个重复 ACK（dup ACK）即判定单包丢失，立即重传（快速重传）。
- 进入快速恢复：ssthresh=cwnd/2，cwnd=ssthresh+3，之后每 dup ACK 线性增，新 ACK 后退出恢复。

## 三、形式化与数学基础
触发：
  dupack_count >= 3 -> fast_retransmit
快速恢复：
  ssthresh = cwnd / 2
  cwnd = ssthresh + 3*MSS
退出恢复（收到新 ACK）：
  cwnd = ssthresh
对比超时：RTO 触发则 cwnd=1 重回慢启动，代价更大。

## 四、代码实现
// Reno 快速重传（简化）
if (dup_acks >= 3 && !recovery) {
    ssthresh = cwnd / 2;
    retransmit(lost_seq);
    cwnd = ssthresh + 3;
    recovery = true;
}
// 收到新 ACK
if (recovery && seq > recover_point) {
    cwnd = ssthresh;
    recovery = false;
}

## 五、与其他技术对比
Tahoe 丢包一律 cwnd=1；Reno 仅减半并恢复，吞吐更好，但多包丢失时仍退化。

## 六、常见误区
1. 3 个 dup ACK 是阈值非精确——实际可能更多。
2. 多包丢失时 Reno 每 RTT 仅恢复一个，效率差（引出 SACK/NewReno）。

## 七、与开源书/权威来源对应
- RFC 5681
- Jacobson 1988
- xiaolincoder/hello-http

## 八、面试题
为何 3 个 dup ACK 触发重传？快速恢复比超时好在哪？

## 九、演进与趋势
SACK/NewReno 解决多包丢失，CUBIC 改进高速恢复。

## 十、小结
Reno 的快速重传/恢复是以较小代价应对单包丢失的关键优化。
