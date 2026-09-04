# BBR算法

> 对应 Google BBR（SIGCOMM 2017）；RFC 9330（BBR v2 讨论）。

## 一、背景与挑战
基于丢包的拥塞控制（Reno/CUBIC）把“丢包=拥塞”当作前提，在高 BDP 或浅队列链路会出现 bufferbloat（填满缓冲区才丢包）或吞吐不足。BBR 改为显式建模网络。

## 二、核心原理
BBR 估计两个核心参数：瓶颈带宽 BtlBw 与最小 RTT（RTTprop）。目标发送速率 $rate = BtlBw$，目标窗口 $cwnd = BtlBw \cdot RTTprop$（即 BDP）。它分 STARTUP、DRAIN、PROBE_BW、PROBE_RTT 四状态循环，主动探测而非被动等丢包。

## 三、形式化 / 数学基础
带宽-延迟积：$BDP = BtlBw \cdot RTTprop$。
发送窗口目标：$cwnd_{target} = BtlBw \cdot RTTprop$（常再加小余量）。
状态机：STARTUP 指数增（类似慢启动但以 BtlBw 收敛为准）；DRAIN 排空；PROBE_BW 以 $1/8$ 概率小幅增减；PROBE_RTT 周期把 cwnd 压到 0.75·BDP 以测真实 RTTprop。

## 四、代码实现
```go
// BBR 核心：用 BDP 设 cwnd
cwnd = uint32(btlBw * rttProp.Seconds()) // 字节
if inProbeRTT {
    cwnd = uint32(0.75 * float64(cwnd))
}
```

## 五、与其他技术对比
Reno/CUBIC 是“反应式、丢包驱动”，BBR 是“模型式、速率驱动”。BBR 在高丢包率或浅缓冲下吞吐更稳，但可能与 Reno 共享瓶颈时抢占更多带宽（公平性质疑）。

## 六、常见误区
误区一：BBR 完全不用丢包。错，仍用丢包做次要信号。误区二：BBR 一定比 CUBIC 快。错，低延迟低 BDP 下差异小。误区三：BBR 不需要 cwnd。错，它仍受 cwnd 约束，只是按 BDP 设定。

## 七、与开源书 / 权威来源对应
- 图解网络：https://github.com/xiaolincoder/hello-http
- Google BBR 论文（SIGCOMM 2017）；RFC 9330（BBR 相关讨论）、Kurose & Ross 第 3 章。

## 八、面试题
1. BBR 估计哪两个量？答：BtlBw 与 RTTprop。2. 相比 CUBIC 解决了什么？答：bufferbloat 与高 BDP 吞吐不足。

## 九、演进与趋势
BBR v2 引入对丢包/Reno 公平性的折中，降低对丢包不敏感带来的带宽侵占。

## 十、小结
BBR 用 BtlBw×RTTprop 模型主动 pacing，跳出“丢包即拥塞”假设，是高吞吐低排队时延的代表算法。
