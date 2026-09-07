# QUIC丢包恢复与ACK机制

> 对应 RFC 9002 §4-§6（Loss Detection and Congestion Control）；ACK 帧格式见 RFC 9000 §19.3。

## 一、背景与挑战
QUIC 需要区分"丢包"与"乱序"，并在 RTT 波动时避免过早重传。它用基于 PN 的定时器（PTO）与乱序阈值触发重传。

## 二、核心原理
- 尾部丢包：PTO（Probe Timeout）超时触发 1 或 2 个探测包。
- 乱序丢包：当收到 PN 比期望大至少 k（默认 3）的 ACK，触发快速重传。
- ACK 帧可携带多个 [gap, range] 块，压缩确认。

## 三、形式化与数学基础
PTO 计算（类似 RTO）：
  PTO = smoothed_rtt + max(4*rttvar, timer_gran) + max_ack_delay
乱序阈值：
  if (largest_acked - pn) >= k: mark lost

## 四、代码实现
// 伪代码：ACK 处理与丢包标记
void quic_detect_loss(quic_sent *s, u64 largest_acked) {
    for (pkt in unacked_below(largest_acked))
        if (largest_acked - pkt.pn >= 3)
            mark_lost(pkt);   // 快速重传
}
void quic_pto_fire(quic_conn *c) {
    quic_send(c, FRAME_PING);  // 探测
    quic_send(c, FRAME_PADDING);
}

## 五、与其他技术对比
TCP SACK 也支持块确认，但 QUIC ACK 帧更紧凑且天然加密；PTO 取代 RTO 思路更简洁。

## 六、常见误区
1. 认为 PTO 等于 RTO——PIO 触发探测而非立即降速。
2. 忽略 max_ack_delay 会放大 PTO，影响尾延迟。

## 七、与开源书/权威来源对应
- RFC 9002 §4-§6
- RFC 9000 §19.3 (ACK Frame)
- xiaolincoder/hello-http

## 八、面试题
QUIC 如何区分乱序与丢包？PTO 与 RTO 区别？

## 九、演进与趋势
早期重传（early retransmit）与尾损探测持续优化，减少小流尾延迟。

## 十、小结
基于 PN 的 PTO 与乱序阈值，使 QUIC 丢包恢复既精确又抗抖动。
