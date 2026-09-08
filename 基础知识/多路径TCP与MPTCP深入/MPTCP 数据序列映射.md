# MPTCP 数据序列映射

> 对应 RFC 8684 第 3.3 节 DSS（Data Sequence Signal）与数据序列映射，以及 xiaolincoder/hello-http。

## 一、背景与挑战
多条子流各自独立传输字节，接收方必须把来自不同子流、可能乱序到达的片段，按「逻辑连接」的统一顺序重组，且能检测子流间重传/重复。这就需要数据序列号（DSN）与子流序列号（SSN）的映射。

## 二、核心原理
每个数据段在 MPTCP 层携带 DSN（覆盖整个逻辑字节流）与相对子流的映射信息（Data ACK、映射长度）。接收方用 DSS 选项把子流上的 [SSN 区间] 映射到 [DSN 区间]，从而把多子流数据拼回单一有序流交给应用。重复 DSN 段被去重。

## 三、形式化与数学基础
映射关系：子流 s 上 [ssn_a, ssn_b) 对应逻辑流 [dsn_a, dsn_a + (b-a))。接收窗口按 DSN 维一管理（而非每子流独立），保证应用看到连续有序字节。Data ACK 以 DSN 表示已收至何处。

## 四、代码实现
```c
/* DSS 选项（概览）：把子流序号段映射到 DSN */
struct dss {
    .dsn = logical_seq,        /* 逻辑数据序列号 */
    .ssn = subflow_seq,        /* 该子流上的序号 */
    .len = payload_len,
    .data_ack = highest_dsn_received,
};
```

## 五、与其他技术对比
SCTP 用单一流内 TSN 与 SID/SSN 区分流内顺序；MPTCP 在 TCP 之上叠加 DSN，使多条独立 TCP 子流对外表现为一条流。QUIC 的 stream 与 connection 层也有类似「逻辑流 vs 传输」分离。

## 六、常见误区
误区一：每子流独立序号即足够——必须用 DSN 才能跨子流排序去重。误区二：映射开销小可忽略——每个段需 DSS 选项，头部膨胀明显。误区三：子流间可无序无关——跨子流必须按 DSN 重组。

## 七、与开源书/权威来源对应
RFC 8684 第 3.3（DSS）与附录；xiaolincoder/hello-http 图示映射；Kurose & Ross 讨论复用/解复用。

## 八、面试题
DSN 与 SSN 区别？为何需要映射？Data ACK 针对什么？跨子流去重如何实现？

## 九、演进与趋势
为减小映射开销，MPTCP v1 引入更紧凑的 DSS 编码；与 0-RTT 结合的探索也在进行，但多路径的头部成本仍是研究点。

## 十、小结
数据序列映射（DSN/SSN + DSS）是 MPTCP 把多条子流透明融合为单一逻辑字节流的关键，提供跨路径有序、去重与统一流控。
