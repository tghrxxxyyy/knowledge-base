# 超时重传与 RTO

> 对应 RFC 793（TCP）重传要求、RFC 6298 RTO 计算，以及 xiaolincoder/hello-http 超时重传章节。

## 一、背景与挑战
TCP 必须保证可靠交付：每个发出的段都期望在有限时间内收到覆盖它的 ACK，否则必须重传。判定「多久算超时」的计时器就是重传超时（RTO）。RTO 设过短会盲目重传、浪费带宽并加剧拥塞；设过长则丢包后恢复极慢。更糟的是，若连重复 ACK 都没有（既无新 ACK 也无 dup ACK），说明网络可能严重拥塞或单向不通，超时重传是唯一兜底。

超时重传是 TCP 可靠性最底层的保证：即便所有高级机制（快速重传、SACK、RACK）都因缺乏信息而无法工作，超时仍能最终把数据送达。理解 RTO 计算与退避，是排查「连接卡死」「恢复慢」类问题的根基。

它也是「悲观兜底」的典型设计：平时希望永远用不到，一旦用到就意味着其他所有信号都失效了，因此必须设计得既可靠又保守。

## 二、核心原理
每发出一个段就启动（或刷新）重传计时器，基于 RTO。若在 RTO 内收到覆盖该段数据的 ACK，停止计时器；否则触发超时重传。按 Karn 规则：重传的段不再用其采样更新 RTT（因为分不清 ACK 对应原传还是重传），且每次超时后 RTO 指数退避（$\times2$），避免重传风暴淹没已拥塞的网络。超时是最严重信号，触发后进入慢启动：cwnd 重置为 1（或 initcwnd 级别），ssthresh 减半。

指数退避体现了「保守」哲学：一旦连确认都没有，说明链路极可能严重异常，此时应「安静地、越来越慢地」重试，而不是疯狂重传加剧拥塞。

另一个细节是计时器的管理：TCP 通常只为「最早未确认的段」维护一个重传计时器，而非每段一个，收到新 ACK 后重启计时器，从而把开销控制在常数级。

## 三、形式化与数学基础
RTO 由平滑往返时间 SRTT 与往返时间方差 RTTVAR 计算（RFC 6298）：

$$ \text{RTO} = \text{SRTT} + 4 \cdot \text{RTTVAR},\quad \text{RTO 下限 } \ge 1\,\text{s} $$

超时后指数退避：$\text{RTO}_k = \min(60,\; \text{RTO}_0 \cdot 2^k)$，$k$ 为连续超时次数，上限 60 秒。超时后 $\text{ssthresh} = \max(\text{flight}/2,\, 2\cdot\text{SMSS})$，$\text{cwnd} = 1$（或 initcwnd），重新慢启动。

SRTT/RTTVAR 用指数加权移动平均（EWMA）更新，$4\cdot\text{RTTVAR}$ 项让 RTO 对抖动敏感，避免在高方差链路上过早超时。其更新式（RFC 6298）为：

$$ \text{RTTVAR} \leftarrow (1-\tfrac18)\,\text{RTTVAR} + \tfrac18\,|\text{SRTT} - R|,\quad \text{SRTT} \leftarrow (1-\tfrac18)\,\text{SRTT} + \tfrac18\,R $$

## 四、代码实现
```python
MSS = 1460
SRTT, RTTVAR = None, None

def update_rtt(R):                     # R 为一次 RTT 采样
    global SRTT, RTTVAR
    if SRTT is None:                   # 首个采样
        SRTT, RTTVAR = R, R / 2
    else:
        RTTVAR = (1 - 1/8) * RTTVAR + (1/8) * abs(SRTT - R)
        SRTT = (1 - 1/8) * SRTT + (1/8) * R

def compute_rto():
    return max(1.0, SRTT + 4 * RTTVAR)  # 下限 1 秒

def on_timeout(flight):
    global rto, cwnd, ssthresh
    rto = min(60, rto * 2)              # 指数退避，上限 60s
    retransmit(oldest_unacked)
    ssthresh = max(flight // 2, 2 * MSS)
    cwnd = MSS                          # 进慢启动
```

按 Karn 规则，重传段的 ACK 不用于更新 RTT 采样，否则会把「重传往返时间」误当真实 RTT，导致估计偏大且持续雪崩。

## 五、与其他技术对比

| 恢复方式 | 触发 | 进慢启动 | 时延 |
| --- | --- | --- | --- |
| 超时重传 | RTO 到期 | 是 | 最大 |
| 快速重传 | 3 dup ACK | 否 | 较小 |
| RACK/TLP | 时间序/探测 | 否 | 小 |
| SACK 增强 | 精确洞信息 | 否 | 小（多丢更优） |
| ECN 反馈 | 显式拥塞标记 | 视策略 | 小（无需丢包） |

快速重传比超时更「早」、更轻量；QUIC 用基于 RTT 的丢包检测（时间阈值 + 乱序阈值）替代纯重复 ACK 计数；TLP 在 RTO 前发探测减少尾部丢失恢复延迟。TLP 的存在正是为了「在超时之前」解决尾部丢包，避免进入最昂贵的超时路径。

## 六、常见误区
- 误区一：超时必进慢启动。是的，超时是最严重信号，cwnd 归 1。
- 误区二：RTO 是固定值。它由 SRTT/RTTVAR 动态计算并随网络变化。
- 误区三：超时重传一定等于丢包。也可能是 ACK 丢失导致的「误超时」。
- 误区四：RTO 下限 1 秒太死板。RFC 6298 规定下限 1s 是为避免过早重传加剧拥塞，现代实现可在特定路径下调。
- 误区五：退避无限。RTO 退避有 60s 上限，防止计时器变得过大导致连接永久挂起。
- 误区六：重传段的 RTT 可用于估计。这违反 Karn 规则，会污染 RTT 估计。
- 误区七：ACK 丢失无需处理。它会触发误超时，需靠 RTO 与重传兜底。

## 七、与开源书·权威来源对应
RFC 793 规定 TCP 必须重传；RFC 6298 规定 RTO 的 SRTT/RTTVAR 计算与下限；Karn & Partridge 提出重传段不采样 RTT 与指数退避；xiaolincoder/hello-http 给出超时示例；Kurose & Ross 在可靠传输章讨论计时器与重传。Linux `tcp_retransmit_timer` 是超时处理入口，实现上述退避与慢启动逻辑。

具体常数与实现细节以对应 RFC 与官方文档为准。

## 八、面试题
- 问：超时后 cwnd 怎么变？答：归 1 进慢启动，ssthresh 减半。
- 问：为何要指数退避？答：避免重传风暴在已拥塞网络上雪上加霜。
- 问：超时与快速重传区别？答：超时最严重、进慢启动；快速重传半速、不进慢启动。
- 问：RTO 下限为何 1 秒？答：RFC 6298 规定，避免过早重传加剧拥塞。
- 问：Karn 规则是什么？答：重传段不用于更新 RTT 采样，避免 RTT 估计被重传污染。
- 问：RTO 的上限是多少？答：指数退避后通常封顶 60 秒，防止连接永久挂起。
- 问：ACK 丢失会造成什么？答：可能触发误超时与不必要重传，靠退避与去重缓解。

## 九、演进与趋势
Tail Loss Probe（TLP）在 RTO 之前发探测段，缩短尾部丢包恢复；RACK 用时间序替代重复 ACK 计数，改善超时判断；QUIC 把丢包检测建模为「RTT 倍数 + 乱序阈值」并内置探测，整体降低对超时的依赖。ECN 则让拥塞可被显式标记，从源头减少因丢包触发的慢启动。

但超时作为最终兜底，永远无法被完全移除。相关机制与默认配置以官方最新文档为准。

## 十、小结
超时重传是 TCP 可靠性的最后兜底，基于 RTO 计时与指数退避，触发后进入慢启动，是网络严重异常时的恢复手段。配合快速重传/RACK/TLP 可大幅减少其使用频率，但理解其计算与退避机制，仍是网络排障与协议实现的必修课。
