# gRPC负载均衡

> 对应 gRPC 官方 Load Balancing 文档（grpc.io/blog/loadbalancing）；参考 xiaolincoder/hello-http。

## 一、背景与挑战
gRPC 跑在 HTTP/2 长连接上，传统 L4 轮询会把连接钉在单后端。需要应用层（per-call）或代理层负载均衡。

## 二、核心原理
- Proxy (如 Envoy)：L7 终止连接再分发，简单但与连接亲和无关。
- Client-side LB：客户端从 resolver 拿后端列表，用 pick_first / round_robin 等策略选子通道。
- Lookaside (xDS)：控制面动态下发端点与权重。

## 三、形式化与数学基础
round_robin 选择：
  next = (last + 1) mod N
加权：按权重随机/平滑加权轮询。
连接复用：同 subchannel 复用 HTTP/2 多路流，降低握手开销。

## 四、代码实现
// Go 客户端启用 round_robin
conn, _ := grpc.Dial(
    "dns:///svc.example:50051",
    grpc.WithDefaultServiceConfig(`{"loadBalancingPolicy":"round_robin"}`),
)
// 或自定义 balancer（实现 Balancer interface）

## 五、与其他技术对比
L4 负载均衡对 gRPC 不友好（连接钉死）；client-side/Envoy 在调用级均衡，更均匀。

## 六、常见误区
1. 用普通 DNS + 单次 Dial 只连一个 IP。
2. 忽略健康检查导致请求打到故障后端。

## 七、与开源书/权威来源对应
- gRPC 官方 Load Balancing 文档
- Envoy / xDS 文档
- xiaolincoder/hello-http

## 八、面试题
为何 L4 负载均衡对 gRPC 不友好？client-side LB 原理？

## 九、演进与趋势
服务网格（Istio+Envoy）将 LB 下沉为 sidecar，应用无感。

## 十、小结
gRPC 负载均衡需调用级策略（客户端或代理），是水平扩展的关键。
