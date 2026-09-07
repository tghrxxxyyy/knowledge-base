# BBR状态机STARTUP与DRAIN

> 对应 Cardwell et al. 2016（BBR 论文 §4.3 状态机）；实现见 torvalds/linux net/ipv4/tcp_bbr.c 的 bbr_set_state。

## 一、背景与挑战
BBR 需要在启动阶段快速探测可用带宽，又不致于长时间过载缓冲。为此设计了 STARTUP 与 DRAIN 两个初始状态完成"填满管道"并"排空多余排队"。

## 二、核心原理
- STARTUP：以指数增长 pacing rate 与 cwnd，目标是在约 log2(BDP) 个 RTT 内达到 BtlBw。
- DRAIN：当退出 STARTUP 后估计管道已满，以略低于 BtlBw 的速率发送，把多余 inflight 排空至 BDP。

## 三、形式化与数学基础
STARTUP 中 pacing_gain 取 2/ln2 ≈ 2.89；DRAIN 的 pacing_gain = 1/BtlBw_gain。退出 STARTUP 条件：连续三个往返估计的带宽不再显著增长（< 1.25x）。
  BDP = BtlBw * RTprop

## 四、代码实现
// bbr 状态切换核心
void bbr_set_state(struct sock *sk, u8 new_state) {
    struct bbr *bbr = inet_csk_ca(sk);
    bbr->state = new_state;
    if (new_state == BBR_DRAIN)
        bbr->pacing_gain = bbr_drain_gain;   // 1/2.89
    else if (new_state == BBR_STARTUP)
        bbr->pacing_gain = bbr_high_gain;    // 2.89
}

## 五、与其他技术对比
Reno 用慢启动阈值（ssthresh）二分降速，BBR 用模型估计直接切换，无需丢包即可进入稳态。

## 六、常见误区
1. 认为 STARTUP 与 Reno 慢启动一样靠丢包结束——BBR 靠带宽停止增长结束。
2. 忽略 DRAIN 期间吞吐会短暂低于 BtlBw。

## 七、与开源书/权威来源对应
- Cardwell et al. 2016 BBR 论文
- torvalds/linux net/ipv4/tcp_bbr.c
- Kurose & Ross《Computer Networking》拥塞控制章

## 八、面试题
BBR STARTUP 如何退出？DRAIN 的作用？STARTUP 的 gain 为何是 2.89？

## 九、演进与趋势
BBRv2 在 STARTUP 阶段即引入丢包感知，缩短过载时间，进一步保护共享链路的公平性。

## 十、小结
STARTUP 快速涨、DRAIN 及时收，使 BBR 在建立连接后迅速收敛到 BDP 工作点。
