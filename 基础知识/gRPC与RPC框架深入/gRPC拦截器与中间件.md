# gRPC拦截器与中间件

> 对应 gRPC 官方 Interceptor 文档；参考 grpc-go 源码（google.golang.org/grpc）。

## 一、背景与挑战
认证、日志、限流、链路追踪等横切逻辑需统一织入，不污染业务代码。gRPC 提供 unary 与 stream 两类拦截器。

## 二、核心原理
拦截器是链式包装：在调用前后插入逻辑，可修改 context、拒绝请求、记录耗时。客户端与服务端各自独立配置。

## 三、形式化与数学基础
拦截器链组合（洋葱模型）：
  handler = f1(f2(f3(biz)))
执行顺序：f1 前 -> f2 前 -> f3 前 -> biz -> f3 后 -> f2 后 -> f1 后
任一前段返回 error 即短路。

## 四、代码实现
// Go unary 服务端拦截器
func LoggingInterceptor(ctx context.Context, req interface{},
    info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
    start := time.Now()
    resp, err := handler(ctx, req)
    log.Printf("%s took %v err=%v", info.FullMethod, time.Since(start), err)
    return resp, err
}
grpc.NewServer(grpc.UnaryInterceptor(LoggingInterceptor))

## 五、与其他技术对比
等价于 HTTP 中间件，但作用在 RPC 方法粒度，能访问方法名与序列化后的消息。

## 六、常见误区
1. 拦截器里做重或阻塞操作拖慢所有调用。
2. 忘记 stream 拦截器需单独实现，否则流式请求不生效。

## 七、与开源书/权威来源对应
- gRPC 官方 Interceptor 文档
- grpc-go 源码
- xiaolincoder/hello-http

## 八、面试题
gRPC 拦截器作用？unary 与 stream 区别？如何实现链路追踪？

## 九、演进与趋势
OpenTelemetry 提供标准化拦截器，自动注入 trace context。

## 十、小结
拦截器是 gRPC 横切关注点的标准扩展点，构建可观测与安全的服务。
