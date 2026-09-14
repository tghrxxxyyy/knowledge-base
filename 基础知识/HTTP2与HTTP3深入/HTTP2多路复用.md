# HTTP2多路复用

> 对应 RFC 9113（HTTP/2）；RFC 7540 历史版本。

## 一、背景与挑战
HTTP/1.1 即使开启流水线（pipelining）也无法根治队头阻塞：单个 TCP 连接上响应必须按请求顺序返回。

任一慢响应会阻塞其后所有请求；加之浏览器对每个域通常只开 6 个连接，高并发下请求不得不排队或争抢连接。

这带来额外握手、慢启动与头部冗余开销。HTTP/2 的核心创新是在「一条 TCP 连接」上并发承载多个逻辑流，从应用层消除队头阻塞。

## 二、核心原理
HTTP/2 引入两个抽象：**流（Stream）**与**帧（Frame）**。

流是连接内双向的虚拟信道，承载一个请求/响应对；帧是最小传输单元。

所有帧都带 31 位 Stream ID，发送端将不同流的帧交织（interleave）到同一 TCP 连接上，接收端按 Stream ID 重组，从而实现并发而无需多连接。

关键帧类型包括 DATA(0x0)、HEADERS(0x1)、PRIORITY(0x2)、RST_STREAM(0x3)、SETTINGS(0x4)、PING(0x6)、GOAWAY(0x7)、WINDOW_UPDATE(0x8)、CONTINUATION(0x9)。

流还有生命周期状态机：idle → reserved → open → half-closed → closed，RST_STREAM/GOAWAY 用于异常终止或优雅关闭。

## 三、形式化与数学基础
帧头部固定 9 字节，结构为：

$$ Frame = Length(24) \parallel Type(8) \parallel Flags(8) \parallel R(1) \parallel StreamID(31) \parallel Payload $$

其中 $Length$ 不含头部本身，最大 $2^{24}-1$ 字节（默认受 SETTINGS_MAX_FRAME_SIZE 限制更小）。

Stream ID 的奇偶隐含方向：客户端发起为奇数、服务端为偶数，ID 0 保留给连接级控制帧。

并发流数受 $C=SETTINGS\_MAX\_CONCURRENT\_STREAMS$ 约束，活跃流数 $|active|\le C$。

用尽的 ID 空间通过 GOAWAY 触发新连接重用；Connection 级别控制帧（如 SETTINGS、PING）固定用 Stream ID 0。

## 四、代码实现
```go
// 伪代码：在单连接上交织两个流的 DATA 帧（多路复用）
type Frame struct{ StreamID uint32; Type byte; Payload []byte }
conn.Write(Frame{StreamID: 1, Type: 0x0, Payload: partA})  // 流1 数据
conn.Write(Frame{StreamID: 3, Type: 0x0, Payload: partB})  // 流3 数据，与流1交织
conn.Write(Frame{StreamID: 1, Type: 0x0, Payload: partA2}) // 流1 续传，无需重开连接

// 流级流量控制：每条流独立窗口，避免快生产者淹没慢消费者
conn.Write(Frame{StreamID: 3, Type: 0x8, Payload: u32(windowIncrement)}) // WINDOW_UPDATE
```

```go
// 伪代码：接收端按 Stream ID 重组
for f := range conn.ReadFrames() {
    streams[f.StreamID].Buffer(f.Payload)  // 各自重组，互不阻塞
    if f.Type == 0x3 { streams[f.StreamID].Close() } // RST_STREAM
}
```

## 五、与其他技术对比
| 维度 | HTTP/1.1 | HTTP/2 多路复用 | HTTP/3(QUIC) |
| --- | --- | --- | --- |
| 连接数 | 每域 6 个 | 单连接 | 单 UDP 连接 |
| 应用层 HOL | 有 | 无 | 无 |
| 传输层 HOL | 有 | 有（TCP） | 无（每流独立） |
| 队头阻塞解法 | 多连接 | 流交织 | 流级可靠 |
| 头部压缩 | 无 | HPACK | QPACK |

HTTP/2 多路复用消除了应用层 HOL，但所有流共享同一条 TCP，任一丢包触发 TCP 重传会阻塞整条连接上的全部流——这是它未解决的尾巴。

## 六、常见误区
- 误区：HTTP/2 多路复用需要多 TCP 连接。错，单连接即可，多连接反而违背设计初衷。
- 误区：多路复用彻底消除队头阻塞。错，仅消除应用层，TCP 层丢包重传仍会冻结全连接。
- 误区：Stream ID 全局唯一不回收。错，32 位空间用尽后须 GOAWAY 换新连接；且奇数/偶数是方向约定。
- 误区：流越多越好。错，过多流增大头部与调度开销，且受 MAX_CONCURRENT_STREAMS 限制。
- 误区：HEADERS 帧一定单独成块。错，大头部块会拆为 HEADERS + 多个 CONTINUATION 帧。

## 七、与开源书·权威来源对应
- RFC 9113（HTTP/2）第 5 章「Streams and Multiplexing」与第 4 章「Frame Format」。
- RFC 7540 为早期版本，语境内可对照演进。
- Stevens《TCP/IP Illustrated》卷 1 关于 TCP 连接与字节流语义。
- Kurose & Ross《Computer Networking》第 2 章应用层协议效率。

## 八、面试题
1. HTTP/2 如何在单连接上并发？（帧带 Stream ID，交织传输，按 ID 重组。）
2. 还有哪层 HOL 没解决？（TCP 层：丢包重传冻结整连接所有流。）
3. 流与帧的关系？Stream ID 奇偶含义？（流是虚拟信道，帧是单元；奇=客户端，偶=服务端。）
4. 流量控制怎么做？（WINDOW_UPDATE 连接级 + 流级窗口。）
5. 流的状态机有哪些关键状态？（idle/open/half-closed/closed，RST_STREAM 触发关闭。）

## 九、演进与趋势
HTTP/3 把传输层换成 QUIC（基于 UDP），每个流拥有独立的可靠有序信道，丢包仅影响本流，从而从根上消除 TCP 层 HOL。

同时 0-RTT 与连接迁移进一步放大多路复用收益；HTTP/2 的多路复用思想（流/帧/优先级）被直接沿用为 HTTP/3 的 QUIC 流抽象。

优先级信令也在演进：HTTP/2 的 PRIORITY 树较复杂，HTTP/3 改用更扁平的优先级（RFC 9218）。

## 十、小结
HTTP/2 用流与帧在单 TCP 连接上实现应用层多路复用，消除请求级队头阻塞、合并连接、压缩头部，是 Web 性能跃升的关键。

其遗留的 TCP 层 HOL 由 HTTP/3/QUIC 承接解决；理解流/帧模型也是排查「单连接卡顿」类线上问题的前提。
