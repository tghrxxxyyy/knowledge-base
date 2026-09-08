# 时间戳选项与 RTTM

> 对应 RFC 7323（TCP 时间戳选项，原 RFC 1323）与 RFC 6298 的 RTTM（Round-Trip Time Measurement）说明。

## 一、背景与挑战
Karn 算法因重传二义性需丢弃样本，导致重传后 RTT 估计「失明」。TCP 时间戳选项（TSOPT）在段中携带发送时刻，ACK 回显该时刻，使发送方能量化 ACK 延迟，从而在重传场景下也能安全测量 RTT。

## 二、核心原理
SYN 协商启用 TSOPT 后，每段带 TSval（发送方时钟）；接收方在 ACK 中把最近收到的 TSval 放入 TSecr。发送方收到 ACK 时，RTT 样本 = 当前时钟 - TSecr，从而精确得到该确认对应的发送时刻差，排除中间排队导致的二义。

## 三、形式化与数学基础
RTT_sample = T_now - TSecr，其中 TSecr 为被确认数据最初发送时的 TSval。由于 TSval 单调递增，即使发生重传，只要 ACK 的 TSecr 指向原始发送时刻，样本依然有效（不再受 Karn 丢弃约束）。时钟粒度需足够细（建议 1ms 级）。

## 四、代码实现
```c
/* 发送：写入当前时间戳 */
tcp_hdr->tsval = get_ts();
/* 接收 ACK：用回显计算 */
if (opt.tsecr) {
    sample = now - opt.tsecr;
    rto_update(sample);   /* 即便曾重传也可用 */
}
```

## 五、与其他技术对比
无 TSOPT 时只能依赖 Karn 丢弃重传样本，估计在丢包期变盲；TSOPT 提供端到端时钟回显，类似思想也见于 QUIC 的 ACK 帧携带的 delay。缺点是每段多 10 字节选项开销（在选项空间紧张时受限）。

## 六、常见误区
误区一：TSOPT 用于加密——仅为测量与 PAWS，不涉及安全。误区二：开着就不需要 Karn——退避仍保留，Karn 的保守在极端仍生效。误区三：时间戳要全局同步——只需单调，无需时钟同步。

## 七、与开源书/权威来源对应
RFC 7323 第 3 节定义 TSOPT 与 RTTM；RFC 6298 附录认可其价值；xiaolincoder/hello-http 说明其用法；Kurose & Ross 提及测量增强。

## 八、面试题
TSecr 是什么？TSOPT 如何消除二义？PAWS 与 TSOPT 关系？为何不需要时钟同步？

## 九、演进与趋势
在高速长肥管道（LFN）中 TSOPT 还支撑 PAWS（防止序号回绕），与窗口缩放一同启用；其测量能力也被 BBR 用于估计 min_rtt。

## 十、小结
TCP 时间戳选项通过 TSval/TSecr 回显实现精确的 RTTM，弥补 Karn 算法的测量盲区，是现代 TCP 性能与准确性的重要选项。
