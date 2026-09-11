# Jacobson 指数加权移动平均

> 对应 Jacobson 1988《Congestion Avoidance and Control》与 RFC 6298 关于 SRTT/RTTVAR 的 EWMA 平滑规则。

## 一、背景与挑战
原始 RTT 采样噪声极大：同一连接相邻两次测量可能相差数倍，原因是路径排队、路由变化、ACK 延迟与测量抖动。若直接用最新样本或简单平均来估计，RTO 会剧烈波动——过小则频繁误重传，过大则丢包后恢复迟缓。需要一个既平滑又低开销的估计器。

指数加权移动平均（Exponentially Weighted Moving Average, EWMA）正是这样的工具：它以极小的状态量实现对时间序列的平滑跟踪，无需保存历史窗口。Jacobson 把它引入 TCP 的 RTT 估计，奠定了 RTO 计算的基础。

## 二、核心原理
EWMA 的核心思想是「新样本权重小而衰减快，历史以指数方式衰减加权」。它只维护两个状态：平滑往返时间 SRTT 与平滑偏差 RTTVAR。Jacobson 采用不对称增益：α = 1/8 平滑均值，β = 1/4 平滑偏差。

为何不对称？均值需要更稳（小增益、重历史），避免被单个异常样本带偏；偏差需要更灵敏（较大增益），以便在 RTT 开始抖动时迅速抬高 RTO 余量。RTO 最终由 SRTT 加上若干倍 RTTVAR 得到，从而兼顾「跟踪」与「抗抖动」。

## 三、形式化与数学基础
SRTT 的递归定义为：

$$ \text{SRTT}_n = (1-\alpha)\,\text{SRTT}_{n-1} + \alpha\,S_n $$

展开后可看出历史以指数衰减：

$$ \text{SRTT}_n = \alpha \sum_{k=1}^{n} (1-\alpha)^{\,n-k} S_k + (1-\alpha)^{n}\,\text{SRTT}_0 $$

RTTVAR 平滑的是均值绝对偏差（新样本相对更新前 SRTT）：

$$ \text{RTTVAR}_n = (1-\beta)\,\text{RTTVAR}_{n-1} + \beta\,\bigl|S_n - \text{SRTT}_{n-1}\bigr| $$

RTO 由两者导出：

$$ \text{RTO} = \text{SRTT} + 4\,\text{RTTVAR} $$

系数 4 与增益 (1/8, 1/4) 的取值来自 Jacobson 的经验设计与后续标准化（RFC 6298）。EWMA 的等效记忆长度约为 $1/\alpha$ 个样本，$\alpha=1/8$ 意味着大致关注最近数个样本。

## 四、代码实现
```python
ALPHA, BETA = 1.0 / 8.0, 1.0 / 4.0

def ewma_update(sample, srtt, rttvar):
    # 注意：rttvar 使用更新前的 srtt 计算偏差
    rttvar = (1 - BETA) * rttvar + BETA * abs(sample - srtt)
    srtt = (1 - ALPHA) * srtt + ALPHA * sample
    rto = srtt + 4 * rttvar
    return srtt, rttvar, rto

# 初始（首个样本 S）：srtt = S, rttvar = S/2，见 RFC 6298
def init(sample):
    return sample, sample / 2.0, sample + 2.0 * sample
```

```text
# 属性
- 只需两个状态量（srtt, rttvar），内存 O(1)
- 单次更新为常数时间
- 对异常样本不敏感：单点冲击被 1/8 的权重稀释
- 记忆以指数衰减，天然适合非平稳序列
```

## 五、与其他技术对比
| 估计方式 | 状态量 | 计算量 | 对突发的响应 | 对单点噪声的鲁棒性 |
| --- | --- | --- | --- | --- |
| 简单算术平均 | 窗口内全部样本 | O(窗口) | 慢 | 中 |
| EWMA（SRTT/RTTVAR） | 2 个 | O(1) | 中（偏差项敏感） | 强 |
| 最新样本（无平滑） | 1 个 | O(1) | 极快 | 极弱 |
| 卡尔曼滤波 | 协方差矩阵 | 高 | 可调 | 强 |

简单算术平均需保存窗口样本、内存与计算更高；EWMA 仅需两个状态量即可获得近似效果。QUIC 在 RTT 估计上也采用类似平滑，并额外跟踪 min_rtt 以更精确地估计传播延迟与带宽延迟积。

## 六、常见误区
误区一：「α 越大越准」。错，α 过大失去平滑，单个异常样本即可带偏 SRTT。误区二：「EWMA 等于最新值」。错，它是加权平均，历史仍占主导（$(1-\alpha)$ 的权重更大）。误区三：「RTTVAR 是方差」。错，它是平均绝对偏差的 EWMA，而非统计学意义的方差。误区四：「偏差项用更新后的 SRTT 计算」。错，应先算偏差再更新 SRTT，否则会低估抖动。误区五：「初始值无关紧要」。错，RFC 6298 规定 $RTTVAR=S/2$ 等初始化，对早期 RTO 影响显著。

## 七、与开源书·权威来源对应
- Jacobson 1988：Congestion Avoidance and Control，SIGCOMM，给出原始平滑公式。
- RFC 6298：规范化的 SRTT/RTTVAR 更新与初始化规则。
- Kurose & Ross《计算机网络：自顶向下方法》：TCP 超时估计章节。
- 图解网络：https://github.com/xiaolincoder/hello-http。
- 具体增益常数与实现细节以 RFC 与内核最新实现为准。

## 八、面试题
1. EWMA 为什么只需要两个状态量就能平滑序列？
2. α 与 β 分别控制什么？为什么 β 比 α 大？
3. 为什么用平均绝对偏差而非方差？计算上有什么好处？
4. 偏差项应使用更新前还是更新后的 SRTT？为什么？
5. EWMA 与算术平均相比，在鲁棒性与开销上各有什么取舍？

## 九、演进与趋势
现代 TCP 与 QUIC 实现仍沿用这一 EWMA 框架，BBR 在其上叠加 min_rtt 窗口估计，以区分「瓶颈排队延迟」与「传播延迟」，但基础的平滑机制未变。EWMA 的简洁与鲁棒使其在众多网络测量场景中持续适用，例如链路质量估计、负载均衡的健康度衰减与限流器的平滑速率。

数值直觉有助于理解增益选择：

- α = 1/8：等效记忆约 8 个样本，兼顾跟踪与平滑。
- β = 1/4：等效记忆约 4 个样本，对抖动更敏感。
- 系数 4：在均值为中心的基础上覆盖绝大多数正常波动。

实现注意事项：

- 偏差必须用更新前的 SRTT 计算，否则低估抖动。
- 首个样本直接初始化，不套用 1/8 增益。
- 单位统一（毫秒或微秒），避免精度损失。

## 十、小结
Jacobson 的 EWMA 以极小状态实现 RTT 平滑，α=1/8 与 β=1/4 的不对称增益在「跟踪速度」与「抗噪能力」之间取得平衡，奠定了 RFC 6298 的公式基础。它体现了一个重要的工程美学：用最少的存储与计算，换取对非平稳信号的稳健估计。理解 SRTT 与 RTTVAR 的语义，是理解 RTO 计算乃至整个 TCP 计时器体系的前提。
