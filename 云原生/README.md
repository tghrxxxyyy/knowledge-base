# 云原生板块索引与学习路径

> 云原生 = 容器 + 编排 + 微服务治理 + 可观测性 + 声明式交付。本板块把「后端工程师成长路径 B」里虚位的 `云原生/K8S` 落地为一套可读的文字笔记。

> 说明：原 `云原生/K8S.md` 为早期从有道云笔记导出的**截图笔记**（🖼️，正文以图片为主，未做文字转录）。本索引下的 `Kubernetes核心.md` 是其对应的**结构化文字版**，二者内容互补，建议以文字版为准。

## 一、本板块脉络（11 篇）

| 文档 | 定位 | 阅读优先级 |
|------|------|-----------|
| [容器与 Docker](容器与Docker.md) | 容器本质：Namespace / cgroup / 镜像分层 / Dockerfile 最佳实践 | ⭐⭐⭐ |
| [Kubernetes 核心](Kubernetes核心.md) | 控制平面、调度、Pod 生命周期、网络、存储、HPA、滚动更新、排查 | ⭐⭐⭐ |
| [K8s 网络深挖](K8s网络深挖.md) | CNI / Service / Ingress / NetworkPolicy 深入 | ⭐⭐⭐ |
| [K8s 存储深挖](K8s存储深挖.md) | PV / PVC / StorageClass / CSI 驱动深入 | ⭐⭐⭐ |
| [K8s 故障排查手册](K8s故障排查手册.md) | Pod / Service / Ingress 常见问题排查 SOP | ⭐⭐⭐ |
| [K8s 运维实战](K8s运维实战.md) | Helm / Operator 调试 / 日志排查 / 性能调优 / 故障恢复 | ⭐⭐⭐ |
| [Service Mesh](ServiceMesh.md) | Istio / Envoy、Sidecar、流量治理、mTLS | ⭐⭐ |
| [可观测性](可观测性.md) | Metrics / Logs / Traces 三支柱、Prometheus / Grafana / Loki / OpenTelemetry | ⭐⭐⭐ |
| [GitOps](GitOps.md) | 以 Git 为唯一事实源、Argo CD / Flux、声明式持续交付 | ⭐⭐ |
| [Helm 与 Operator](Helm与Operator.md) | 应用打包交付（Chart/values/Release）、CRD + 控制器把运维代码化 | ⭐⭐ |
| [Serverless 与 FaaS](Serverless与FaaS.md) | 无服务器架构：事件驱动、冷启动、Lambda/Knative、成本模型与边界 | ⭐⭐ |
| 🖼️ [K8S（早期截图笔记）](K8S.md) | 从有道云笔记导出的截图笔记（正文以图片为主，未做文字转录） | ⭐⭐ |

## 二、推荐学习路径

1. **先懂容器**：读「容器与 Docker」，理解「容器 = 被 Namespace 隔离 + cgroup 限制的普通进程」，再理解镜像分层的 UnionFS。
2. **再懂编排**：读「Kubernetes 核心」，抓住三条主线——*声明式 API（Spec/Status 调谐循环）*、*调度（Filter→Score→Bind）*、*网络（每个 Pod 一个 IP，无 NAT 互通）*。
3. **然后治理**：微服务多了以后，读「Service Mesh」理解把熔断/重试/灰度从业务代码下沉到 Sidecar。
4. **可观测兜底**：读「可观测性」，把 Metrics/Logs/Traces 串成排障闭环。
5. **最后交付**：读「GitOps」，把「改 YAML → 集群自动同步」变成工程常态；有状态关键应用再读「Helm 与 Operator」，理解交付工具与自愈控制器。
6. **有状态应用**：数据库/消息/缓存等读「Helm 与 Operator」，把备份、自愈、升级策略声明化。

## 三、与其他板块的关联

- **场景设计 / 稳定性三板斧**：K8s 的 liveness/readiness 探针、HPA、滚动更新是限流/熔断/降级的落地载体。
- **架构 / 系统架构**：微服务、事件驱动、韧性模式在 K8s 上才有标准运行底座。
- **源码系列 / Nacos / Sentinel / RocketMQ**：这些中间件在 K8s 里以 Deployment/StatefulSet 形态运行，Service 提供稳定入口。
- **CI/CD**：镜像构建、Helm、GitOps 是 CI/CD 流水线的下游与延伸。

## 四、关键口诀

> 容器轻、编排重；声明式、调谐环；每 Pod 一 IP、Service 做负载；探针分生死、HPA 抗波动；Sidecar 收治理、三支柱管可观测；Git 是唯一真相源。

---

[← 返回首页](../README.md)
