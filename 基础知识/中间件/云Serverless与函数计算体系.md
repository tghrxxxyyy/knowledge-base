# 云 Serverless 与函数计算体系（FaaS / 事件驱动计算 / 边缘计算）

> Serverless = 不用管服务器，按执行付费，事件触发自动伸缩。云厂商把函数计算做成托管服务：Lambda、Azure Functions、阿里云函数计算、Cloudflare Workers。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解，并深入冷启动、并发模型、成本模型等机制。

---

## 一、Serverless 的核心概念

| 概念 | 说明 |
|------|------|
| FaaS（Function as a Service） | 函数即服务：上传代码，事件触发执行，按调用次数+时长付费 |
| BaaS（Backend as a Service） | 后端即服务：托管数据库/存储/认证等（Firebase/Supabase） |
| 事件驱动 | 函数由事件触发：HTTP 请求、消息队列、定时器、对象存储事件 |
| 冷启动 | 函数首次/久未调用时需初始化容器（毫秒~秒级延迟） |
| 无状态 | 函数实例不持久化状态，状态外置到 Redis/DB |

> 核心认知：**Serverless 不是「没有服务器」，而是「不用管服务器」**——适合事件驱动、流量波动大、短时任务的场景；不适合长时运行、低延迟稳定负载。

---

## 二、AWS Lambda（FaaS 标杆）

### 2.1 解决的问题

不想为低频任务（图片处理、定时任务、Webhook）维护常驻服务器 → 事件触发执行，按调用付费。

### 2.2 原理

- **运行时**：代码 + 运行时（Python/Node/Java/Go/自定义）打包上传
- **触发器**：API Gateway/SQS/SNS/S3/EventBridge/DynamoDB Stream/CloudWatch Events
- **执行模型**：事件到来 → 创建/复用执行环境 → 调用 handler → 返回结果
- **冷启动**：首次调用需拉取代码+初始化运行时（Java 冷启动最慢，Node/Python 快）

### 2.3 冷启动深入

```
冷启动流程：
  事件到达 → 没有空闲执行环境
  → 分配沙箱（下载代码/层）
  → 启动运行时（初始化 JVM/Node 进程）
  → 初始化 handler（加载依赖、连 DB/建客户端）
  → 执行

冷启动耗时分布（典型）：
  Node.js：100~300ms（轻）
  Python：200~500ms（轻）
  Java：1~3s（JVM 启动+类加载，最慢）
  Go/自定义 runtime：100~300ms

缓解手段：
  ① Provisioned Concurrency（预置并发）：提前创建执行环境，消除冷启动（按秒付费，贵）
  ② 精简依赖/层：减少初始化耗时
  ③ 提高调用频率：保持执行环境存活（有保温效应）
  ④ 快照启动（Lambda SnapStart，Java）：内存快照恢复，Java 冷启动降到 ~100ms
```

| 特性 | 说明 |
|------|------|
| 按调用付费 | 调用次数 + GB-秒（内存×执行时间），免费档 100 万调用/月 |
| 自动伸缩 | 从零到数千并发，无需配置 |
| 并发限制 | 账号级并发上限（可申请提升） |
| Provisioned Concurrency | 预置并发消除冷启动（贵） |
| Lambda@Edge | 在 CloudFront 边缘节点执行函数 |
| 与云生态 | 与 200+ 云服务原生联动 |
| SnapStart | Java 内存快照启动，冷启动降至 ~100ms |
| 流式响应 | 支持响应流（SSE/大响应），避免 6MB 响应限制 |

### 2.4 并发模型与限流

```
并发模型：
  Lambda 并发 = 每个实例处理 1 个请求（同步）/1 批（流）
  新事件 → 创建新实例（scale out）
  实例复用：执行完保持存活 ~5-15 分钟（保温）

限流行为：
  达到账号并发上限 → 新事件直接 429/丢弃（同步调用返回 Throttle）
  异步调用 → 自动重试 2 次（死信队列兜底）
  → 生产必须监控 Throttles 指标，预留并发（Reserved Concurrency）保护核心函数
```

**选型关注点**：冷启动敏感 → Provisioned Concurrency 或换 Node/Python；长时间任务（>15 分钟）→ 不适合 Lambda，用 ECS/Fargate；高频稳定负载 → 预留实例更便宜。

### 2.5 成本模型

```
Lambda 计费 = 调用次数 × 单价 + GB-秒 × 单价
  内存越大单价越高（128MB~10GB 可选，影响执行时间）

成本对比场景：
  低频任务（每日几次）→ Lambda 近乎免费（免费档覆盖）
  高频稳定负载（QPS 持续）→ 常驻 ECS/EC2 更便宜
  突发负载（秒杀/峰谷明显）→ Lambda 优势最大（闲置不付费）

优化：
  合理设内存（内存↑ 时间↓，存在最优值）
  用 Lambda 幂等 + 批处理减少调用次数
  Provisioned Concurrency 只在延迟敏感核心链路开启
```

---

## 三、Azure Functions

- **触发器**：HTTP/Blob/Queue/Event Hub/Timer/Cosmos DB
- **托管计划**：Consumption（按量）+ Premium（预置+弹性）+ Dedicated（App Service 计划）
- **Durable Functions**：有状态函数编排（链式/扇出扇入/人工审批）——Serverless 工作流
- **选型关注点**：Azure 生态 + 有状态编排 → Durable Functions；与 Event Hubs 集成 → 实时流处理。

### 3.1 Durable Functions 深入

```
有状态编排模式：
  ① 链式编排：A → B → C 顺序执行（函数拼接成工作流）
  ② 扇出/扇入：并行执行 N 个子函数 → 汇总结果
  ③ 异步人工审批：函数暂停等人工操作（长时间等待不占用执行）
  ④ 监视器：定时轮询外部系统（如订单状态）
  ⑤ 人机交互：超时/事件驱动继续

实现：Orchestrator（编排者，无状态、可重放）
  → Activity（活动函数，真正的业务执行）
  重放保证：Orchestrator 状态持久化（Table Storage），崩溃恢复后重放

对比：AWS Step Functions（JSON 状态机）也做 Serverless 编排
```

---

## 四、GCP Cloud Functions / Cloud Run

| 服务 | 定位 | 关键点 |
|------|------|--------|
| Cloud Functions | 事件驱动函数 | 与 GCP 服务集成、按调用付费 |
| Cloud Run | 容器化 Serverless | 任意语言打包成容器、按请求付费、冷启动快 |

- **Cloud Run** 是 GCP 的差异化优势：把 Serverless 从「函数」扩展到「容器」——任何能容器化的应用都能 Serverless 化
- **选型关注点**：已有容器镜像 → Cloud Run（迁移最顺）；纯事件函数 → Cloud Functions。

### 4.1 函数 vs 容器（FaaS vs CaaS）

```
函数（FaaS）：平台约束运行时/入口（handler），代码片段
容器（CaaS）：任意语言/框架/依赖，完整应用（Web 服务/后台任务）

选择标准：
  已有 Spring Boot/FastAPI 应用 → Cloud Run（容器，改动最小）
  事件处理小逻辑 → Cloud Functions（函数）
  Serverless 容器通常比函数更"通用"（无 vendor lock in 运行时）
```

---

## 五、国内：阿里云 FC / 腾讯云 SCF

### 5.1 阿里云函数计算（FC）

- **触发器**：HTTP/OTS/OSS/SLS/LogHub/CDN 事件/定时
- **运行时**：自定义运行时、Native Runtime
- **与生态**：与 OSS/SLS/FC 原生联动（OSS 上传→触发函数处理图片）
- **选型关注点**：国内业务 + 阿里云生态 → FC（OSS 事件触发图片处理是经典场景）。

### 5.2 腾讯云 SCF（Serverless Cloud Function）

- 与 API Gateway/COS/CMQ/Ckafka 集成
- **选型关注点**：国内业务 + 腾讯云生态 → SCF。

### 5.3 典型事件驱动场景（图片处理链路）

```
阿里云 FC 图片处理经典链路：
  用户上传图片 → OSS（对象存储）
  OSS 触发事件 → FC 函数（自动执行）
  函数处理：缩略图生成/水印/压缩/内容审核
  → 结果写回 OSS（新目录）/ 通知 CDN 刷新
  → 业务系统毫秒级感知（OSS 回调）

价值：上传与处理解耦，处理能力随上传量自动伸缩
     无需任何常驻服务器，按处理次数付费
```

---

## 六、边缘计算（Edge Computing）

### 6.1 解决的问题

用户离源站远 → 延迟高。把计算推到 CDN 边缘节点，毫秒级响应。

### 6.2 服务

| 服务 | 厂商 | 关键点 |
|------|------|--------|
| Cloudflare Workers | Cloudflare | V8 isolate（非容器，冷启动≈0）、全球 300+ 节点、KV/Durable Objects |
| Lambda@Edge | AWS | CloudFront 边缘节点执行 Lambda |
| CloudFront Functions | AWS | 轻量 JavaScript（毫秒级，边缘） |
| Azure Functions Premium (Edge) | Azure | 边缘节点执行 |
| 阿里云边缘函数计算 ENS | 阿里云 | 边缘节点计算 |

### 6.3 V8 isolate vs 容器（冷启动本质差异）

```
Cloudflare Workers 为什么冷启动 ≈ 0？
  传统 FaaS：每实例 = 一个容器/沙箱（进程级隔离）→ 创建耗时
  Workers：每实例 = 一个 V8 isolate（线程级隔离，共享 V8 引擎进程）
    → 无进程启动开销，只序列化代码
    → 冷启动 ~0ms（微秒~毫秒级）

代价：隔离性弱于容器（同进程多租户）→ 有 CPU/内存硬限制
适用：轻量 HTTP 逻辑/边缘改写/全球低延迟
```

**选型关注点**：全球边缘 + 零冷启动 → Cloudflare Workers（V8 isolate 最快）；AWS 生态 → Lambda@Edge；轻量边缘逻辑（A/B 测试/Header 操作）→ CloudFront Functions。

### 6.4 边缘计算典型应用

```
① CDN 边缘改写：请求头注入/A/B 分流/设备识别
② 边缘认证：JWT 校验在边缘完成，源站零压力
③ 边缘聚合：IoT 数据在边缘聚合后回传（省带宽）
④ 全球低延迟 API：业务逻辑推到离用户最近的节点
⑤ 防 DDoS/爬虫：边缘层规则拦截
```

---

## 七、Serverless 数据库与存储

| 服务 | 厂商 | 定位 |
|------|------|------|
| DynamoDB On-Demand | AWS | Serverless KV，按请求付费 |
| Aurora Serverless | AWS | Serverless 关系库，按 ACU 付费 |
| Cosmos DB Serverless | Azure | Serverless 文档库，按请求付费 |
| Cloud Firestore | GCP | Serverless 文档库 |
| Fauna | 多云 | Serverless 关系+文档 |

**解决的问题**：数据库容量规划难、闲时浪费 → Serverless 数据库按量伸缩。

### 7.1 Serverless DB 伸缩机制

```
Aurora Serverless v2：
  按 ACU（Aurora Capacity Unit）自动伸缩（0.5~128 ACU）
  0.5 ACU ≈ 2GB 内存，伸缩粒度细（秒级）
  无流量时可缩到最低（保留基线，不能到 0）

DynamoDB On-Demand：
  按请求量自动伸缩（RCU/WCU 按量计费）
  无预留容量，突发也能扛（按突发实际计费）

对比：预留容量（Provisioned）在稳定负载下更便宜
  峰值尖刺明显 → On-Demand / Serverless
  稳定持续负载 → Provisioned（省 50%+）
```

**选型关注点**：流量波动大 + 不可预测 → Serverless 档；稳定负载 → 预留容量更便宜。

---

## 八、Serverless 架构模式与最佳实践

### 8.1 设计原则

```
① 无状态：状态放外部（S3/Redis/DB），函数本身不可变
② 事件驱动：函数之间通过事件解耦（S3→SQS→Lambda 链）
③ 幂等：重试安全（事件至少一次语义）
④ 单一职责：一个函数一件事（便于伸缩与排查）
⑤ 超时短：函数设合理超时（默认 3s~15min），避免长任务占资源
⑥ 错误处理：重试 + 死信队列（DLQ）+ 告警
```

### 8.2 常见反模式

| 反模式 | 问题 | 正确做法 |
|--------|------|----------|
| 函数写日志到本地 | 实例销毁日志丢失 | 写云日志服务（CloudWatch/CLS） |
| 每次调用建 DB 连接 | 连接开销大 | 连接放全局作用域（复用实例） |
| 函数内做重计算 | 重复计算浪费 | 缓存中间结果（Redis） |
| 一个函数做所有事 | 难以伸缩/排查 | 按职责拆分 |
| 同步调用链过长 | 超时/费用失控 | 用异步事件链（SQS/EventBridge） |

---

## 九、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 事件驱动短任务 | Lambda / FC / SCF | Cloud Functions |
| 容器化 Serverless | Cloud Run | AWS Fargate |
| 全球边缘计算 | Cloudflare Workers | Lambda@Edge |
| 有状态 Serverless 编排 | Azure Durable Functions | AWS Step Functions |
| 图片/文件处理 | Lambda + S3 / FC + OSS | — |
| 定时任务 | EventBridge + Lambda / 云函数定时 | — |
| 低延迟 API | Cloud Run / Lambda + API Gateway | — |
| Serverless 数据库 | DynamoDB On-Demand / Aurora Serverless | Firestore |
| 迁移现有 Web 应用 | Cloud Run / Fargate | — |

### 9.1 决策树

```
有现有容器镜像？→ 是 → Cloud Run / Fargate / 托管容器
事件驱动小逻辑？→ 是 → FaaS（Lambda/FC/SCF）
需要全球低延迟？→ 是 → 边缘（Workers/Lambda@Edge）
需要有状态编排？→ 是 → Durable Functions / Step Functions
数据库要不要 Serverless？→ 波动大 → On-Demand；稳定 → Provisioned
```

---

## 十、与其他板块的关系

- 事件驱动架构见「[架构/事件溯源与CQRS](../../架构/事件溯源与CQRS实战.md)」；
- 云上消息（事件源）见「[云上消息与集成生态](./云上消息与集成生态.md)」；
- 云原生部署见「[云原生/Serverless与FaaS](../../云原生/Serverless与FaaS.md)」；
- 云上中间件总览见「[云上中间件体系总览](./云上中间件体系总览.md)」；
- 云容器编排见「[云容器编排与DevOps体系](./云容器编排与DevOps体系.md)」。

> 一句话：**Serverless = 事件驱动 + 按量付费 + 自动伸缩；选型先看「事件源在哪（云内/边缘）、执行时长（秒级/分钟级）、冷启动容忍度」，再定「函数/容器/边缘」形态——核心机制要懂「冷启动（保温/预置/SnapStart）+ 并发上限（Reserved/限流）+ 成本模型（低频免费/高频常驻更便宜）」**。