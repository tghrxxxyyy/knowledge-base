# BBR 带宽与延迟测量

> 对应 Cardwell et al. 2016/2017《BBR: Congestion-Based Congestion Control》(ACM Queue / SIGCOMM) 与 Google BBR 相关文档。

## 一、背景与挑战
传统基于丢包的拥塞控制（Reno、CUBIC）把丢包当作拥塞信号：丢包就降窗，无丢包就持续增窗。这一假设在「缓冲膨胀」（bufferbloat）网络中失效——当链路中间存在大缓冲区时，发送方会一直填充队列直到缓冲区接近满溢才丢包，结果是 RTT 从几十毫秒膨胀到数百毫秒，而吞吐并未提升。用户体验表现为「带宽够但延迟高、卡顿」。

BBR 的出发点是把问题重新定义：真正决定网络容量的是「瓶颈带宽」与「传播延迟」这两个物理量，而非丢包事件。它转而持续测量这两个量并据此建模，从而在避免填满缓冲的同时保持高吞吐。

## 二、核心原理
BBR 周期性估计两个关键量：

- BtlBw（Bottleneck Bandwidth）：在一段滑动时间窗口内观测到的最大交付速率，近似瓶颈链路的带宽上限。
- RTprop（Round-trip Propagation Time）：在一段滑动窗口内观测到的最小 RTT，近似路径的传播延迟（不含排队）。

两者乘积即带宽延迟积（BDP），代表「管道中应有的数据量」。BBR 让 inflight（在途数据量）围绕这个值波动，并在四个状态间循环：

- Startup：指数式快速探测带宽上限。
- Drain：排空 Startup 期间可能过度填充的队列。
- ProbeBW：以小幅波动持续探测带宽是否增长。
- ProbeRTT：周期性把 inflight 降到极低，以测到未被排队掩盖的真实 RTprop。

## 三、形式化与数学基础
带宽延迟积定义为：

$$ \text{BDP} = \text{BtlBw} \cdot \text{RTprop} $$

发送窗口目标可表示为：

$$ W = \text{BtlBw} \cdot (\text{RTprop} + \eta) $$

其中 $\eta$ 为允许的排队余量（用于维持链路利用率，避免欠载）。当窗口控制在 BDP 附近时，队列几乎不增长，RTT 保持接近 RTprop。

速率控制通过 pacing 实现，发送速率约为：

$$ rate \approx \text{BtlBw} \cdot g $$

$g$ 为当前状态对应的增益系数。Startup 阶段使用较大的增益以快速逼近上限（BBR 论文给出约 $2/\ln 2$ 的量级，具体取值随版本与实现调整，以论文与代码为准）；ProbeRTT 则把 inflight 压到仅数个报文，让排队消散、测得接近真实的 RTprop。

## 四、代码实现
```python
# BBR 估计更新（高度简化，仅示意核心思想）
class BBR:
    def __init__(self):
        self.btlbw = 0.0          # 瓶颈带宽估计
        self.rtprop = float("inf")  # 最小 RTT 估计
        self.win_start = None

    def on_ack(self, now, delivered, rtt):
        # 窗口内最大交付速率近似瓶颈带宽
        if self.win_start is None:
            self.win_start = now
        self.btlbw = max(self.btlbw, delivered / max(now - self.win_start, 1e-9))
        # 窗口内最小 RTT 近似传播延迟
        self.rtprop = min(self.rtprop, rtt)

    def pacing_rate(self, gain):
        return self.btlbw * gain

    def cwnd(self, gain, queue_allowance):
        return self.btlbw * (self.rtprop + queue_allowance) * gain
```

```text
# 状态机（概念）
Startup -> Drain -> ProbeBW <-> ProbeRTT
- ProbeRTT 每隔一段时间触发，短暂降低 inflight 以刷新 RTprop
- BtlBw 与 RTprop 均带时间窗口，过期后需重新探测
```

## 五、与其他技术对比
| 维度 | BBR | Reno / CUBIC | Vegas |
| --- | --- | --- | --- |
| 拥塞信号 | 测量的带宽与最小 RTT | 丢包 | RTT 变化 |
| 控制方式 | 速率（pacing）为主 | 窗口为主 | 窗口为主 |
| 对缓冲膨胀 | 主动避免填充队列 | 易过度填充 | 部分缓解 |
| 竞争公平性 | 与丢包型算法竞争时存在争议 | 成熟 | 有限 |
| 适用 | 高 BDP、有缓冲的网络 | 通用 | 低延迟网络 |

Reno/CUBIC 以丢包为唯一信号，在缓冲膨胀时会把队列填满；BBR 以测量为基准，主动限制 inflight。Vegas 也用 RTT 变化，但仍属窗口式控制，BBR 是速率式且更主动地探测。需要强调：BBR 并非在所有场景都优于 CUBIC，浅队列或与丢包型算法竞争时可能不占优。

## 六、常见误区
误区一：「BBR 不用 RTT」。错，RTprop 正是其两大核心输入之一。误区二：「BBR 完全不丢包」。错，探测阶段仍可能短暂填满并丢包。误区三：「BBR 一定比 CUBIC 快」。错，需视网络条件与竞争环境而定。误区四：「min_rtt 就是当前 RTT」。错，它是一段时间窗口内的最小值，用于剔除排队成分。误区五：「关闭丢包重传也没关系」。错，BBR 只是弱化丢包作为信号，重传机制仍在。

## 七、与开源书·权威来源对应
- Cardwell et al. 2016/2017：BBR 论文，权威阐述测量建模与控制状态机。
- Google BBR 官方文档与开源实现：参数、状态与增益的具体取值。
- RFC 9002（QUIC Loss Detection and Congestion Control）：QUIC 中 RTT 估计与拥塞控制的标准化参考。
- Kurose & Ross《计算机网络：自顶向下方法》：拥塞控制章节。
- 具体增益系数、窗口时长与实现细节以 BBR 论文及实现最新版本为准。

## 八、面试题
1. BBR 测量哪两个量？它们分别近似什么物理意义？
2. 缓冲膨胀是什么？它为什么会让基于丢包的算法失效？
3. ProbeRTT 状态解决什么问题？为什么必须周期性执行？
4. BBR 与 CUBIC 的本质区别是什么？各自最适场景？
5. 为什么说 BBR 在竞争公平性上存在争议？

## 九、演进与趋势
BBR v2 致力于在保持高吞吐的同时改善与基于丢包算法的公平性，并更谨慎地处理丢包与 ECN 信号。BBR 的「测量建模」思想也影响了 QUIC 的拥塞控制设计（QUIC 同样可运行 BBR 类算法），并在数据中心与内容分发场景获得广泛部署。趋势是「模型驱动 + 公平约束」：在追求低延迟高吞吐的同时，兼顾多流共存与协议间的友好性。

## 十、小结
BBR 通过持续测量 BtlBw 与 RTprop 构建网络模型，以带宽延迟积驱动发送速率，规避了缓冲膨胀带来的高延迟。它标志着拥塞控制从「把丢包当信号」走向「用测量建模型」的范式转变。理解其两大输入与四状态机，就能理解为何它能在高 BDP 网络上同时获得高吞吐与低延迟——以及为何它并非在所有场景都胜过传统算法。
