# Phi检测与网络抖动

> 对应 Hayashibara et al. 2004（Phi Accrual FD）与 Chandra & Toueg 1996。

## 一、背景与挑战
广域网或容器网络常出现延迟尖峰、短暂丢包，导致心跳间隔剧烈波动。固定超时在这种环境下要么误判频发，要么迟钝。Phi 检测器通过「对抖动建模」自适应，是应对抖动的利器。

## 二、核心原理
Phi 检测器持续学习心跳间隔分布。当网络偶发抖动使间隔暂时变大，只要仍在历史分布合理尾部内，φ 值温和上升而不越阈值；若间隔异常超出历史（真故障或持续分区），φ 陡增触发判定。即「抖动被吸收，异常被放大」。

## 三、形式化与数学基础
设正常间隔分布尾部 \\(P(X>t)=10^{-\Phi(t)}\\)。轻微抖动使 \\(t\\) 略增，φ 线性缓升；持续分区使 \\(t\gg\mu\\)，φ 指数上升。因此 φ 同时编码「持续时间」与「异常程度」。

## 四、代码实现
```python
# 维护滑动窗口的 mu, sigma
def update_stats(samples, new_sample, window=100):
    samples.append(new_sample)
    if len(samples) > window: samples.pop(0)
    mu = sum(samples)/len(samples)
    var = sum((s-mu)**2 for s in samples)/len(samples)
    return mu, var**0.5

def suspicion(now, last, mu, sigma, threshold=8):
    return phi(now-last, mu, sigma) > threshold
```

## 五、与其他技术对比
固定超时对抖动「一视同仁」地误判；Phi 把抖动纳入分布，误判率显著降低；但极端双峰网络仍需分段建模。

## 六、常见误区
1. 抖动期人工降阈值：反而更易误判。
2. 样本窗口过长：旧稳定期掩盖新抖动模式。
3. 忽略时钟单调性：应用单调时钟测间隔。

## 七、与开源书/权威来源对应
Hayashibara 2004 在抖动网络下验证 Phi FD 优于固定超时；Cassandra 文档给出 φ 阈值经验值。

## 八、面试题
问：Phi 为何抗抖动？
答：它以历史间隔分布建模，抖动落在分布尾部内只温和升 φ，不触发；异常脱离分布才陡增。

## 九、演进与趋势
结合网络遥测（RTT 百分位）动态调分布，进一步降误判。

## 十、小结
Phi 检测器把网络抖动当作「已知不确定性」建模，从而在抖动中保持低误判、在故障中保持高灵敏。
