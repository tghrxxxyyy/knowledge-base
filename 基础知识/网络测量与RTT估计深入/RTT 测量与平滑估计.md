# RTT 测量与平滑估计

> 对应 Jacobson 1988《Congestion Avoidance and Control》与 RFC 6298《Computing TCP's Retransmission Timer》。

## 一、背景与挑战
TCP 的重传超时（RTO）必须建立在准确且稳健的往返时间（RTT）估计之上。RTT 随路径、拥塞与队列长度动态变化，单次采样可能剧烈抖动；若用最新样本直接设定 RTO，会频繁误触发不必要的重传，或在丢包后等待过久，严重影响吞吐与延迟。

因此需要一套「采样 → 平滑 → 加余量 → 设下限」的完整估计流程：用采样获得原始观测，用指数加权平滑抑制抖动，用偏差量体现不确定性并据此加保护余量，最后设置下限与退避规则以应对极端情况。这套流程由 Jacobson 奠基、由 RFC 6298 标准化。

## 二、核心原理
发送方在发送报文段时记录时间戳，收到对应 ACK 时计算样本：

$$ S = t_{ack} - t_{send} $$

为抑制抖动，维护两个平滑量：平滑往返时间 SRTT 与平滑偏差 RTTVAR。每当获得一个「干净」样本（该段未被重传），按经 RFC 6298 规范化的增益更新二者，再由它们导出 RTO：

$$ \text{RTO} = \text{SRTT} + 4 \cdot \text{RTTVAR}, \quad \text{RTO} \ge 1\,\text{s} $$

四个要素各司其职：SRTT 提供「中心趋势」，RTTVAR 提供「抖动幅度」，系数 4 提供安全余量，1 秒下限防止早期样本导致过于激进的 RTO。RFC 6298 相对 Jacobson 原始方案的主要改进，是明确了初始值、更新门控（排除重传样本）与退避规则。

## 三、形式化与数学基础
RFC 6298 的更新式（α = 1/8，β = 1/4）：

$$ \text{SRTT} \leftarrow (1-\alpha)\,\text{SRTT} + \alpha\,S $$

$$ \text{RTTVAR} \leftarrow (1-\beta)\,\text{RTTVAR} + \beta\,\bigl|S - \text{SRTT}_{\text{old}}\bigr| $$

注意偏差项使用更新前的 SRTT。初始条件（首个样本 $S$）：

$$ \text{SRTT} = S,\qquad \text{RTTVAR} = \frac{S}{2},\qquad \text{RTO} = \text{SRTT} + 4\,\text{RTTVAR} $$

由上可得首次估计为 $RTO = S + 4 \cdot S/2 = 3S$，再经下限钳制。系数 4 的直觉是：若 RTT 波动近似服从某种分布，加约 4 倍平均绝对偏差可覆盖绝大多数正常波动，从而把误重传概率压得很低。下限 1 秒则是早期实现经验与稳健性折中的产物。

## 四、代码实现
```python
def on_ack(sample, srtt, rttvar):
    # 首次样本：按 RFC 6298 初始化
    if srtt is None:
        srtt = sample
        rttvar = sample / 2.0
    else:
        # 先算偏差（用旧 srtt），再更新 srtt
        rttvar = 0.75 * rttvar + 0.25 * abs(sample - srtt)
        srtt = 0.875 * srtt + 0.125 * sample
    rto = srtt + 4.0 * rttvar
    return max(1.0, rto), srtt, rttvar   # 下限 1 秒
```

```text
# 完整计时器流程
1. 发送段：记录发送时刻
2. 收到 ACK：若该段未被重传，计算样本 S 并更新
3. 更新 SRTT/RTTVAR，导出 RTO
4. 超时未确认：重传并做指数退避（见 Karn 算法）
5. ACK 延迟过大或时间戳可消歧时，样本处理依 RFC 7323/6298
```

## 五、与其他技术对比
| 方案 | 平滑方式 | 重传后处理 | 下限 | 备注 |
| --- | --- | --- | --- | --- |
| Jacobson 1988 原始 | EWMA，1/8 与 1/4 | 较粗糙 | 无统一规定 | 奠基性 |
| RFC 6298 | 同上，规则明确 | 排除重传样本并退避 | 1 秒 | 现行标准 |
| QUIC（RFC 9002） | 平滑类 EWMA | 结合 ack delay | 依规范 | 适配新传输 |
| 时间戳增强 | 可用重传样本 | 回显消歧 | 同 TCP | 见 RFC 7323 |

Jacobson 1988 原始公式用增益 1/8 与偏差 1/4，但初值与重传后处理较粗糙；RFC 6298 明确了首次测量、重传后退避及下限。QUIC 的 RTT 估计思路类似，但显式处理了 ack delay，并把 min_rtt 与平滑 RTT 分开跟踪。

## 六、常见误区
误区一：「RTO 等于平均 RTT」。错，还要加 4 倍偏差以覆盖抖动。误区二：「每次 ACK 都更新」。错，RFC 6298 规定仅在未被重传的段被确认时更新。误区三：「平滑会抹掉变化」。错，增益让 SRTT 缓慢跟踪趋势，而突发变化仍会反映在 RTTVAR 上并抬高 RTO。误区四：「下限 1 秒是任意的」。错，它是稳健性与误重传权衡的结果，且有规范依据。误区五：「偏差项用新 SRTT 计算」。错，应先算偏差再更新 SRTT。

## 七、与开源书·权威来源对应
- RFC 6298：第 2 节（初始化）、第 3 节（更新）、第 4 节（重传）为权威依据。
- Jacobson 1988：Congestion Avoidance and Control，原始平滑公式来源。
- RFC 9002：QUIC 的丢包检测与 RTT 估计。
- Kurose & Ross《计算机网络：自顶向下方法》：TCP 可靠传输与超时估计章节。
- 图解网络：https://github.com/xiaolincoder/hello-http。
- 具体常数与实现细节以 RFC 与内核实现最新版本为准。

## 八、面试题
1. 为什么 RTO 要在 SRTT 基础上加 4 倍 RTTVAR？
2. 重传后应如何更新 RTO？为什么？
3. SRTT 与 RTTVAR 各自的物理含义是什么？
4. RTO 下限为什么设为 1 秒？取消下限会有什么后果？
5. QUIC 的 RTT 估计与 TCP 有哪些差异？

## 九、演进与趋势
BBR 等基于模型的拥塞控制更少依赖 RTO 精确性，转而直接测量带宽与最小 RTT；但 RTO 仍是不可替代的保底重传机制，RFC 6298 的规则持续适用。趋势是「平滑估计 + 显式建模并行」：EWMA 负责稳健兜底，模型化测量负责性能优化，两者在 QUIC 等新协议中并存。

实现检查清单：

- 首次样本按 RFC 6298 初始化（SRTT=S，RTTVAR=S/2）。
- 偏差项使用更新前的 SRTT。
- RTO 施加 1 秒下限。
- 重传样本默认不参与更新，并执行指数退避。
- 时间戳可用时按 RFC 7323 放宽样本限制。

## 十、小结
RTT 估计以指数加权平滑 SRTT 与 RTTVAR 为核心，RTO = SRTT + 4·RTTVAR 兼顾了跟踪速度与抖动余量，下限与退避规则提供了极端情形下的稳健性。它是 TCP 重传正确性的基础：估得准，重传才不多不少。理解这套机制的每一环——为何平滑、为何加 4 倍、为何设下限——比记住公式更重要。
