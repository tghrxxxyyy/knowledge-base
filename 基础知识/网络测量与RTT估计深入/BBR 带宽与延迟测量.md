# BBR 带宽与延迟测量

> 对应 Cardwell et al. 2016/2017（BBR: Congestion-Based Congestion Control，SIGCOMM）以及 Google BBR 文档，结合 xiaolincoder/hello-http。

## 一、背景与挑战
传统基于丢包的拥塞控制（Reno/CUBIC）把丢包当作拥塞信号，在缓冲区大的「缓冲膨胀」网络中会让 RTT 剧烈上升、吞吐却不高。BBR 转而直接测量网络的「带宽（BtlBw）」与「最小往返延迟（RTprop）」，以模型驱动发送速率。

## 二、核心原理
BBR 周期性估计两个关键量：BtlBw = 在一段窗口内测得的最大交付速率；RTprop = 在一段窗口内测得的最小 RTT。二者乘积即为 BDP（带宽延迟积），理想发送量 ≈ BtlBw · RTprop。BBR 在 Startup、Drain、ProbeBW、ProbeRTT 四个状态间切换以探测与跟踪这两个量。

## 三、形式化与数学基础
BDP = BtlBw · RTprop。发送窗口目标为 W = BtlBw · (RTprop + 排队余量)。ProbeRTT 阶段刻意把 inflight 降到约 4 个段以测到接近真实的 RTprop，避免持续排队掩盖最小延迟。速率控制：pacing_rate ≈ BtlBw · 增益系数（Startup 为 2/(ln2)≈2.89）。

## 四、代码实现
```python
def on_ack(now, delivered, rtt):
    btlbw = max(btlbw, delivered / (now - send_time))
    rtprop = min(rtprop, rtt)            # 滑动窗口内取最小
    bdp = btlbw * rtprop
    pacing_rate = btlbw * GAIN
```

## 五、与其他技术对比
Reno/CUBIC 以丢包为唯一拥塞信号，易在缓冲膨胀时过度填充队列；BBR 以测量的 BtlBw/RTprop 为基准，主动限制 inflight 以避免缓冲膨胀。Vegas 也用 RTT 变化但属窗口式，BBR 是速率式且更激进探测。

## 六、常见误区
误区一：BBR 不用 RTT——RTprop 正是其核心输入。误区二：BBR 完全不丢包——探测阶段仍可能短暂填满。误区三：BBR 一定比 CUBIC 快——在浅队列或竞争公平场景下未必。

## 七、与开源书/权威来源对应
Cardwell 2016/2017 SIGCOMM 论文为权威；Google BBR 主页与文档；xiaolincoder/hello-http 对比 BBR 与 CUBIC；Kleppmann《DDIA》讨论吞吐与延迟权衡。

## 八、面试题
BBR 测哪两个量？缓冲膨胀是什么？ProbeRTT 做什么？BBR 与 CUBIC 本质区别？

## 九、演进与趋势
BBR v2 致力于在保持高吞吐的同时改善与基于丢包算法的公平性；其思想也影响 QUIC 拥塞控制（QUIC 同样可运行 BBR 模型）。

## 十、小结
BBR 通过持续测量 BtlBw 与 RTprop 构建网络模型，以带宽延迟积驱动发送，规避缓冲膨胀，是现代拥塞控制从「丢包信号」走向「测量建模」的代表。
