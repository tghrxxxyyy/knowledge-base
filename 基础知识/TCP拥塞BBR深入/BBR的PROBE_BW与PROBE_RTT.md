# BBR的PROBE_BW与PROBE_RTT

> 对应 Cardwell et al. 2017（BBR 论文 §4.4）；实现见 torvalds/linux net/ipv4/tcp_bbr.c 的 bbr_probe_bw_mode / bbr_probe_rtt。

## 一、背景与挑战
稳态下 BBR 需要持续探测带宽是否变化（链路可能波动），同时定期测量真实最小 RTT（防止 RTprop 估计被旧值污染）。

## 二、核心原理
- PROBE_BW：以 8 相位循环（gain 序列 1.25,0.75,1,1,1,1,1,1）轮流增/减速率，探测可用带宽同时维持公平。
- PROBE_RTT：每至少 10 秒进入一次，将 cwnd 降到 4 个 MSS 持续 200ms，以测得无排队的最小 RTT。

## 三、形式化与数学基础
带宽探测平均 gain 为 1，长期不偏载：
  mean(gain) = (1.25 + 0.75 + 6*1)/8 = 1
PROBE_RTT 维持时间固定为 min_rtt 窗口 200ms。

## 四、代码实现
// 8 相位 gain 表
const int bbr_pacing_gain[] = {5, 3, 1, 1, 1, 1, 1, 1}; // *0.25
void bbr_probe_rtt(struct sock *sk) {
    bbr->cwnd = 4 * mss; // 强制收小
    bbr->probe_rtt_done_stamp = now + 200;
}

## 五、与其他技术对比
Reno 的速率仅由 cwnd 决定，BBR 分离 pacing rate 与 cwnd，使探测更平滑、延迟更稳。

## 六、常见误区
1. 认为 PROBE_RTT 会大幅降吞吐——因为它很少触发且时间短。
2. 混淆 PROBE_BW 的增益与丢包无关，仅是主动探测。

## 七、与开源书/权威来源对应
- Cardwell et al. 2017 BBR 论文
- torvalds/linux net/ipv4/tcp_bbr.c
- xiaolincoder/hello-http（拥塞控制）

## 八、面试题
PROBE_BW 的增益序列如何保证公平性？PROBE_RTT 为何要降 cwnd？

## 九、演进与趋势
BBRv2 将带宽/时延探测与丢包反馈耦合，在 PROBE_BW 中也考虑丢包下降幅度。

## 十、小结
PROBE_BW 持续感知带宽、PROBE_RTT 定期校准时延，二者使 BBR 长期稳定收敛于真实 knee。
