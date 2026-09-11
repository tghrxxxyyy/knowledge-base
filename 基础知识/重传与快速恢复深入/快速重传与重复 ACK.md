# 快速重传与重复 ACK

> 对应 RFC 5681（TCP Congestion Control）快速重传规则与 xiaolincoder/hello-http 丢包恢复说明。

## 一、背景与挑战
超时重传恢复极慢：发送方要苦等 RTO（常达数百毫秒到秒级）才能重传，期间管道空转、吞吐骤降。但很多丢包只是「个别段丢失」、后续段仍正常到达——接收方因此不断发重复 ACK（dup ACK）。发送方可利用这些 dup ACK「提前」判断丢包并立即重传，不必等超时，这就是快速重传（fast retransmit）。它把恢复时延从 RTO 量级降到「几个 RTT 内」。

快速重传是现代 TCP 吞吐的支柱：没有它，任何单段丢失都要等 RTO，Web 页面、视频流等短事务会卡顿明显。它和快速恢复、SACK 一起构成「不靠超时也能恢复」的三件套，也是用户在浏览器里「网页偶尔卡一下又恢复」背后的机制。

从信息论角度看，dup ACK 是接收方在「无法主动通知」的约束下，能提供的最高效丢包信号：它无需新增报文类型，完全复用正常 ACK，成本几乎为零。

## 二、核心原理
当接收方收到一个「失序段」（序号上有洞），它每收到一个后续段就回一个重复 ACK，指明它期望、却未收到的那一段序号。发送方累计收到 3 个重复 ACK（RFC 5681 的 dupthresh $=3$）即推断「被期望的那一段已丢失」，不等超时立即重传该段，并进入快速恢复、把 cwnd 减半。第 3 个 dup ACK 是经验阈值：少于 3 个可能是正常乱序（一个段迟到），达到 3 个则丢包概率极高。

重复 ACK 本质上是接收方的「免费信令」：它不需要额外报文，只是对正常到达段的正常确认，却顺带告诉发送方「我这边有个洞」。这种复用让快速重传几乎零成本——不必引入任何新报文类型，完全借用了已有 ACK 的语义。

但「免费」也有代价：当路径重排严重时，迟到的段会制造大量 dup ACK，造成误判。这正是后续 RACK 用时间序替代计数的动机。

## 三、形式化与数学基础
令 dup_ack_count 为自上次新数据 ACK 以来连续的重复 ACK 数。触发快速重传条件：

$$ \text{dup\_ack\_count} \ge 3 \;\Rightarrow\; \text{retransmit}(seq_{\text{expected}}),\; \text{enter fast recovery} $$

进入时：$\text{ssthresh} = \max(\text{flight}/2,\, 2\cdot\text{SMSS})$，$\text{cwnd} = \text{ssthresh} + 3\cdot\text{SMSS}$。每再收一个 dup ACK：$\text{cwnd} += \text{SMSS}$（让管道继续流动，见「快速恢复与拥塞窗口」）。flight 为在途未确认字节数。

dupthresh 在现代 Linux 中可随 SACK 信息动态提高（如 FACK 下设为更大值），以适配高 BDP 链路，避免在高带宽下因 3 个 dup ACK 不够而误判。dup ACK 计数在遇到 new ACK 时会清零，避免历史计数干扰后续判断。

## 四、代码实现
```python
MSS = 1460
SLOW_START, FAST_RECOVERY, CONG_AVOID = 0, 1, 2

def on_ack(seg, is_duplicate):
    global dup, cwnd, ssthresh, state
    if is_duplicate:
        dup += 1
        if state == SLOW_START and dup == 3:
            ssthresh = max(flight // 2, 2 * MSS)
            retransmit(lost_seq)        # 快速重传
            cwnd = ssthresh + 3 * MSS
            state = FAST_RECOVERY
        elif state == FAST_RECOVERY:
            cwnd += MSS
    else:
        dup = 0
        # 新数据 ACK：退出快速恢复
        if state == FAST_RECOVERY:
            cwnd = ssthresh
            state = CONG_AVOID
```

Linux 实际用 `tcp_dupack_one` / `tcp_add_reno_sack` 等维护 dup 计数，并结合 `icsk_retransmits` 区分超时与快速路径。注意 dup ACK 计数在遇到 new ACK 时会清零，避免历史计数干扰后续判断。

此外，SACK 启用时，dup ACK 还用于推进 scoreboard，其「重复」语义与空洞信息结合，比纯 Reno 更精确。

## 五、与其他技术对比

| 恢复方式 | 触发 | 是否进慢启动 | 代价 |
| --- | --- | --- | --- |
| 超时重传 | RTO 到期 | 是（cwnd$=1$） | 大 |
| 快速重传 | 3 dup ACK | 否（快速恢复） | 小 |
| RACK | 时间序 | 否 | 更小、更准 |
| SACK 增强 | 精确洞信息 | 否 | 多段丢失更高效 |
| TLP | 尾部探测 | 否 | 尾部丢失更早恢复 |

纯靠 3 dup ACK 在「丢失多段」或「严重乱序」时不够，故 SACK 与 RACK 进一步增强。QUIC 类似地用 ACK 帧的缺失范围触发重传，且天然带时间信息，因此能在更早的时机判定丢失，不必死守 3 个重复确认。

## 六、常见误区
- 误区一：3 个 dup ACK 一定意味着丢包。也可能是大量乱序（如路径重排使一个段严重迟到），此时重传是「伪重传」。
- 误区二：快速重传后进入慢启动。实际进入快速恢复，cwnd 半速而非归 1。
- 误区三：dupthresh 固定为 3。现代实现可自适应（SACK/FACK 下动态提高），尤其高 BDP 链路。
- 误区四：dup ACK 是接收方「主动」发的。它是接收方对每个失序到达段的「被动」确认响应。
- 误区五：快速重传重传所有未确认段。只重传被判定丢失的那一段（或空洞段），其余不重传。
- 误区六：dup ACK 计数永不重置。遇到 new ACK 即清零，否则会误判后续状态。
- 误区七：快速重传与拥塞控制无关。它同时触发 cwnd 减半与快速恢复，是拥塞响应的组成部分。

## 七、与开源书·权威来源对应
RFC 5681 第 3.2 节定义快速重传与 dupthresh $=3$。xiaolincoder/hello-http 用抓包图展示 3 个 dup ACK 触发重传。Kurose & Ross《Computer Networking》在 TCP 可靠传输章讲解。RFC 2581、RFC 2001 是早期 Reno 规范的来源。Linux `tcp_input.c` 中 `tcp_fastretrans_alert` 是快速重传/恢复的状态机核心，整合了 dup ACK、SACK 与 RACK 的多路判定。

具体阈值与状态机细节随内核版本变化，以对应 RFC 与官方文档为准。

## 八、面试题
- 问：为何是 3 个重复 ACK 而非 1 个？答：1~2 个可能仅是乱序，3 个以上丢包概率才足够高，平衡误判与延迟。
- 问：快速重传后为何不全降到 1？答：dup ACK 证明网络仍能交付，拥塞不严重，故快速恢复半速。
- 问：dup ACK 如何产生？答：接收方收到失序段时为每个后续段回显期望序号。
- 问：与超时代价差异？答：超时进慢启动、吞吐崩；快速重传仅半速、恢复快。
- 问：dup ACK 为何算免费信令？答：它是正常到达段的确认，不额外占用报文。
- 问：多段丢失怎么办？答：Reno 式不足，需 SACK/FACK/RACK 提供更精确判据。
- 问：dupthresh 能否自适应？答：可以，现代内核会据重排观测动态提高。

## 九、演进与趋势
RACK（RFC 8985）以「丢失段发送时刻 + 时间阈值」判断丢包，弱化对固定 3 dup ACK 的依赖，更适配乱序与多丢；FACK 用 SACK 的 fack 指针按序号距离判断；TLP 在尾部丢包时发探测避免等 RTO。三者共同补充、部分替代 Reno 式 3-dupACK 逻辑，构成现代 Linux 的丢失恢复栈。

趋势是「时间序为主、计数/距离为辅」的统一判定框架。相关默认行为以官方最新文档为准。

## 十、小结
快速重传借助重复 ACK 在超时前推断丢包并重传，把恢复时延从 RTO 降到几个 RTT，是 TCP 高吞吐下的关键优化。它配合快速恢复实现平滑降速，并被 SACK/RACK 进一步增强，形成「不靠超时恢复」的完整机制，是理解 TCP 可靠性的必会知识点。
