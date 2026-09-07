# BBR拥塞控制算法原理

> 对应 Cardwell, Cheng, Mathis & Yeh 2016 (BBR: Congestion-Based Congestion Control, ACM Queue) 与 Linux 内核实现 torvalds/linux（net/ipv4/tcp_bbr.c）。

## 一、背景与挑战
基于丢包的拥塞控制（Reno/CUBIC）把丢包等同于拥塞，会填满交换机/路由器缓冲，造成 bufferbloat 与高延迟。Google 提出的 BBR 改为直接测量瓶颈带宽与最小 RTT，建立网络模型来驱动发送。

## 二、核心原理
BBR 维护两个估计量：BtlBw（瓶颈带宽）与 RTprop（最小传播时延）。二者乘积即 BDP：
  BDP = BtlBw * RTprop
BBR 的目标是以 BtlBw 速率，保持 inflight 约为 BDP，从而既打满带宽又不制造排队。

## 三、形式化与数学基础
最优工作点位于带宽-时延二维平面的"knee"：
  inflight <= BDP
  rate <= BtlBw
RTprop 取观测 RTT 的滑动最小；BtlBw 取交付速率的滑动最大（带指数加权）。

## 四、代码实现
Linux 内核以拥塞控制回调注册 BBR：
// net/ipv4/tcp_bbr.c
static struct tcp_congestion_ops tcp_bbr_ops = {
    .name        = "bbr",
    .init        = bbr_init,
    .cong_control= bbr_main,
    .ssthresh    = bbr_ssthresh,
    .undo_cwnd   = bbr_undo_cwnd,
};
int bbr_register(void) {
    return tcp_register_congestion_control(&tcp_bbr_ops);
}

## 五、与其他技术对比
Reno/CUBIC 是"探测丢包"式，BBR 是"测量模型"式。BBR 在高 BDP、无线链路上延迟显著更低，但与基于丢包的算法混部时更激进。

## 六、常见误区
1. 认为 BBR 完全不用丢包——丢包仍触发重传，只是不降速。
2. 认为 BBR 不用 cwnd——cwnd 仍作为 inflight 上界，只是由模型计算而非 ssthresh 二分。

## 七、与开源书/权威来源对应
- Cardwell et al. 2016/2017《BBR: Congestion-Based Congestion Control》
- torvalds/linux net/ipv4/tcp_bbr.c
- xiaolincoder/hello-http（图解网络·拥塞控制）

## 八、面试题
BBR 与 CUBIC 的核心区别？BDP 是什么？为什么 BBR 能降低延迟？

## 九、演进与趋势
BBRv2 引入对丢包与公平性的显式建模（Google 后续论文），在保留低延迟的同时改善与传统算法的带宽公平性。

## 十、小结
BBR 用带宽与 RTT 测量替代丢包信号，以 BDP 为发送上界，是拥塞控制从"被动反应"到"主动建模"的范式转变。
