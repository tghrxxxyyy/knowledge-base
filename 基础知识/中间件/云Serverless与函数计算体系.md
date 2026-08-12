# 云 Serverless 与函数计算体系（FaaS / 事件驱动计算 / 边缘计算）

> Serverless = 不用管服务器，按执行付费，事件触发自动伸缩。云厂商把函数计算做成托管服务：Lambda、Azure Functions、阿里云函数计算、Cloudflare Workers。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

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

| 特性 | 说明 |
|------|------|
| 按调用付费 | 调用次数 + GB-秒（内存×执行时间），免费档 100 万调用/月 |
| 自动伸缩 | 从零到数千并发，无需配置 |
| 并发限制 | 账号级并发上限（可申请提升） |
| Provisioned Concurrency | 预置并发消除冷启动（贵） |
| Lambda@Edge | 在 CloudFront 边缘节点执行函数 |
| 与云生态 | 与 200+ 云服务原生联动 |

**选型关注点**：冷启动敏感 → Provisioned Concurrency 或换 Node/Python；长时间任务（>15 分钟）→ 不适合 Lambda，用 ECS/Fargate；高频稳定负载 → 预留实例更便宜。

---

## 三、Azure Functions

- **触发器**：HTTP/Blob/Queue/Event Hub/Timer/Cosmos DB
- **托管计划**：Consumption（按量）+ Premium（预置+弹性）+ Dedicated（App Service 计划）
- **Durable Functions**：有状态函数编排（链式/扇出扇入/人工审批）——Serverless 工作流
- **选型关注点**：Azure 生态 + 有状态编排 → Durable Functions；与 Event Hubs 集成 → 实时流处理。

---

## 四、GCP Cloud Functions / Cloud Run

| 服务 | 定位 | 关键点 |
|------|------|--------|
| Cloud Functions | 事件驱动函数 | 与 GCP 服务集成、按调用付费 |
| Cloud Run | 容器化 Serverless | 任意语言打包成容器、按请求付费、冷启动快 |

- **Cloud Run** 是 GCP 的差异化优势：把 Serverless 从「函数」扩展到「容器」——任何能容器化的应用都能 Serverless 化
- **选型关注点**：已有容器镜像 → Cloud Run（迁移最顺）；纯事件函数 → Cloud Functions。

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

**选型关注点**：全球边缘 + 零冷启动 → Cloudflare Workers（V8 isolate 最快）；AWS 生态 → Lambda@Edge；轻量边缘逻辑（A/B 测试/Header 操作）→ CloudFront Functions。

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

**选型关注点**：流量波动大 + 不可预测 → Serverless 档；稳定负载 → 预留容量更便宜。

---

## 八、选型速查

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

---

## 九、与其他板块的关系

- 事件驱动架构见「[架构/事件溯源与CQRS](../../架构/事件溯源与CQRS实战.md)」；
- 云上消息（事件源）见「[云上消息与集成生态](./云上消息与集成生态.md)」；
- 云原生部署见「[云原生/Serverless与FaaS](../../云原生/Serverless与FaaS.md)」；
- 云上中间件总览见「[云上中间件体系总览](./云上中间件体系总览.md)」。

> 一句话：**Serverless = 事件驱动 + 按量付费 + 自动伸缩；选型先看「事件源在哪（云内/边缘）、执行时长（秒级/分钟级）、冷启动容忍度」，再定「函数/容器/边缘」形态。**
