# QUIC拥塞控制机制

> 对应 RFC 9002 (QUIC Loss Detection and Congestion Control, IETF 2021)，基于 RFC 5681 NewReno 思路。

## 一、背景与挑战
QUIC 作为可靠传输必须实现拥塞控制，且需与多流、加密 ACK 帧协调。RFC 9002 给出基于 NewReno 的参考算法。

## 二、核心原理
QUIC 维护 cwnd 与 ssthresh，采用慢启动与拥塞避免阶段，并用数据包编号（PN）而非序列号判断丢包，避免 TCP 序列号歧义。

## 三、形式化与数学基础
慢启动：
  cwnd += min(acked, max_datagram_size)  每收到一个 ACK
拥塞避免（AIMD）：
  cwnd += max_datagram_size * (acked / cwnd)
丢包后：
  ssthresh = cwnd * 0.5;  cwnd = ssthresh (乘性减)

## 四、代码实现
// RFC 9002 简化实现
void quic_on_ack(quic_cc *cc, u64 acked) {
    if (cc->cwnd < cc->ssthresh)
        cc->cwnd += min(acked, MSS);            // SS
    else
        cc->cwnd += MSS * (acked / cc->cwnd);    // CA
}
void quic_on_loss(quic_cc *cc) {
    cc->ssthresh = cc->cwnd / 2;
    cc->cwnd = cc->ssthresh;
}

## 五、与其他技术对比
QUIC 的 PN 单调且加密，丢包检测比 TCP 更精确；拥塞算法可插拔（如 BBR over QUIC）。

## 六、常见误区
1. 认为 QUIC 无拥塞控制——与 TCP 一样必须实现。
2. 混淆流级流控（flow control）与连接级拥塞控制。

## 七、与开源书/权威来源对应
- RFC 9002 (IETF 2021)
- RFC 5681 (TCP Congestion Control)
- Cardwell et al. 2016（BBR over QUIC 扩展）

## 八、面试题
QUIC 拥塞控制与 TCP 异同？PN 对丢包检测有何好处？

## 九、演进与趋势
BBR、CUBIC 等已在多个 QUIC 实现中集成，拥塞算法生态与 TCP 趋同。

## 十、小结
QUIC 拥塞控制复用了 TCP 数十年的成熟算法，并以加密 PN 提升了检测精度。
