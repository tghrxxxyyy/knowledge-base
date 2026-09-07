# TCP公平性与RTT不公平

> 对应 RFC 5681 公平性讨论与 Mathis et al. 模型；参考 Kurose & Ross《Computer Networking》。

## 一、背景与挑战
理想情况下并发 TCP 流应均分瓶颈带宽。但 AIMD 下 RTT 较小的流增长更快，导致"RTT 不公平"——短 RTT 流占更多带宽。

## 二、核心原理
Reno 每 RTT 才增 1 MSS，故吞吐近似与 RTT 成反比：
  throughput ≈ 1.22 * MSS / (RTT * sqrt(p))
两流竞争时，RTT 小的 cwnd 爬升更快，稳态窗口更大，分得更多带宽。

## 三、形式化与数学基础
Reno 稳态吞吐（Mathis 模型）：
  B ≈ (MSS / RTT) * 1.22 / sqrt(p)
公平份额应使 B_i 相等，但上式显示 B ∝ 1/RTT，故 RTT 小者占优。
两流带宽比：
  B_short / B_long ≈ RTT_long / RTT_short

## 四、代码实现
// 估算两流公平比
def tp(rtt, p): return 1.22 / (rtt * (p ** 0.5))
ratio = tp(0.01, 1e-3) / tp(0.1, 1e-3)
print("短RTT流占优倍数:", ratio)   # 约 10 倍

## 五、与其他技术对比
CUBIC 仍主要依赖丢包，RTT 不公平依旧；BBR 以带宽为目标，RTT 不公平相对缓解但仍存在（v2 改进）。

## 六、常见误区
1. 认为 TCP 天然公平——仅对同等 RTT 流公平。
2. 把 RTT 不公平当 bug——是 AIMD 结构固有特性。

## 七、与开源书/权威来源对应
- RFC 5681 (Fairness)
- Mathis et al. 1997 (TCP throughput model)
- Kurose & Ross《Computer Networking》

## 八、面试题
为何 TCP 存在 RTT 不公平？Mathis 模型公式？如何缓解？

## 九、演进与趋势
BBRv2 通过公平性反馈约束高带宽流，部分缓解 RTT 不公平。

## 十、小结
TCP 公平是相对概念，RTT 差异会破坏均分，理解模型才能解释现网现象。
