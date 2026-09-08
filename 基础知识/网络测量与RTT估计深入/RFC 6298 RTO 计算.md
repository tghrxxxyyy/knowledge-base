# RFC 6298 RTO 计算

> 对应 RFC 6298《Computing TCP's Retransmission Timer》全文，TCP RTO 计算的现行标准。

## 一、背景与挑战
早期各实现 RTO 算法不一，导致互操作与重传行为差异。RFC 6298 统一了 SRTT/RTTVAR 的初始化、更新与 RTO 计算，并规定了重传、退避与下限，确保 TCP 重传计时器行为一致。

## 二、核心原理
RFC 6298 规定：初次测量 RTT 样本 S 时，SRTT = S，RTTVAR = S/2，RTO = S + 4·(S/2) = 3S（但受下限约束）。后续每个「干净」样本按 α=1/8、β=1/4 更新。RTO 最小值为 1 秒；重传后 RTO 翻倍退避；收到新数据确认可继续按规则更新但不立即取消退避。

## 三、形式化与数学基础
初始：SRTT = S，RTTVAR = S/2，RTO = S + 2S = 3S，钳制 RTO >= 1s。
更新（非重传）：SRTT = 7/8·SRTT + 1/8·S；RTTVAR = 3/4·RTTVAR + 1/4·|S - 旧SRTT|；RTO = SRTT + 4·RTTVAR。
重传退避：RTO = 2·RTO（上限一般实现 60s）。

## 四、代码实现
```python
def rto_update(s, srtt, rttvar, retransmit=False):
    if srtt is None:
        srtt, rttvar = s, s/2
    elif not retransmit:
        rttvar = 0.75*rttvar + 0.25*abs(s - srtt)
        srtt = 0.875*srtt + 0.125*s
    rto = max(1.0, srtt + 4*rttvar)
    if retransmit:
        rto = min(60.0, rto*2)
    return rto, srtt, rttvar
```

## 五、与其他技术对比
相比 Jacobson 1988 原始方案，RFC 6298 明确了初始值与「仅干净样本更新」「重传后不退避取消」等细则。它与 Karn 算法互补：Karn 负责丢弃二义样本，6298 负责具体数值与边界。

## 六、常见误区
误区一：RTO 可小于 1 秒——下限为 1s（RFC 硬性）。误区二：重传段 ACK 也更新——不更新（除非时间戳消除二义）。误区三：RTTVAR 初值为 0——应为 S/2。

## 七、与开源书/权威来源对应
RFC 6298 第 2（初始化）、第 3（更新）、第 4（重传）节为权威；xiaolincoder/hello-http 给出数值示例；Kurose & Ross 在 TCP 章引用其精神。

## 八、面试题
RFC 6298 初始 RTTVAR 是多少？RTO 下限？更新为何排除重传样本？退避上限？

## 九、演进与趋势
QUIC（RFC 9000）采用类似但基于 RTTVAR 的计时规则并适配丢包检测；Linux TCP 的 RTO 实现严格遵循 RFC 6298。

## 十、小结
RFC 6298 以统一、可互操作的公式固化了 TCP RTO 计算，结合 Karn 的二义处理，构成了可靠重传计时器的标准。
