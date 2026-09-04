# AIMD机制

> 对应 RFC 5681；Chiu & Jain 公平性分析。

## 一、背景与挑战
多流共享瓶颈时，需要一种既“高效”又“公平”的控制律：公平地平分带宽（收敛到均衡点），且任一流退场时其余流能平滑补位。

## 二、核心原理
AIMD = Additive Increase / Multiplicative Decrease（加性增、乘性减）。丢包时 cwnd 乘性减半（×0.5），平稳时每 RTT 加性增 1 MSS。它在公平性（收敛到等分）与高利用率（接近满带宽）间取得平衡。

## 三、形式化 / 数学基础
拥塞避免阶段：$cwnd(t+1) = cwnd(t) + 1$（每 RTT 加性增）。
丢包事件：$cwnd \leftarrow \max(\beta\cdot cwnd,\ 2\cdot SMSS)$，$\beta=1/2$（乘性减）。
公平性：两流 x、y 在瓶颈容量 C 下，AIMD 使 $(x-y)$ 随 RTT 单调收敛到 0（Chiu-Jain 证明）。

## 四、代码实现
```python
def on_ack_per_rtt(cwnd):
    return cwnd + 1          # 加性增

def on_loss(cwnd):
    return max(cwnd * 0.5, 2)  # 乘性减
```

## 五、与其他技术对比
AIMD 是“基于丢包信号”的代表；相比 MIMD（乘增乘减，不公平）、AIAD（不稳），AIMD 在稳定性与公平性上最优。BBR 不采用 AIMD，而是按带宽模型 pacing。

## 六、常见误区
误区一：AIMD 的“加”是按包加。错，是按 RTT 加 1 MSS（等效每 ACK 加 SMSS²/cwnd）。误区二：乘性减会让吞吐减半以下。错，是 cwnd 减半，吞吐近似减半。误区三：AIMD 保证严格公平。错，仅长期收敛，且受 RTT 偏置（RTT 小的流占优）。

## 七、与开源书 / 权威来源对应
- CS-Notes：https://github.com/CyC2018/CS-Notes
- RFC 5681、Kurose & Ross 第 3 章、Tanenbaum《Computer Networks》第 6 章。

## 八、面试题
1. 为什么乘性减而非加性减？答：乘性减保证多流公平收敛、退场流让位快。2. AIMD 的公平收敛点？答：各流等分瓶颈带宽。

## 九、演进与趋势
CUBIC 用凹-凸函数替代线性增，在大 BDP 下更高效；但本质仍属“丢包驱动”。

## 十、小结
AIMD 以“加性增、乘性减”在公平与效率间取得平衡，是 Reno 类拥塞控制的数学核心。
