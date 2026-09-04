# 0-RTT风险

> 对应 RFC 8446 §8.2（0-RTT 安全）；RFC 9001（QUIC 0-RTT）。

## 一、背景与挑战
0-RTT 让客户端首包即带 early data，省去 RTT，但服务器在尚未完成完整握手确认前就处理这些数据，引入重放（replay）攻击面。

## 二、核心原理
0-RTT 数据用此前会话的 PSK 派生密钥加密，客户端可无交互重发。攻击者截获 0-RTT 包后可在不同网络位置重放到服务器，若 early data 触发副作用（下单、改状态）即造成危害。

## 三、形式化 / 数学基础
重放威胁模型：攻击者记录 $(ClientHello_0, early\_data)$ 并在时间窗口 $W$（如数天）内重复提交；服务器若无幂等/去重，则状态变更被执行多次。
约束：TLS 1.3 规定 early data 必须可被客户端标记为“0-RTT 允许”，且服务器可用 `early_data` 扩展拒绝；QUIC 用 `max_early_data` 字节上限。

## 四、代码实现
```go
// 服务端：仅对幂等 early data 放行
if req.Method == "GET" && isIdempotent(req.Path) {
    processEarlyData(req)   // 允许
} else {
    rejectEarlyData()       // 要求走完整 1-RTT
}
```

## 五、与其他技术对比
0-RTT（有重放风险）vs 1-RTT（无重放，因服务器 Finished 后才处理）；TCP Fast Open 同样有 0-RTT 数据重放问题但缺乏加密绑定。

## 六、常见误区
误区一：0-RTT 与 1-RTT 一样安全。错，0-RTT 无抗重放保证。误区二：HTTPS 下 0-RTT 可随便发 POST。错，非幂等请求绝不可放 early data。误区三：重放只能发生一次。错，攻击者可海量重放。

## 七、与开源书 / 权威来源对应
- 图解网络：https://github.com/xiaolincoder/hello-http
- RFC 8446 §8.2、RFC 9001、Kurose & Ross 第 8 章。

## 八、面试题
1. 0-RTT 最大风险是什么？2. 哪些请求适合 0-RTT？答：幂等 GET。

## 九、演进与趋势
服务端通过去重令牌、严格幂等边界、缩短 early data 有效期来降低风险。

## 十、小结
0-RTT 的代价是抗重放缺失，仅应承载幂等数据，非幂等操作必须退回 1-RTT。
