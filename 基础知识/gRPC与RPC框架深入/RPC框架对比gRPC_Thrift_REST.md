# RPC框架对比gRPC/Thrift/REST

> 对应 gRPC 文档、Apache Thrift 文档、Fielding 1999（REST）；参考 xiaolincoder/hello-http。

## 一、背景与挑战
选型需要在性能、跨语言、生态、运维复杂度间权衡。三者各有定位。

## 二、核心原理
- REST/JSON：基于 HTTP/1.1 资源语义，易调试、生态广，但文本开销大。
- Thrift：自带二进制协议与多语言代码生成，灵活性高，传输层可配。
- gRPC：HTTP/2 + Protobuf，强类型、流式、云原生友好。

## 三、形式化与数学基础
近似性能（相对）：
  吞吐: gRPC ~ Thrift > REST
  调试: REST > Thrift ~ gRPC
  跨语言: 三者均支持，gRPC/Thrift 需 IDL
序列化大小：
  Protobuf ~ Thrift Binary < JSON

## 四、代码实现
// REST 调用（对比）
resp := http.Post(url, "application/json", body)
// gRPC 调用
c.SayHello(ctx, &Req{})
// Thrift 调用
client.Echo(&req)  // TBinaryProtocol over TSocket

## 五、与其他技术对比
REST 适合对外开放 API；gRPC/Thrift 适合内部高吞吐服务间通信，gRPC 更现代（HTTP/2、流式）。

## 六、常见误区
1. 认为 gRPC 总能替代 REST——浏览器支持弱、调试难。
2. 认为 Thrift 性能一定优于 gRPC——取决于协议与编码配置。

## 七、与开源书/权威来源对应
- gRPC 官方文档
- Apache Thrift 官方文档
- Fielding 1999 (REST)
- xiaolincoder/hello-http

## 八、面试题
gRPC 与 Thrift 区别？何时用 REST？Protobuf 与 JSON 取舍？

## 九、演进与趋势
多协议网关（同一服务暴露 gRPC+REST）成为常态。

## 十、小结
无银弹：对外 REST、内部高吞吐 gRPC、既有 Thrift 生态各有其位。
