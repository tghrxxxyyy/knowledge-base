# MPTCP 数据序列映射

> 对应 RFC 8684 第 3.3 节 DSS（Data Sequence Signal）子选项与数据序列映射机制，以及 Kurose & Ross《Computer Networking》关于复用/解复用的讨论。

## 一、背景与挑战
MPTCP 的连接由多条独立子流组成，每条子流都是一条完整的 TCP 连接，拥有自己的序号空间、窗口与重传逻辑。这带来一个根本问题：接收方如何把「来自不同子流、可能乱序甚至跨子流重复」的数据片段，还原成应用看到的「一条有序字节流」？

如果只用子流自身的 TCP 序号，接收方只能保证「每条子流内部有序」，却无法判断跨子流的先后关系。更棘手的是：同一段数据可能经一条子流发送，超时后在另一条子流重传，接收方必须能识别并去重。

因此 MPTCP 需要在子流序号之上，再叠加一层「连接级」的序号，用以统一排序、去重与流控。

## 二、核心原理
MPTCP 引入两个层级的序号，并用 DSS 子选项把它们关联起来。

- DSN（Data Sequence Number）：属于整个 MPTCP 逻辑连接，覆盖完整的逻辑字节流，是跨子流排序与去重的唯一依据。
- SSN（Subflow Sequence Number）：属于某条具体子流，即该子流 TCP 头部中的序号，由子流自身维护。
- DSS 子选项：随数据段携带 DSN、映射长度，以及连接级的 Data ACK（用 DSN 表示「已按序收到何处」），把子流上的序号区间映射到逻辑序号区间。
- 接收窗口：由 DSN 维度统一管理，而非每条子流各自为政，从而保证应用看到的字节连续有序。
- 去重：当同一 DSN 区间的数据重复到达（子流间重传），接收方按 DSN 丢弃重复副本。

一句话：DSN 负责「逻辑上的正确」，SSN 负责「子流上的传输」，DSS 是二者之间的翻译。

## 三、形式化与数学基础
设子流 $s$ 上的一段数据占据 SSN 区间 $[ssn_a, ssn_b)$，其长度为 $L = ssn_b - ssn_a$。DSS 将其映射到逻辑流上的 DSN 区间：

$$ [ssn_a,\ ssn_b) \ \mapsto\ [dsn_a,\ dsn_a + L) $$

接收方维护一个按 DSN 的有序缓冲，仅当从当前期望位置起连续时，才交付应用：

$$ ack' = ack + L_{continuous} $$

对于重复段，若其 DSN 区间完全落在已确认范围内，则丢弃：

$$ [dsn_{new},\ dsn_{new}+L) \subseteq [0, ack)\ \Rightarrow\ \text{discard} $$

接收窗口按 DSN 统一计算：

$$ W_{recv} = W_{max} - (dsn_{highest} - ack) $$

映射带来的开销可用「每段固定字节数」刻画。设每段载荷为 $P$、DSS 选项开销为 $o$，则头部占比约为：

$$ overhead = \frac{o}{P + o} $$

载荷越小，选项开销占比越高，这正是 MPTCP 在多小包场景下效率受影响的量化原因。

## 四、代码实现
以下为概念性伪代码，字段取值与编码以 RFC 8684 与内核实现为准。

```c
/* DSS 子选项（概览）：把子流序号段映射到 DSN */
struct dss_opt {
    uint8_t  subtype;        /* MPTCP_DSS */
    uint8_t  flags;          /* 是否含 Data ACK / DSN / 映射长度 */
    uint64_t data_ack;       /* 连接级确认，以 DSN 表示 */
    uint64_t dsn;            /* 本段起始逻辑序号 */
    uint32_t ssn;            /* 本段在子流上的起始序号 */
    uint16_t data_len;       /* 映射长度 */
};
```

```c
/* 发送方：为逻辑数据段分配 DSN 并附带 DSS */
void mptcp_queue_data(struct mptcp_conn *c, struct subflow *s,
                      const void *buf, size_t len)
{
    uint64_t dsn = c->snd_dsn;      /* 连接级：连续递增 */
    uint32_t ssn = s->snd_una;      /* 子流级：由该子流维护 */

    dss_emit(s, dsn, ssn, len);     /* 映射写入 DSS 选项 */
    c->snd_dsn += len;
}

/* 接收方：按 DSN 去重与排序，再交付应用 */
bool mptcp_recv(struct mptcp_conn *c, uint64_t dsn, const void *buf, size_t len)
{
    if (dsn + len <= c->rcv_ack)
        return true;                /* 完全重复，按 DSN 丢弃 */

    rbuf_insert(&c->rbuf, dsn, buf, len);   /* 乱序先缓存 */
    c->rcv_ack += rbuf_contiguous(&c->rbuf, c->rcv_ack);
    return true;
}
```

## 五、与其他技术对比

| 维度 | MPTCP（DSN + SSN） | SCTP（TSN + SID/SSN） | QUIC（Stream + Connection） |
| --- | --- | --- | --- |
| 连接级序号 | DSN | TSN | 连接级包号 |
| 子流/流级序号 | SSN | SID + SSN | Stream ID + offset |
| 排序依据 | 按 DSN 统一重组 | 流内 TSN 排序 | 流内 offset 排序 |
| 跨路径去重 | 按 DSN | 流内机制 | 包号 + 流 offset |

三者都遵循同一思想：把「逻辑流的有序性」与「传输层的重传/编号」分离，从而支持更灵活的底层传输。

## 六、常见误区
- 误区一：每子流独立序号就足够。跨子流排序与去重必须依赖 DSN，否则无法还原完整字节流。
- 误区二：映射开销可忽略。每段都要附 DSS 选项，头部膨胀在小包场景下尤为明显。
- 误区三：子流之间无序无关。接收方必须按 DSN 跨子流重组，才能保证应用字节连续。
- 误区四：Data ACK 是子流 ACK。Data ACK 作用于 DSN 维度，语义是「逻辑流已按序收到何处」。

## 七、与开源书·权威来源对应
- RFC 8684 第 3.3 节定义 DSS 子选项及其编码，并给出数据序列映射的规则。
- RFC 8684 关于 Data ACK 与接收窗口的章节描述了连接级流控语义。
- Kurose & Ross《Computer Networking》关于复用与解复用的内容可作背景。

## 八、面试题
1. DSN 与 SSN 的区别是什么？为什么两者都要存在？
2. 为什么必须有数据序列映射？没有它会发生什么？
3. Data ACK 针对的是哪个维度的序号？与子流 ACK 有何不同？
4. 跨子流重复数据如何检测与去重？

## 九、演进与趋势
- 为减小映射开销，MPTCP v1 引入更紧凑的 DSS 编码，并优化纯 ACK 场景的选项携带。
- 与多路径调度器协同，尽量把同一逻辑区间的数据集中发送，减少跨流乱序。
- 与 0-RTT 及低时延传输结合的探索仍在进行，头部成本仍是研究关注点。

## 十、小结
数据序列映射是 MPTCP 把多条子流透明融合为单一逻辑字节流的关键：DSN 提供连接级排序与去重，SSN 负责子流内传输，DSS 完成两者的翻译，Data ACK 在 DSN 维度做统一流控。正是这层映射，使多路径在应用看来仍然是「一条流」。
