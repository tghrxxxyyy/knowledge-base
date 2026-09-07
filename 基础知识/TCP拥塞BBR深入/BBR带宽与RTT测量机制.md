# BBR带宽与RTT测量机制

> 对应 Cardwell et al. 2016（BBR 论文 §3 测量模型）；实现见 torvalds/linux net/ipv4/tcp_bbr.c 的 bbr_update_bw / bbr_update_min_rtt。

## 一、背景与挑战
BBR 的一切决策都依赖两个噪声测量的估计：交付带宽与 RTT。如何从带噪声的样本中得到稳定、不过时的估计是关键。

## 二、核心原理
- 带宽：每个 ACK 计算 deliveryRate = delivered / interval，取带时间窗口的滑动最大值（max-filter，窗口 10 个 RTT）。
- RTT：取观测 RTT 的时间窗口滑动最小值（min-filter，窗口 10 秒），避免瞬时排队污染。

## 三、形式化与数学基础
BtlBw 估计使用窗口 w 的最大滤波器：
  BtlBw = max_{t in [now-w, now]} deliveryRate(t)
RTprop 估计：
  RTprop = min_{t in [now-10s, now]} RTT(t)

## 四、代码实现
// 滑动最大带宽 (windowed max filter)
void bbr_update_bw(struct sock *sk, u32 delivered, u32 interval_us) {
    u32 rate = delivered * USEC_PER_SEC / max(interval_us, 1);
    if (rate > bbr->bw) bbr->bw = rate; // max over window
}
// 滑动最小 RTT
void bbr_update_min_rtt(struct sock *sk, u32 rtt_us) {
    if (rtt_us < bbr->min_rtt) bbr->min_rtt = rtt_us;
}

## 五、与其他技术对比
Reno 用 cwnd 隐式反映带宽，BBR 显式独立估计带宽与 RTT，解耦更清晰。

## 六、常见误区
1. 用瞬时速率代替 max-filter 会被噪声严重低估。
2. min-filter 窗口过短会导致 RTprop 偏大，进而 BDP 高估。

## 七、与开源书/权威来源对应
- Cardwell et al. 2016 BBR 论文
- torvalds/linux net/ipv4/tcp_bbr.c
- Kurose & Ross《Computer Networking》

## 八、面试题
为何带宽用 max-filter、RTT 用 min-filter？窗口长度如何影响稳定性？

## 九、演进与趋势
BBRv2 引入 EWMA 与更多样本统计量，降低短流测量方差。

## 十、小结
max-filter 保带宽、min-filter 保时延，是 BBR 鲁棒性的数学基础。
