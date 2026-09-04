# HTTP2多路复用

> 对应 RFC 9113（HTTP/2）；RFC 7540 历史版本。

## 一、背景与挑战
HTTP/1.1 虽支持管线化但常队头阻塞，浏览器对每个域通常只开 6 个 TCP 连接，高并发请求需串行或争抢连接，延迟高、头部冗余大。HTTP/2 用多路复用解决。

## 二、核心原理
HTTP/2 在单个 TCP 连接上建立多个双向流（stream），每个流承载一个请求/响应对。帧（frame）按 stream ID 交织传输，实现并发而无需多连接，彻底消除应用层队头阻塞。

## 三、形式化 / 数学基础
帧结构：$Length(24bit)\ |\ Type(8bit)\ |\ Flags(8bit)\ |\ R(1)\ |\ StreamID(31bit)\ |\ Payload$。
并发上限：由 SETTINGS_MAX_CONCURRENT_STREAMS 限制同时活跃流数。
流优先级：依赖树（parent stream + weight）决定资源分配权重。

## 四、代码实现
```go
// 伪代码：在单连接上交错发送两个流的 DATA 帧
conn.write(frame{StreamID: 1, Type: DATA, Payload: partA})
conn.write(frame{StreamID: 3, Type: DATA, Payload: partB})
conn.write(frame{StreamID: 1, Type: DATA, Payload: partA2}) // 与流3交织
```

## 五、与其他技术对比
HTTP/1.1 多连接有 TCP 队头阻塞与握手开销；HTTP/2 多路复用消除应用层 HOL，但仍受 TCP 层 HOL（一个丢包阻塞整连接所有流）限制。

## 六、常见误区
误区一：HTTP/2 多路复用需要多 TCP 连接。错，单连接即可。误区二：多路复用彻底消除队头阻塞。错，仅消除应用层，TCP 层仍在。误区三：stream ID 全局唯一不回收。错，用尽后可 GOAWAY 换新连接。

## 七、与开源书 / 权威来源对应
- 图解网络：https://github.com/xiaolincoder/hello-http
- CS-Notes：https://github.com/CyC2018/CS-Notes
- RFC 9113（HTTP/2）、Kurose & Ross 第 2 章。

## 八、面试题
1. HTTP/2 如何解决队头阻塞？答：单连接多路复用流。2. 还有哪层 HOL 没解决？答：TCP 层。

## 九、演进与趋势
HTTP/3 把传输层换成 QUIC（基于 UDP），从根上消除 TCP 层 HOL。

## 十、小结
HTTP/2 用流与帧在单 TCP 连接上多路复用，消除应用层队头阻塞，是性能跃升关键。
