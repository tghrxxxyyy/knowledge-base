# QUIC连接迁移与0-RTT

> 对应 RFC 9000 §5.1（连接 ID）与 §4.5（0-RTT）；实现参考 lsquic / quiche。

## 一、背景与挑战
移动设备切换 WiFi/蜂窝网络时四元组改变，TCP 连接必然断开重连。QUIC 用连接 ID 解耦"连接"与"网络路径"，支持无缝迁移；0-RTT 复用早先会话密钥发送数据。

## 二、核心原理
- 连接 ID：客户端/服务端各自选择 CID，包路由靠 CID 而非四元组。
- 迁移：客户端在新路径发送含 NEW_CONNECTION_ID 的包，服务端据此识别同连接。
- 0-RTT：客户端缓存 TLS 早期数据密钥，首包即可携带应用数据（受重放窗口限制）。

## 三、形式化与数学基础
连接标识：
  conn_id in {0,1}^64
0-RTT 重放保护：服务器维护最近 N 秒的客户端地址+token，丢弃重复。
  retry_token = AEAD_Encrypt(server_key, (ip, t))

## 四、代码实现
// 伪代码：发送路径迁移探测
void quic_migrate(quic_conn *c, struct sockaddr *new_addr) {
    c->path_active = new_addr;
    quic_send(c, FRAME_PATH_CHALLENGE, rand64());
    quic_send(c, FRAME_PATH_RESPONSE_EXPECT);
}

## 五、与其他技术对比
TCP 迁移需 MPTCP 扩展且部署难；QUIC 原生支持且对应用透明。

## 六、常见误区
1. 0-RTT 可被重放，不能用于非幂等操作（如支付）。
2. 迁移后仍要重新验证路径（PATH_CHALLENGE）防地址欺骗。

## 七、与开源书/权威来源对应
- RFC 9000 §5.1, §4.5
- xiaolincoder/hello-http
- quiche (cloudflare) / lsquic (litespeed) 源码

## 八、面试题
QUIC 如何实现连接迁移？0-RTT 重放风险如何缓解？

## 九、演进与趋势
多路径 QUIC（draft-ietf-quic-multipath）正标准化，将进一步增强迁移能力。

## 十、小结
CID 解耦连接与路径，使迁移与 0-RTT 成为 QUIC 的标志性能力。
