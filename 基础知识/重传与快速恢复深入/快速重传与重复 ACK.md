# 快速重传与重复 ACK

> 对应 RFC 5681（TCP Congestion Control）快速重传规则与 xiaolincoder/hello-http 的丢包恢复说明。

## 一、背景与挑战
超时重传恢复慢（要等 RTO）。如果仅个别段丢失而其他段正常到达，接收方会持续发重复 ACK，发送方可据此「提前」判断丢包并重传，不必苦等超时，这就是快速重传。

## 二、核心原理
当接收方收到失序段（中间有洞），它每收到一个后续段就回一个重复 ACK（dup ACK），指明期望的丢失序号。发送方累计收到 3 个重复 ACK（RFC 5681 的 dupthresh=3）即推断该段丢失，不等超时立即重传该段，并进入快速恢复阶段减小 cwnd。

## 三、形式化与数学基础
令 dup_ack_count 为连续重复 ACK 数。触发条件：dup_ack_count >= 3。此时 ssthresh = max(flight/2, 2·SMSS)，进入快速恢复（cwnd 约减半而非降至 1）。每再收到一个 dup ACK，cwnd 临时 +1（RFC 2581 式「膨胀」以让管道继续流动）。

## 四、代码实现
```python
if ack.duplicate:
    dup += 1
    if dup == 3:
        ssthresh = max(flight//2, 2)
        retransmit(lost_seq)      # 快速重传
        state = FAST_RECOVERY
```

## 五、与其他技术对比
超时重传是「被动等」、代价大；快速重传是「主动推断」、代价小。但纯靠 3 dup ACK 在丢失多段或乱序严重时可能不够，故 SACK 与 RACK 进一步增强。QUIC 类似地用 ack 帧的缺失范围触发重传。

## 六、常见误区
误区一：3 个重复 ACK 一定丢包——也可能是大量乱序（如路径重排）。误区二：快速重传后进慢启动——实际进快速恢复。误区三：dupthresh 固定 3——现代实现可自适应（如 FACK/SACK 下动态）。

## 七、与开源书/权威来源对应
RFC 5681 第 3.2 节定义快速重传；xiaolincoder/hello-http 图示 3 dup ACK；Kurose & Ross 在 TCP 章讲解。

## 八、面试题
为何是 3 个重复 ACK？快速重传后为何不全降至 1？dup ACK 如何产生？与超时的代价差异？

## 九、演进与趋势
RACK（RFC 8985）以「丢失段发送时刻 + 时间阈值」判断是否重传，弱化对固定 3 dup ACK 的依赖，更适合乱序与多丢场景。

## 十、小结
快速重传借助重复 ACK 在超时前推断丢包并重传，显著提升恢复速度，是 TCP 高吞吐下的关键优化。
