# QUIC在HTTP3中的角色

> 对应 RFC 9114 (HTTP/3, IETF 2022)，依赖 RFC 9000；参考 xiaolincoder/hello-http。

## 一、背景与挑战
HTTP/2 的 TCP 层队头阻塞使单个丢包阻塞所有流。HTTP/3 将语义层映射到 QUIC 流，从传输层消除该阻塞。

## 二、核心原理
HTTP/3 用 QUIC 流承载：1 个控制流（SETTINGS/QPACK）、多个请求/响应双向流。每个流独立有序，流间丢包隔离。头部压缩用 QPACK（带独立解码流）。

## 三、形式化与数学基础
流映射：
  stream_id mod 4 == 0  -> 客户端发起请求/响应流
  stream_id mod 4 == 1  -> 服务端发起（推送已弃用）
QPACK 动态表需按流顺序确认，避免队头阻塞。

## 四、代码实现
// 伪代码：HTTP/3 请求映射到一个 QUIC 流
quic_stream *s = quic_open_stream(conn, BIDIRECTIONAL);
http3_send_headers(s, req.headers);  // 经 QPACK 编码
http3_send_data(s, req.body);
// 流关闭即请求结束，独立于其他流

## 五、与其他技术对比
HTTP/2 over TCP：单流丢包阻塞全部。HTTP/3 over QUIC：流级隔离 + 0-RTT + 连接迁移。

## 六、常见误区
1. 认为 HTTP/3 只是"HTTP/2 over QUIC"——QPACK、优先级模型都重新设计。
2. 忽视 QPACK 解码流也可能引入受限阻塞。

## 七、与开源书/权威来源对应
- RFC 9114 (HTTP/3)
- RFC 9204 (QPACK)
- xiaolincoder/hello-http

## 八、面试题
为何 HTTP/3 能解决队头阻塞？QPACK 是什么？

## 九、演进与趋势
HTTP/3 已被主流浏览器与 CDN 默认支持，逐步替代 HTTP/2。

## 十、小结
HTTP/3 借 QUIC 流模型彻底消除传输层队头阻塞，是 Web 传输的重大升级。
