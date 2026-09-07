# AIMD原理详解

> 对应 Jacobson 1988 (Congestion Avoidance and Control) 与 RFC 5681 (TCP Congestion Control)；参考 xiaolincoder/hello-http。

## 一、背景与挑战
多流共享瓶颈链路时需公平且稳定地利用带宽。AIMD（加性增、乘性减）是被广泛证明可收敛到公平点的控制法则。

## 二、核心原理
- 加性增（AI）：无拥塞时每 RTT 线性增加 cwnd（+1 MSS）。
- 乘性减（MD）：检测到拥塞时 cwnd 减半（×0.5）。
该组合使流在公平点附近锯齿震荡，长期各流趋于均分带宽。

## 三、形式化与数学基础
更新规则：
  cwnd(t+1) = cwnd(t) + 1/cwnd(t)   (per ACK, AI)
  on loss:  cwnd = cwnd * 0.5       (MD)
收敛性：AIMD 是"增加收敛、减少公平"的分布式算法，Kelly 流体模型证明均衡点即公平分配。

## 四、代码实现
// AIMD 核心（简化）
void on_ack(cong *c) {
    if (c->cwnd < c->ssthresh)
        c->cwnd += 1;                 // 慢启动（指数）
    else
        c->cwnd += 1.0 / c->cwnd;     // 拥塞避免（AI）
}
void on_loss(cong *c) {
    c->ssthresh = c->cwnd / 2;
    c->cwnd = c->ssthresh;            // MD
}

## 五、与其他技术对比
AI 保证公平收敛，MD 快速退让；相比纯乘性（MIMD）更易震荡，纯加性（AAMD）收敛慢。

## 六、常见误区
1. 认为 AIMD 直接最大化吞吐——它在公平与利用间折中。
2. 忽略 AI 在高速链路恢复极慢（Reno 缺陷，引出 CUBIC）。

## 七、与开源书/权威来源对应
- Jacobson 1988 (Congestion Avoidance and Control)
- RFC 5681
- xiaolincoder/hello-http

## 八、面试题
AIMD 是什么？为何能收敛到公平？AI 与 MD 分别作用？

## 九、演进与趋势
CUBIC/BBR 在保持 AIMD 精神的同时改进高速恢复与延迟。

## 十、小结
AIMD 是拥塞控制的经典基石，以简洁规则实现公平与稳定的平衡。
