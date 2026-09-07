# gRPC四种调用方式

> 对应 gRPC 官方概念文档（Basics Tutorial）；参考 xiaolincoder/hello-http。

## 一、背景与挑战
不同业务对数据流方向有不同需求：一问一答、服务端推、客户端推、双向流。gRPC 以同一抽象支持四种模式。

## 二、核心原理
- Unary：client 发一个请求，收一个响应。
- Server streaming：请求一个，返回流（如订阅行情）。
- Client streaming：发流，收一个（如批量上传）。
- Bidirectional：双方独立流（如聊天、实时同步）。

## 三、形式化与数学基础
以 proto 关键字表达：
  rpc Unary(Request) returns (Response);
  rpc SStream(Request) returns (stream Response);
  rpc CStream(stream Request) returns (Response);
  rpc BStream(stream Request) returns (stream Response);
底层均为 HTTP/2 流上的 DATA 帧序列。

## 四、代码实现
// 服务端流式（Go）
func (s *Srv) SStream(req *Req, st Greeter_SStreamServer) error {
    for i := 0; i < 10; i++ {
        st.Send(&Resp{Msg: fmt.Sprintf("%d", i)})
    }
    return nil
}
// 客户端
stream, _ := c.SStream(ctx, &Req{})
for { r, err := stream.Recv(); if err != nil { break }; use(r) }

## 五、与其他技术对比
REST 仅 unary 语义清晰；gRPC 流模式原生支持，无需 WebSocket 自己封装。

## 六、常见误区
1. 流式调用也受超时控制——需在 ctx 设 deadline。
2. 双向流顺序非严格保序跨消息语义，需应用层序列号。

## 七、与开源书/权威来源对应
- gRPC 官方 Basics Tutorial
- xiaolincoder/hello-http
- RFC 9113 (HTTP/2 流)

## 八、面试题
四种调用方式？服务端流适用场景？流式如何超时？

## 九、演进与趋势
gRPC 与 Reactive/RSocket 等融合，增强背压表达。

## 十、小结
四种调用方式覆盖绝大多数服务通信模式，是 gRPC 表达力来源。
