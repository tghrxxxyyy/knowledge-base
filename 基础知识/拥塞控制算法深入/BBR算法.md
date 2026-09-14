# BBR算法

> 对应 Google BBR 论文（Cardwell et al., SIGCOMM 2017）；RFC 9330（L4S/BBR 相关讨论）；Kurose & Ross《Computer Networking》第3章。

## 一、背景与挑战

传统「基于丢包」的拥塞控制（Reno、CUBIC）把「丢包 = 拥塞」当作隐含前提：它们持续填满瓶颈队列直到丢包才降速。这在两个场景会出问题：一是高带宽-时延积（BDP）的「长肥管道」，队列填满前已浪费大量容量；二是现代网络中普遍存在的「浅缓冲 / bufferbloat」——发送方把几 MB 的队列填满才丢包，导致极高的排队时延（秒级），VoIP、游戏等对时延敏感的应用严重受损。BBR（Bottleneck Bandwidth and RTT）跳出了「丢包即拥塞」假设，改为显式地测量网络的两个核心参数并据此主动控制发送速率。

## 二、核心原理

BBR 周期性地估计两个量：

1. 瓶颈带宽 `BtlBw`：在最近一段时间内观测到的、能持续维持的最大投递速率。
2. 最小 RTT `RTTprop`：在最近一段时间内观测到的最小往返时延（代表「真实」传播时延，不含排队）。

由此得到带宽-时延积 `BDP = BtlBw · RTTprop`，它等于「在途未被确认的数据量的最优值」。BBR 据此设定两个控制量：目标发送速率 `pacing_rate = BtlBw`，目标拥塞窗口 `cwnd = BDP`（常外加一个 2–3 倍的小余量以容忍测量噪声）。整个算法由四个状态循环驱动：

- STARTUP：指数增长探测 BtlBw（类似慢启动，但以「带宽不再增长」为准退出）。
- DRAIN：排空 STARTUP 期间注入的多余数据，使在途量回落到 BDP。
- PROBE_BW：稳态，以 $1/8$ 概率小幅增减速率，在利用带宽与保持低时延间平衡。
- PROBE_RTT：周期性（默认每 10 秒）把 `cwnd` 压到约 $0.75\cdot BDP$ 持续一个 RTT，以重新测量真实的 `RTTprop`（防止被持续排队抬高）。

## 三、形式化与数学基础

带宽-时延积：

$$ BDP = BtlBw \cdot RTTprop $$

目标拥塞窗口：

$$ cwnd_{target} = BtlBw \cdot RTTprop \cdot (1 + \text{余量}) $$

PROBE_RTT 期间：

$$ cwnd_{probe\_rtt} = 0.75 \cdot BDP $$

STARTUP 退出判据（带宽收敛）：若本轮测得的 `BtlBw` 相对上一轮增长低于阈值（如 1.25 倍以内），则认为已探测到瓶颈带宽，转入 DRAIN。PROBE_BW 的增益序列在一个周期内使平均速率约等于 BtlBw，同时在部分周期临时超出以探测更高带宽。

## 四、代码实现

下面是 BBR 设定 `cwnd` 与 `pacing_rate` 的简化逻辑（Go 风格伪代码）：

```go
// BBR 核心：用 BDP 设定目标窗口与 pacing 速率
func (b *bbr) updateControls() {
    bdp := b.btlBw * b.rttProp.Seconds()      // 字节
    b.cwnd = uint32(bdp * 1.0)
    if b.state == probeRTT {
        b.cwnd = uint32(0.75 * float64(b.cwnd)) // 压窗口测 RTTprop
    }
    b.pacingRate = b.btlBw                      // 按瓶颈带宽平滑发送
}

// STARTUP 退出：带宽不再明显增长
func (b *bbr) maybeExitStartup() {
    if b.btlBw <= b.lastBtlBw*1.25 {
        b.state = drain
    }
    b.lastBtlBw = b.btlBw
}
```

## 五、与其他技术对比

| 维度 | Reno / CUBIC | BBR |
| --- | --- | --- |
| 控制依据 | 丢包信号（反应式） | BtlBw×RTTprop 模型（主动式） |
| 队列占用 | 填满才降速（bufferbloat） | 维持 ~BDP，低排队 |
| 高 BDP 吞吐 | CUBIC 较好、Reno 差 | 优 |
| 公平性 | 彼此公平 | 与 Reno 混合时被认为占优 |

BBR 在高丢包率或浅缓冲链路上吞吐更稳定、排队时延更低，但正因为它不「等丢包」，在和 Reno/CUBIC 共享瓶颈时可能占用更多带宽，这是其公平性争议的根源。

## 六、常见误区

误区一：BBR 完全不用丢包。错——它仍把丢包作为次要信号（极端丢包率下会降速），只是不再依赖丢包作为主反馈。

误区二：BBR 一定比 CUBIC 快。错——在低时延、低 BDP 的局域网或短连接上，两者差异很小，甚至 CUBIC 因激进而略快。

误区三：BBR 不需要 `cwnd`。错——它仍受 `cwnd` 约束（受限于在途数据量），只是按 BDP 设定而非被动等待丢包。

误区四：RTTprop 是固定的。错——它必须靠 PROBE_RTT 周期性重测，否则真实传播时延变化（如路由改变）会让模型失真。

## 七、与开源书·权威来源对应

- Cardwell et al. 2017 在 SIGCOMM 发表的 BBR 论文完整给出四状态机、BtlBw/RTTprop 估计方法与公平性讨论。
- RFC 9330（L4S）及相关草案讨论 BBR 与低时延拥塞信号的结合。
- Kurose & Ross《Computer Networking》第3章对「网络辅助 vs 端到端」「延迟与带宽权衡」的讨论有助于理解 BBR 设计动机。
- 图解网络（xiaolincoder/hello-http）有面向工程师的 BBR 图解。

## 八、面试题

1. BBR 估计哪两个量？要点：BtlBw（瓶颈带宽）与 RTTprop（最小 RTT），乘积即 BDP。
2. BBR 相比 CUBIC 解决了什么？要点：bufferbloat 与高 BDP 下吞吐不足，主动 pacing 降低排队时延。
3. PROBE_RTT 的作用？要点：周期性压低窗口以重新测量真实 RTTprop，防止被排队时延污染。
4. 为什么说 BBR 不公平？要点：不依赖丢包降速，与 Reno 共享瓶颈时占用更多带宽，BBR v2 做了折中。

## 九、演进与趋势

BBR v2 引入对丢包率的敏感性与与 Reno 的公平性折中，降低对丢包不敏感带来的带宽侵占；与 L4S（RFC 9330/9331）结合可进一步把排队时延压到亚毫秒级。学术界还有基于机器学习的拥塞控制（如 Aurora、Indigo）探索用强化学习替代手工调参的增益曲线。

## 十、小结

BBR 用「BtlBw × RTTprop」的显式网络模型替代「丢包即拥塞」的隐含假设，以 STARTUP/DRAIN/PROBE_BW/PROBE_RTT 四状态主动 pacing，在保持高吞吐的同时大幅压低排队时延，是现代拥塞控制从「反应式」走向「模型式」的代表。
