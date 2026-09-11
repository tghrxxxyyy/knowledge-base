# RFC 6298 RTO 计算

> 对应 RFC 6298《Computing TCP's Retransmission Timer》全文，TCP 重传计时器计算的现行标准。

## 一、背景与挑战
在 RFC 6298 之前，各家 TCP 实现的重传超时算法不一：初始化方式不同、增益系数不同、重传后的处理与下限设定也各不相同。这种差异导致互操作问题：同样的网络条件，不同实现的 RTO 行为差别明显，重传激进程度与恢复速度都不一致，给性能调优与故障定位带来困难。

RFC 6298 的目标就是统一这些细节：明确规定 SRTT/RTTVAR 的初始化、每次更新的公式与门控条件、RTO 的计算与下限，以及重传后的退避规则。它使得 TCP 重传计时器的行为在全网范围内一致、可预测、可互操作。

## 二、核心原理
RFC 6298 的核心内容可分为四条规则：

- 初始化：首个 RTT 样本 $S$ 到达时，置 $\text{SRTT} = S$、$\text{RTTVAR} = S/2$，此后才进入常规更新。
- 更新：仅当获得「干净」样本（该段未被重传）时更新，使用增益 α = 1/8 与 β = 1/4。
- 计算：$\text{RTO} = \text{SRTT} + 4 \cdot \text{RTTVAR}$，并施加最小下限 1 秒。
- 重传：超时重传时把 RTO 加倍（退避），并遵循 Karn 算法不更新被重传段的估计。

这套规则与 Karn 算法互补：Karn 负责「丢弃二义样本」这一逻辑判断，RFC 6298 负责「具体怎么算、边界怎么定」的数值细节。

## 三、形式化与数学基础
初始化：

$$ \text{SRTT} = S,\qquad \text{RTTVAR} = \frac{S}{2},\qquad \text{RTO} = \text{SRTT} + 4\,\text{RTTVAR} = 3S $$

再对 RTO 施加下限：$\text{RTO} \leftarrow \max(\text{RTO}, 1\text{s})$。

常规更新（仅非重传样本）：

$$ \text{RTTVAR} \leftarrow \frac{3}{4}\,\text{RTTVAR} + \frac{1}{4}\,\bigl|S - \text{SRTT}_{\text{old}}\bigr| $$

$$ \text{SRTT} \leftarrow \frac{7}{8}\,\text{SRTT} + \frac{1}{8}\,S $$

$$ \text{RTO} = \text{SRTT} + 4\,\text{RTTVAR}, \qquad \text{RTO} \ge 1\text{s} $$

重传退避：

$$ \text{RTO} \leftarrow \min\bigl(2\,\text{RTO},\ \text{RTO}_{\max}\bigr) $$

其中退避上限由实现决定（常见为 60 秒，具体以实现与规范为准）。注意偏差项使用更新前的 SRTT，这是保证抖动估计正确的关键顺序。

## 四、代码实现
```python
def rto_update(sample, srtt, rttvar, retransmit=False,
               rto_min=1.0, rto_max=60.0):
    if srtt is None:
        # 首个样本：RFC 6298 初始化
        srtt, rttvar = sample, sample / 2.0
    elif not retransmit:
        # 干净样本：先算偏差（用旧 srtt），再更新 srtt
        rttvar = 0.75 * rttvar + 0.25 * abs(sample - srtt)
        srtt = 0.875 * srtt + 0.125 * sample
    rto = max(rto_min, srtt + 4 * rttvar)
    if retransmit:
        rto = min(rto_max, rto * 2)      # 指数退避
    return rto, srtt, rttvar
```

```text
# 与 Karn 的配合
- 该段被重传 -> 不调用上面的估计更新，只做退避
- 收到干净 ACK -> 恢复常规更新
- 启用时间戳（RFC 7323）时，重传场景的样本可用于更新
```

## 五、与其他技术对比
| 规则项 | Jacobson 1988 原始 | RFC 6298 |
| --- | --- | --- |
| 初始化 | 未严格规定 | SRTT=S, RTTVAR=S/2 |
| 更新增益 | 1/8 与 1/4 | 同，但门控明确 |
| 重传样本 | 依 Karn 丢弃 | 明确排除 |
| RTO 下限 | 无统一规定 | 1 秒 |
| 退避 | 有 | 明确指数退避与恢复规则 |

相比原始方案，RFC 6298 的价值在于把「经验做法」固化为「统一标准」，消除实现差异。它与 Karn 算法分工明确：Karn 管二义样本的取舍，6298 管数值与边界。QUIC（RFC 9002）在 RTT 估计与丢包检测上采用了类似但适配新传输的思路，Linux TCP 的 RTO 实现严格遵循 RFC 6298。

## 六、常见误区
误区一：「RTO 可小于 1 秒」。错，RFC 硬性规定下限为 1 秒。误区二：「重传段的 ACK 也用于更新」。错，默认不更新（除非时间戳消除二义）。误区三：「RTTVAR 初值为 0」。错，应为 $S/2$。误区四：「偏差项用新 SRTT 计算」。错，必须用旧 SRTT。误区五：「退避没有上限」。错，实现通常设 60 秒上限。误区六：「首次样本就按 1/8 增益更新」。错，首次为直接赋值初始化。

## 七、与开源书·权威来源对应
- RFC 6298：第 2 节（初始化）、第 3 节（更新）、第 4 节（重传退避）为权威依据。
- Karn & Partridge 1987：重传二义性处理，与 6298 互补。
- RFC 7323：时间戳选项，为 6298 的测量提供更优输入。
- RFC 9002：QUIC 的丢包检测与 RTT 估计。
- Kurose & Ross《计算机网络：自顶向下方法》：TCP 可靠传输章节。
- 图解网络：https://github.com/xiaolincoder/hello-http。
- 具体下限、上限与实现细节以 RFC 与内核实现最新版本为准。

## 八、面试题
1. RFC 6298 中 RTTVAR 的初始值是多少？由此得到的首次 RTO 是几倍样本？
2. RTO 的下限是多少？为什么设这个值？
3. 更新估计时为什么必须排除重传样本？
4. 重传退避的规则是什么？上限通常是多少？
5. RFC 6298 与 Karn 算法是如何分工的？

## 九、演进与趋势
QUIC（RFC 9000/9002）采用了基于 RTTVAR 的计时与丢包检测规则，并显式处理 ack delay，可视为对 RFC 6298 思想的现代化演进。Linux TCP 的 RTO 实现严格遵循 RFC 6298，并在时间戳可用时放宽重传样本限制。趋势是「保底计时器 + 模型化拥塞控制」并存：RTO 仍是最后的可靠性防线，而 BBR 等机制负责常态下的性能优化。

## 十、小结
RFC 6298 以统一、可互操作的公式固化了 TCP RTO 计算：明确初始化、更新门控、RTO = SRTT + 4·RTTVAR、1 秒下限与指数退避。它与 Karn 算法配合，构成可靠重传计时器的标准。掌握它不仅是记住公式，更要理解每条规则背后的稳健性考量——为何排除重传样本、为何设下限、为何退避有上限。这些设计共同保证了 TCP 在各种网络条件下的可预测行为。
