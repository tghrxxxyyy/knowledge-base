# RTT 测量与平滑估计

> 对应 Jacobson 1988《Congestion Avoidance and Control》与 RFC 6298 的 RTT 估计方法，结合 xiaolincoder/hello-http。

## 一、背景与挑战
TCP 重传超时（RTO）必须基于准确的往返时间（RTT）估计。RTT 随网络路径、拥塞动态变化，若用单一采样会剧烈抖动，因此需要对采样做平滑并留出足够余量。

## 二、核心原理
发送方在发送段时记录时间戳，收到对应 ACK 时计算样本 RTT（RTT_sample = 现在 - 发送时刻）。为抑制抖动，维护平滑 RTT（SRTT）与平滑偏差（RTTVAR），RTO 由二者导出。RFC 6298 取代了早期 Jacobson 公式，给出更严谨的初始值与更新规则。

## 三、形式化与数学基础
RFC 6298 更新式（α=1/8, β=1/4）：
SRTT = (1-α)·SRTT + α·RTT_sample
RTTVAR = (1-β)·RTTVAR + β·|RTT_sample - SRTT|
RTO = SRTT + 4·RTTVAR，且 RTO >= 1 秒下限（初次默认 RTO=1s）。

## 四、代码实现
```python
def on_ack(sample):
    global srtt, rttvar
    if srtt is None:
        srtt = sample; rttvar = sample / 2
    else:
        rttvar = 0.75 * rttvar + 0.25 * abs(sample - srtt)
        srtt = 0.875 * srtt + 0.125 * sample
    rto = srtt + 4 * rttvar
    return max(1.0, rto)
```

## 五、与其他技术对比
Jacobson 1988 原始公式用增益 1/8 与偏差 1/4，但初值与重传后处理较粗糙；RFC 6298 明确了首次测量、重传后 RTO 退避（指数加倍）及回退下限。QUIC 的 RTT 估计类似但区分了路径 MTU 与 ack 延迟。

## 六、常见误区
误区一：RTO 等于平均 RTT——实际还要加 4 倍偏差以覆盖抖动。误区二：每次 ACK 都更新——RFC 6298 规定仅在「未被重传的段」被确认时更新。误区三：平滑会抹掉变化——增益系数让 SRTT 缓慢跟踪，突发仍反映于 RTTVAR。

## 七、与开源书/权威来源对应
RFC 6298 第 2/3 节为权威；Jacobson 1988 SIGCOMM 论文奠基；xiaolincoder/hello-http 给出计算示例；Kurose & Ross 在 TCP 可靠传输章介绍估算。

## 八、面试题
为何 RTO 要加 4 倍偏差？重传后如何更新 RTO？SRTT 与 RTTVAR 含义？RTO 下限为何 1 秒？

## 九、演进与趋势
BBR 等基于模型的拥塞控制更少依赖 RTO 精确性，转而测量带宽与最小 RTT；但 RTO 仍是保底重传机制，RFC 6298 规则持续适用。

## 十、小结
RTT 估计以指数加权平滑 SRTT 与 RTTVAR 为核心，RTO = SRTT + 4·RTTVAR 兼顾跟踪与抖动余量，是 TCP 重传正确性的基础。
