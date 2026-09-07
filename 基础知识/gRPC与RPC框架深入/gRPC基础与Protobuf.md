# gRPC基础与Protobuf

> 对应 gRPC 官方文档（grpc.io）与 Protocol Buffers 文档（developers.google.com/protocol-buffers）；参考 xiaolincoder/hello-http（RPC 章）。

## 一、背景与挑战
分布式服务间需要高效、强契约的远程调用。gRPC 基于 HTTP/2 与 Protobuf，比 JSON/REST 更小更快，并提供代码生成。

## 二、核心原理
- IDL：.proto 定义 service 与 message，protoc 生成客户端/服务端桩代码。
- 传输：HTTP/2 多路复用 + Protobuf 二进制编码。
- 四种调用： unary / server streaming / client streaming / bidirectional。

## 三、形式化与数学基础
序列化大小对比（近似）：
  JSON_size >> Protobuf_size (varint + 字段编号 + 二进制)
消息编码：
  field = (tag << 3 | wire_type) + length? + value
HTTP/2 流多路复用消除队头阻塞。

## 四、代码实现
// hello.proto
syntax = "proto3";
service Greeter {
  rpc SayHello(HelloRequest) returns (HelloReply);
}
message HelloRequest { string name = 1; }
// 生成与调用（Go）
conn, _ := grpc.Dial("localhost:50051", grpc.WithInsecure())
c := NewGreeterClient(conn)
r, _ := c.SayHello(ctx, &HelloRequest{Name: "x"})
_ = r.Message

## 五、与其他技术对比
相比 REST/JSON：gRPC 强类型、高效、流式；相比 Thrift：gRPC 原生 HTTP/2、生态更云原生。

## 六、常见误区
1. 认为 Protobuf 自描述——需 .proto 才能解析。
2. 忽略 HTTP/2 连接管理，频繁建连损耗大。

## 七、与开源书/权威来源对应
- grpc.io 官方文档
- Protocol Buffers 官方文档
- xiaolincoder/hello-http

## 八、面试题
gRPC 基于什么？Protobuf 优势？为何比 REST 快？

## 九、演进与趋势
gRPC-Web / gRPC over HTTP/3 扩展浏览器与移动端支持。

## 十、小结
gRPC 用 Protobuf+HTTP/2 提供强契约、高性能 RPC，是现代微服务首选。
