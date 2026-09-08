# MPTCP 拥塞控制耦合

> 对应 RFC 8684 第 3.4 节与 RFC 6356（Coupled Congestion Control for MPTCP），结合 xiaolincoder/hello-http。

## 一、背景与挑战
若每条子流「自私地」独立跑拥塞控制，MPTCP 可能比单路径 TCP 占用更多瓶颈带宽，破坏公平性并加剧网络拥塞。为此需要「耦合」各子流的拥塞窗口，使整体行为对共享瓶颈友好。

## 二、核心原理
耦合算法令各子流共享一个「总窗口」目标：每条子流依据自身测量的 RTT 与丢包调整本地 cwnd，但受全局耦合约束——所有子流 cwnd 之积/和趋于与等价单流一致。典型公式让子流 i 的拥塞避免增量与其 RTT 成反比，使快路径多拿、慢路径少拿，但总体不超过「一个正常 TCP 流」的份额。

## 三、形式化与数学基础
RFC 6356 给出耦合增量：cwnd_i 在拥塞避免时每 RTT 增加 α_i/cwnd_i，其中 α_i 由全局 total 窗口 W_total 与 RTT_i 推导：α_i = W_total · (RTT_i / (Σ RTT_j))² 量级，使 Σ cwnd_i ≈ W_total，且对共享瓶颈公平（不超占）。

## 四、代码实现
```python
# 简化耦合：各子流按 RTT 成比例增长
def coupled_increase(subflows):
    total = sum(s.cwnd for s in subflows)
    for s in subflows:
        share = total * (s.rtt / sum(x.rtt for x in subflows))**2
        s.cwnd += share / s.cwnd
```

## 五、与其他技术对比
独立（非耦合）MPTCP 会在共享瓶颈上不公平地挤占单流；耦合控制修复该问题。相比单路径 CUBIC 只关心自身，MPTCP 耦合引入跨子流协调，类似「多流公平」的带宽分配。

## 六、常见误区
误区一：MPTCP 一定更快——在瓶颈共享时受耦合限制，未必成倍。误区二：耦合等于各子流均分——按 RTT 加权而非均分。误区三：公平性只靠对端——需两端都实现耦合算法。

## 七、与开源书/权威来源对应
RFC 6356 定义耦合拥塞控制；RFC 8684 引用其要求；xiaolincoder/hello-http 简述；Kleppmann《DDIA》讨论资源公平。

## 八、面试题
为何要耦合各子流？非耦合的公平性问题？α 与 RTT 关系？MPTCP 一定更快吗？

## 九、演进与趋势
针对异构路径（如 Wi-Fi + 5G）的研究在改进耦合粒度，使聚合收益最大化同时不损害共享瓶颈上的其他流；Linux MPTCP 默认启用耦合算法。

## 十、小结
MPTCP 通过耦合各子流拥塞窗口，在获得多路径聚合收益的同时保持对网络与其他流的公平，是其实用部署的必要条件。
