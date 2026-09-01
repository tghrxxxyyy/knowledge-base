# 服务网格 Sidecar 架构实战

> Sidecar 是 Service Mesh 的落地形态：每个服务旁挂一个代理（如 Envoy），接管服务间通信。业务代码零侵入获得 mTLS、流量管理、可观测。代价是多一跳延迟与运维复杂度，架构上要算清这笔账。

## 1. 架构形态

```mermaid
flowchart LR
    A[服务A] --> SA[(Sidecar A)]
    SA --> SB[(Sidecar B)]
    SB --> B[服务B]
```

- 服务只与本地 sidecar 通信（localhost），不感知对端位置。
- 所有流量经 sidecar 拦截（iptables/IPVS）。

## 2. 核心能力

| 能力 | 说明 |
| --- | --- |
| 流量管理 | 路由、重试、超时、熔断 |
| 安全 | 自动 mTLS、鉴权 |
| 可观测 | 自动指标/trace/日志 |
| 策略 | 限流、配额 |

## 3. 流量治理示例

```yaml
# 路由规则（概念）
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
spec:
  http:
    - route:
        - destination: {host: svc, subset: v1}
          weight: 90
        - destination: {host: svc, subset: v2}
          weight: 10
```

## 4. 取舍

- **优点**：解耦治理与业务、统一策略、语言无关。
- **代价**：延迟 +1 跳（亚毫秒~毫秒）、资源占用、调试链路变长。
- **适用**：多语言、强治理需求的中大型集群。

## 5. 常见坑

| 坑 | 现象 | 对策 |
| --- | --- | --- |
| 延迟叠加 | RT 上升 | 本地 sidecar |
| 启动依赖 | 顺序问题 | 启动探针 |
| 配置复杂 | 出错难查 | 渐进 + 校验 |
| 资源占用 | 节点紧张 | 合理 limit |
| 调试难 | 链路长 | 全链路 trace |

## 6. 面试题

1. Sidecar 如何做到零侵入？
2. 多一跳延迟如何接受？
3. 与 SDK 治理方式区别？
4. mTLS 如何自动？
5. 什么时候不该用 Mesh？

## 7. 小结

Sidecar = 流量代理 + 治理下沉 + 零侵入。核心是用"一跳延迟"换"治理统一与业务解耦"，适合多语言强治理场景。
