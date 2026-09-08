# Jacobson 指数加权移动平均

> 对应 Jacobson 1988 论文与 RFC 6298，关于 SRTT/RTTVAR 的 EWMA 平滑。

## 一、背景与挑战
原始 RTT 样本噪声大，直接使用会导致 RTO 频繁波动，进而误触发重传或等待过久。指数加权移动平均（EWMA）以低计算成本平滑序列，是 TCP 计时器设计的基石。

## 二、核心原理
EWMA 给新样本较小权重、给历史更大权重，形成对趋势的平滑跟踪。Jacobson 采用 α=1/8 平滑均值、β=1/4 平滑偏差（均值绝对偏差）。这种不对称增益让均值稳、偏差灵敏，RTO 因而既跟踪又不至于过度敏感。

## 三、形式化与数学基础
SRTT_n = (1-α)·SRTT_{n-1} + α·S_n，展开为 SRTT_n = α·Σ(1-α)^{n-k}·S_k + (1-α)^n·SRTT_0，即历史以指数衰减。RTTVAR 使用绝对偏差 |S_n - SRTT_{n-1}| 的 EWMA，对突发更敏感。

## 四、代码实现
```python
ALPHA, BETA = 1/8, 1/4
srtt = (1-ALPHA)*srtt + ALPHA*sample
dev  = (1-BETA)*dev + BETA*abs(sample - srtt_before)
rto  = srtt + 4*dev
```

## 五、与其他技术对比
简单算术平均需保存窗口样本、内存与计算更高；EWMA 仅需两个状态量。QUIC 也用类似 EWMA 但额外跟踪 min_rtt 以估计带宽延迟积。Linux TCP 的实现参数与 RFC 6298 一致。

## 六、常见误区
误区一：α 越大越准——过大则失去平滑、易被单样本带偏。误区二：EWMA 等于最新值——它是加权平均，历史仍占主导。误区三：dev 是方差——实际是均值绝对偏差的 EWMA，非方差。

## 七、与开源书/权威来源对应
Jacobson 1988 SIGCOMM 给出原始公式；RFC 6298 标准化；xiaolincoder/hello-http 演示数值演算；Kurose & Ross 介绍平滑思想。

## 八、面试题
EWMA 为何只需两个状态？α/β 怎么选？为何用绝对偏差而非方差？和算术平均比优势？

## 九、演进与趋势
现代实现仍沿用该 EWMA 框架，BBR 在其上叠加 min_rtt 窗口估计以区分「瓶颈排队延迟」与「传播延迟」，但基础平滑不变。

## 十、小结
Jacobson 的 EWMA 以极小状态实现 RTT 平滑，α=1/8、β=1/4 的增益平衡了跟踪速度与抗噪，奠定了 RFC 6298 的公式基础。
