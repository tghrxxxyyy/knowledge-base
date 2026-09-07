# gRPC流式与背压

> 对应 gRPC 官方文档与 HTTP/2 流控（RFC 9113 §5.2）；参考 xiaolincoder/hello-http。

## 一、背景与挑战
服务端流式推送海量数据（如日志、行情）时，若消费慢会把内存/网络压垮。需要背压机制协调生产消费速率。

## 二、核心原理
- HTTP/2 流控：每流与每连接有窗口，接收方通过 WINDOW_UPDATE 通告可接收字节数，原生提供传输层背压。
- 应用层背压：客户端控制 Recv 节奏，不读则窗口不增，服务端 send 阻塞。

## 三、形式化与数学基础
流窗口：
  window = initial_window - (sent - acked)
当 window <= 0：发送方暂停 DATA 帧。
  effective_rate = min(application_consume_rate, network_bw)

## 四、代码实现
// 消费方控制读取速度即形成背压
stream, _ := c.SStream(ctx, &Req{})
for {
    r, err := stream.Recv()        // 不调用则窗口不前进
    if err != nil { break }
    process(r)                     // 慢处理自然限流发送方
}

## 五、与其他技术对比
WebSocket 需自实现背压；gRPC/HTTP/2 内建窗口，开箱即用。

## 六、常见误区
1. 认为 gRPC 流无限快——受 HTTP/2 窗口与 ctx 超时约束。
2. 消费方 goroutine 泄漏导致窗口永久不前进、发送方阻塞。

## 七、与开源书/权威来源对应
- RFC 9113 §5.2 (HTTP/2 Flow Control)
- gRPC 官方文档
- xiaolincoder/hello-http

## 八、面试题
gRPC 流背压如何实现？HTTP/2 窗口作用？消费慢会怎样？

## 九、演进与趋势
应用层背压标准（如 Reactive Streams）正与 gRPC 集成。

## 十、小结
gRPC 流背压由 HTTP/2 窗口 + 应用消费节奏共同保证，是稳定流式服务的基础。
