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

## 十、AWS Step Functions 深入

### 10.1 核心概念

| 概念 | 说明 |
|------|------|
| State Machine | 工作流定义（JSON 状态机） |
| Task | 单个执行单元（Lambda/EC2/Activity） |
| Choice | 条件分支（if-else） |
| Wait | 等待指定时间/事件 |
| Parallel | 并行执行多个分支 |
| Map | 循环处理数组 |
| Pass | 透传数据/注入常量 |
| Fail/Success | 终止状态 |

### 10.2 状态机定义

```json
{
  "Comment": "订单处理工作流",
  "StartAt": "ValidateOrder",
  "States": {
    "ValidateOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123456789:function:validate",
      "Next": "CheckInventory"
    },
    "CheckInventory": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123456789:function:inventory",
      "Next": "IsInStock"
    },
    "IsInStock": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.inStock",
          "BooleanEquals": true,
          "Next": "ProcessPayment"
        }
      ],
      "Default": "NotifyOutOfStock"
    },
    "ProcessPayment": {
      "Type": "Task",
      "Resource": "arn:aws:states:::sqs:sendMessage",
      "Parameters": {
        "QueueUrl": "https://sqs.us-east-1.amazonaws.com/123456789/orders",
        "MessageBody.$": "$"
      },
      "Next": "WaitForPayment"
    },
    "WaitForPayment": {
      "Type": "Wait",
      "Seconds": 30,
      "Next": "CheckPaymentStatus"
    },
    "CheckPaymentStatus": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123456789:function:check-payment",
      "End": true
    },
    "NotifyOutOfStock": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123456789:function:notify",
      "End": true
    }
  }
}
```

### 10.3 Step Functions vs Durable Functions vs Temporal

| 维度 | Step Functions | Durable Functions | Temporal |
|------|---------------|-------------------|----------|
| 厂商 | AWS | Azure | 开源（多云） |
| 定义 | JSON 状态机 | 代码编排 | 代码编排 |
| 状态管理 | 平台托管 | 平台托管 | 平台托管 |
| 调试 | X-Ray 追踪 | 本地调试 | 本地调试 |
| 适用 | AWS 生态 | Azure 生态 | 多云/复杂编排 |

---

## 十一、Google Cloud Workflows

### 11.1 核心概念

```yaml
# workflow.yaml
main:
  params: [input]
  steps:
    - callService:
        call: http.post
        args:
          url: https://service-a.run.app/api/process
          auth:
            type: OIDC
          body:
            data: ${input.data}
        result: serviceAResult
    - checkResult:
        switch:
          - condition: ${serviceAResult.body.status == "error"}
            raise: ${serviceAResult.body}
    - returnResult:
        return: ${serviceAResult.body}
```

### 11.2 Workflows vs Step Functions

| 维度 | Google Cloud Workflows | AWS Step Functions |
|------|----------------------|-------------------|
| 语言 | YAML/伪代码 | JSON 状态机 |
| 集成 | GCP 服务 | AWS 服务 |
| 定价 | 按执行次数+GB-s | 按状态转换次数 |
| 适用 | GCP 生态 | AWS 生态 |

---

## 十二、Serverless API Gateway 模式

### 12.1 常见模式

| 模式 | 说明 | 适用 |
|------|------|------|
| 单函数路由 | 一个 Lambda 处理一个路径 | 简单 API |
| 多函数路由 | API Gateway 按路径分发到不同函数 | 复杂 API |
| 后端代理 | API Gateway 代理到 ALB/容器 | 混合架构 |
| WebSocket | 实时通信（聊天/通知） | 实时场景 |
| HTTP API | 轻量级 API Gateway（比 REST API 便宜） | REST API |

### 12.2 配置示例

```yaml
# AWS API Gateway + Lambda
openapi: 3.0.0
paths:
  /users:
    get:
      x-amazon-apigateway-integration:
        type: aws_proxy
        httpMethod: POST
        uri: arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:123456789:function:getUsers/invocations
    post:
      x-amazon-apigateway-integration:
        type: aws_proxy
        httpMethod: POST
        uri: arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:123456789:function:createUser/invocations
```

---

## 十三、Serverless Cron Job

### 13.1 实现方式

| 厂商 | 服务 | 配置 |
|------|------|------|
| AWS | EventBridge + Lambda | cron 表达式触发 |
| Azure | Timer Trigger | 毫秒级定时 |
| GCP | Cloud Scheduler + Cloud Functions | cron 触发 |
| 阿里云 | 定时触发器 + FC | cron 表达式 |

### 13.2 最佳实践

```
Serverless Cron 注意事项：
  ① 幂等：定时任务可能重复执行
  ② 超时：设合理超时（避免长任务）
  ③ 错误处理：失败重试 + 死信队列
  ④ 并发控制：避免多实例同时执行
  ⑤ 监控：执行时长/成功率告警
```

---

## 十四、Serverless 图片处理

### 14.1 架构设计

```
图片处理链路：
  用户上传 → OSS/S3 → 事件触发 → Lambda/FC
    → 缩略图生成（Sharp/Pillow）
    → 水印添加
    → 格式转换（WebP/AVIF）
    → 内容审核（AI 服务）
    → 结果写回 OSS/S3
    → CDN 刷新

技术栈：
  Node.js + Sharp（高性能图片处理）
  Python + Pillow（轻量处理）
  Go + imaging（高性能）
```

### 14.2 性能优化

| 优化项 | 说明 |
|--------|------|
| 内存配置 | 图片处理吃内存，配 1~2GB |
| 并发控制 | 限制并发避免 OSS 压力 |
| 缓存 | 相同参数的缩略图缓存 |
| 异步 | 大批量处理用 SQS/队列异步 |
| 格式 | 优先 WebP/AVIF 省带宽 |

---

## 十五、Serverless 成本计算器

### 15.1 成本计算公式

```
Lambda 成本 = 调用次数 × $0.20/百万 + GB-秒 × $0.00001667

示例：
  每月 1000 万次调用，平均 200ms，128MB 内存
  调用费：10 × $0.20 = $2.00
  计算费：10M × 0.2s × 0.125GB × $0.00001667 = $4.17
  总计：$6.17/月

对比常驻 EC2：
  t3.micro（$0.0104/h）× 730h = $7.60/月
  Lambda 更便宜（低频场景）
```

### 15.2 成本优化策略

| 策略 | 说明 | 节省 |
|------|------|------|
| 合理内存 | 内存↑ CPU↑ 时间↓，找最优值 | 30~50% |
| 批处理 | 合并请求减少调用次数 | 50%+ |
| 预置并发 | 仅核心链路开启 | 按需 |
| Spot 实例 | Fargate Spot 省 70% | 70% |
| 本地文件系统 | /tmp 缓存减少重复调用 | 变化大 |

---

## 十六、Serverless vs 容器决策矩阵

| 维度 | Serverless (FaaS) | 容器 (ECS/Cloud Run) |
|------|-------------------|----------------------|
| 冷启动 | 有（毫秒~秒） | 无（常驻） |
| 最大执行时间 | 15 分钟（Lambda） | 无限制 |
| 并发模型 | 每请求一个实例 | 每实例多请求 |
| 状态 | 无状态 | 可有状态 |
| 成本模型 | 按调用+时长 | 按实例+时长 |
| 运维 | 零运维 | 少量运维 |
| 适用 | 事件驱动/短任务 | 长时运行/稳定负载 |
| Vendor Lock-in | 高（平台绑定） | 低（容器标准） |

### 决策树

```
任务执行时间 > 15 分钟？→ 是 → 容器
需要常驻连接（WebSocket）？→ 是 → 容器
流量波动大？→ 是 → Serverless
已有容器镜像？→ 是 → 容器（Cloud Run/Fargate）
事件驱动？→ 是 → Serverless
需要 GPU？→ 是 → 容器
预算敏感？→ 看流量模式（低频→Serverless，高频→容器）
```

---

## 补充：Serverless 深度解析

### 1. AWS Lambda 冷启动优化

| 优化策略 | 说明 | 效果 |
|----------|------|------|
| Provisioned Concurrency | 预置并发消除冷启动 | 冷启动→0 |
| SnapStart | Java 内存快照恢复 | 1-3s→~100ms |
| 精简依赖 | 减少初始化包大小 | 30-50% 提升 |
| 运行时选择 | Node/Python 比 Java 快 | 10x 差异 |
| 连接池复用 | 全局作用域复用 DB 连接 | 减少初始化时间 |
| Lambda Power Tuning | 自动测试最优内存配置 | 成本降低30% |

### 2. Lambda Layers

| 特性 | 说明 |
|------|------|
| 定义 | 共享依赖库（层），多个函数复用 |
| 大小限制 | 最大 250MB（未压缩） |
| 版本控制 | 层有版本，函数绑定特定版本 |
| 使用场景 | 公共库、SDK、运行时扩展 |

```yaml
# 层结构
python/
  python/
    requests/  # 共享依赖
    utils/
```

### 3. Lambda@Edge 深度

| 特性 | 说明 |
|------|------|
| 执行位置 | CloudFront 边缘节点（全球 200+） |
| 触发事件 | Viewer Request/Response, Origin Request/Response |
| 限制 | 5s 超时、128MB 内存、Node/Python |
| 典型用法 | A/B 测试、Header 改写、认证、缓存策略 |

### 4. Azure Functions Durable Functions 模式

| 模式 | 说明 | 示例 |
|------|------|------|
| Function Chaining | 函数链式调用 | A→B→C |
| Fan-out/Fan-in | 并行执行后汇总 | N 个子任务并行 |
| Async HTTP APIs | 异步 HTTP 轮询 | 长任务状态查询 |
| Monitor | 定时轮询 | 订单状态监控 |
| Human Interaction | 人工审批 | 工作流审批 |

### 5. Google Cloud Functions Gen2

| 特性 | 说明 |
|------|------|
| 基于 | Cloud Run（统一底层） |
| 优势 | 更长超时（60min）、更大内存（32GB）、事件arc |
| 触发器 | HTTP/Pub/Sub/Cloud Storage/Firestore |
| 流量分配 | 修订版流量分配（灰度发布） |

### 6. Serverless 成本分析

```
Lambda vs EC2 成本模型对比：
  Lambda: $0.20/百万调用 + $0.00001667/GB-秒
  EC2 t3.micro: $0.0104/小时 = $7.60/月

盈亏平衡点计算：
  假设函数平均执行 200ms，128MB 内存
  每月调用次数 X:
    Lambda 成本 = X × ($0.20/1M + 0.2s × 0.125GB × $0.00001667/GB-s)
               = X × ($0.0000002 + $0.000000417)
               = X × $0.000000617
  EC2 成本 = $7.60/月
  X = $7.60 / $0.000000617 ≈ 1230万次/月

结论：每月调用 <1230万次 → Lambda 更便宜
```

### 7. Serverless 架构模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| Fan-out/Fan-in | 并行处理后汇总 | 批量处理、数据分析 |
| Aggregator | 聚合多个数据源 | API 聚合、报表 |
| Asynchronous | 异步事件处理 | 后台任务、通知 |
| Stream Processing | 流式处理 | 实时分析、日志处理 |
| Choreography | 事件驱动编排 | 微服务解耦 |

### 8. Knative on Kubernetes

| 组件 | 说明 |
|------|------|
| Knative Serving | Serverless 部署（自动伸缩到 0） |
| Knative Eventing | 事件驱动（Broker/Trigger） |
| 优势 | 无 Vendor Lock-in、K8s 原生 |
| 适用 | 混合云、多云 Serverless |

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: helloworld-go
spec:
  template:
    spec:
      containers:
        - image: gcr.io/knative-samples/helloworld-go
          env:
            - name: TARGET
              value: "World"
```

### 9. Serverless 异步集成模式

| 模式 | 架构 | 适用场景 |
|------|------|----------|
| 事件扇出 | 事件源→多 Lambda 并行处理 | 广播通知、多系统同步 |
| 结果聚合 | 多 Lambda→汇总 Lambda | 批量处理、报表生成 |
| 消息队列解耦 | SQS/Service Bus→Lambda | 削峰填谷、异步处理 |
| 流处理 | Kinesis/Event Hubs→Lambda | 实时分析、日志处理 |

### 10. Serverless 可观测性

| 维度 | 工具 | 说明 |
|------|------|------|
| 日志 | CloudWatch Logs / Azure Monitor | 函数执行日志 |
| 指标 | CloudWatch Metrics | 调用数、错误率、延迟 |
| 追踪 | X-Ray / Application Insights | 跨函数链路追踪 |
| 告警 | CloudWatch Alarms | 错误率、延迟阈值告警 |

### 11. Serverless 安全最佳实践

| 实践 | 说明 |
|------|------|
| 最小权限 IAM | 函数仅授予必要权限 |
| 环境变量加密 | 敏感配置加密存储 |
| VPC 隔离 | 函数部署在私有子网 |
| 依赖审计 | 扫描第三方依赖漏洞 |
| 输入验证 | 防止注入攻击 |
| 调用签名 | 验证事件源签名（API Gateway） |
| 日志脱敏 | 敏感数据不写日志 |
| 函数隔离 | 不同环境使用不同账号/VPC |
| 速率限制 | 防止滥用和 DDoS |
| 定期更新运行时 | 保持运行时版本最新 |
| 密钥管理 | 使用 KMS/Secrets Manager |
| 网络访问控制 | 限制函数出站流量 |
| 审计日志 | 记录所有函数调用 |
| WAF 集成 | API Gateway 配置 WAF |
| 代码签名 | 验证函数代码完整性 |

---

## 十八、Event Source Mapping 事件源映射

### 18.1 事件源类型

| 事件源 | 平台 | 触发方式 | 适用场景 |
|--------|------|----------|----------|
| SQS | AWS | 轮询 | 消息队列消费 |
| Kinesis | AWS | 轮询 | 流数据处理 |
| DynamoDB Streams | AWS | 变更流 | 数据同步 |
| EventBridge | AWS | 事件总线 | 事件路由 |
| Kafka | 多云 | 消费组 | 消息集成 |
| Storage | 多云 | 对象事件 | 文件处理 |

### 18.2 配置示例

```yaml
# AWS SAM Event Source
Events:
  SQSEvent:
    Type: SQS
    Properties:
      Queue: !GetAtt MyQueue.Arn
      BatchSize: 10
      MaximumBatchingWindow: 60
      Enabled: true
```

## 十九、Step Functions 工作流编排

### 19.1 工作流类型

| 类型 | 说明 | 适用 |
|------|------|------|
| Standard | 长时间运行，精确一次 | 复杂业务流程 |
| Express | 高吞吐，至少一次 | 数据处理管道 |

### 19.2 状态机定义

```json
{
  "Comment": "订单处理工作流",
  "StartAt": "ValidateOrder",
  "States": {
    "ValidateOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123456789:function:validate",
      "Next": "ProcessPayment"
    },
    "ProcessPayment": {
      "Type": "Task",
      "Resource": "arn:aws:states:::sqs:sendMessage",
      "Next": "SendConfirmation"
    },
    "SendConfirmation": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123456789:function:confirm",
      "End": true
    }
  }
}
```

## 二十、Knative 自动扩缩容

### 20.1 扩缩容配置

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: order-service
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "0"
        autoscaling.knative.dev/maxScale: "100"
        autoscaling.knative.dev/target: "10"
        autoscaling.knative.dev/window: "60s"
    spec:
      containers:
        - image: order-service:latest
```

### 20.2 扩缩容算法

| 参数 | 说明 | 默认值 |
|------|------|--------|
| target | 每个实例的目标并发数 | 100 |
| minScale | 最小实例数 | 0 |
| maxScale | 最大实例数 | 无限制 |
| window | 扩缩容窗口 | 60s |

## 二十一、冷启动优化策略

| 策略 | 做法 | 效果 |
|------|------|------|
| 预置并发 | 预留实例 | 消除冷启动 |
| SnapStart | 快照恢复 | 启动时间<200ms |
| 代码裁剪 | 移除无用依赖 | 减少初始化 |
| 依赖注入 | 延迟初始化 | 减少启动负担 |
| 连接池复用 | 保持连接 | 减少网络开销 |

```java
// SnapStart 示例（AWS Lambda）
// 在 Lambda 控制台启用 SnapStart
// 需要实现 SnapStartInit 优化
public class MyHandler implements RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {
    static {
        // 初始化代码（只执行一次）
        initDependencies();
    }

    @Override
    public APIGatewayProxyResponseEvent handleRequest(APIGatewayProxyRequestEvent input, Context context) {
        // 请求处理
    }
}
```

## 二十二、定时任务与 Cron 触发

| 方案 | 适用 | 精度 |
|------|------|------|
| CloudWatch Events | AWS Lambda | 分钟级 |
| EventBridge Scheduler | 多目标 | 秒级 |
| Cron + API Gateway | 自建 | 分钟级 |
| Kubernetes CronJob | K8s | 分钟级 |

```yaml
# AWS CloudWatch Event 规则
Resources:
  ScheduledRule:
    Type: AWS::Events::Rule
    Properties:
      ScheduleExpression: "rate(5 minutes)"
      State: ENABLED
      Targets:
        - Arn: !GetAtt MyFunction.Arn
          Id: ScheduledTarget
```

## 二十三、Serverless 成本模型

### 23.1 成本对比

| 场景 | Serverless | 容器（ECS） | VM |
|------|-----------|-------------|-----|
| 低频（<1000次/天） | $0.00（免费额度） | $15+/月 | $20+/月 |
| 中频（1K~100K次/天） | $5~50/月 | $50~200/月 | $100+/月 |
| 高频（>100K次/天） | $200+/月 | $100~500/月 | $200+/月 |
| 持续运行（24/7） | 最贵 | 中等 | 最便宜 |

### 23.2 成本优化

```text
成本优化策略：
  1. 选择合适内存配置（不要过度配置）
  2. 启用 ARM64 架构（便宜20%）
  3. 使用预留并发（降低单价）
  4. 批处理减少调用次数
  5. 低频用按量，高频考虑容器
```

## Lambda 事件源与触发器深度配置

```
Lambda 事件源矩阵：

  ┌─────────────────────┬─────────────────────┐
  │ 推送模型（Push）     │ 拉取模型（Pull）     │
  ├─────────────────────┼─────────────────────┤
  │ API Gateway         │ Kinesis Stream      │
  │ S3                  │ DynamoDB Streams    │
  │ SNS                 │ SQS                 │
  │ CloudWatch Events   │ EventBridge         │
  │ IoT Rules           │ MSK (Kafka)         │
  │ Alexa Smart Home    │ SQS FIFO            │
  │ CodeCommit          │                     │
  │ Cognito             │                     │
  └─────────────────────┴─────────────────────┘
```

| 事件源 | 批处理 | 并发控制 | 重试机制 | 最大并发 |
|--------|--------|---------|---------|---------|
| API Gateway | ❌ | 自动 | ❌ | 无限制 |
| S3 | ❌ | 自动 | 3 次 | 无限制 |
| SQS | ✅ | 可配置 | 可配置 | 可配置 |
| Kinesis | ✅ | 可配置 | 可配置 | 可配置 |
| DynamoDB Streams | ✅ | 可配置 | 可配置 | 可配置 |
| EventBridge | ❌ | 自动 | 180 天 | 无限制 |

```
# SQS 事件源配置
{
  "EventSourceArn": "arn:aws:sqs:us-east-1:123:my-queue",
  "FunctionName": "my-handler",
  "Enabled": true,
  "BatchSize": 10,
  "MaximumBatchingWindowInSeconds": 30,
  "ScalingConfig": {
    "ProvisionedConcurrency": 10
  },
  "FunctionResponseTypes": ["ReportBatchItemFailures"]
}

# Kinesis 事件源配置
{
  "EventSourceArn": "arn:aws:kinesis:us-east-1:123:my-stream",
  "FunctionName": "my-handler",
  "BatchSize": 100,
  "StartingPosition": "LATEST",
  "TumblingWindowInSeconds": 300,
  "FunctionResponseTypes": ["ReportBatchItemFailures"]
}

# DynamoDB Streams 事件源配置
{
  "EventSourceArn": "arn:aws:dynamodb:us-east-1:123:table/my-table/stream/2024-01-01T00:00:00.000",
  "FunctionName": "my-handler",
  "BatchSize": 100,
  "StartingPosition": "TRIM_HORIZON",
  "MaximumRetryAttempts": 3,
  "BisectBatchOnFunctionError": true
}
```

## SnapStart 与冷启动优化

```
SnapStart 工作流程：

  ① 首次调用：初始化 → 执行 → 生成快照
  │
  ② 后续调用：快照恢复 → 执行（跳过初始化）
  │
  快照内容：
    ├── JVM 堆内存
    ├── 已加载类
    ├── 已打开连接（RDS、Redis）
    └── 临时文件

  支持运行时：
    ├── Java 8/11/17/21（Corretto/Amazon Corretto）
    └── Python 3.8+（部分）

  限制：
    ├── 不支持 /tmp 写入
    ├── 不支持 GPU
    ├── 快照大小 ≤ 512MB
    └── 需要启用 Provisioned Concurrency
```

| 冷启动优化方案 | 启动时间 | 成本 | 适用场景 |
|---------------|---------|------|----------|
| 无优化 | 1-10s | 低 | 低频调用 |
| 预热 | 100-500ms | 中 | 中频调用 |
| SnapStart | 10-200ms | 中 | Java 高频 |
| Provisioned Concurrency | < 10ms | 高 | 极低延迟 |

```
# 启用 SnapStart
aws lambda publish-version \
  --function-name my-function \
  --description "SnapStart enabled"

aws lambda put-function-concurrency \
  --function-name my-function \
  --provisioned-concurrency-config {
    "ProvisionedConcurrentExecutions": 10
  }

# Python 冷启动优化
# requirements.txt 中使用 Lambda Layer
arn:aws:lambda:us-east-1:123456789012:layer:my-layer:1
```

## Lambda 成本模型深度分析

```
成本计算公式：

  总成本 = 调用成本 + 计算成本 + 存储成本 + 网络成本

  调用成本：
    └── $0.20 / 1M 次请求

  计算成本（GB-秒）：
    └── $0.0000166667 / GB-秒
    └── 计算公式 = 内存(GB) × 执行时间(s)

  存储成本：
    └── $0.0000000309 / GB-秒（/tmp 存储）
    └── $0.023 / GB/月（EFS 存储）

  网络成本：
    └── $0.09 / GB（出站数据传输）
    └── $0.00 / GB（入站）
```

| 场景 | 内存 | 执行时间 | 月调用次数 | 月成本 |
|------|------|---------|-----------|--------|
| API 处理 | 128MB | 50ms | 100 万 | ~$15 |
| 数据处理 | 1GB | 5s | 10 万 | ~$12 |
| 定时任务 | 256MB | 30s | 1 万 | ~$0.5 |
| 高频 API | 512MB | 20ms | 1000 万 | ~$30 |

```
# 成本优化策略：

1. 右调内存（Right-sizing）
   ├── 内存翻倍，CPU 也翻倍
   ├── 找到内存-速度平衡点
   └── AWS Lambda Power Tuning 工具

2. 批量处理
   ├── SQS 批量 10 条 = 10 次调用 → 1 次
   └── 减少 90% 调用成本

3. 预置并发
   ├── 避免冷启动延迟
   └── 适合稳定流量

4. ARM 架构
   ├── Graviton2 比 x86 便宜 20%
   └── 性能相当
```

```
# Power Tuning 分析
aws lambda power-tuning \
  --lambda-function my-function \
  --power-values 128,256,512,1024,2048 \
  --payload '{"test": true}' \
  --num 100 \
  --parallel invocations 10

# 输出示例：
# 512MB 是最优选择（成本-性能平衡点）
```

## 二十七、Serverless应用冷启动深度分析

### 27.1 冷启动原因分析

```text
冷启动原因：

  类加载：
    JVM首次加载类时需要读取.class文件
    反射调用需要生成字节码
    动态代理需要生成代理类
    影响：首次调用延迟增加

  JVM初始化：
    堆内存分配
    JIT编译器预热
    GC初始化
    影响：首次调用延迟增加

  依赖加载：
    Spring上下文初始化
    数据库连接池建立
    HTTP客户端初始化
    影响：首次调用延迟增加

  网络连接：
    数据库连接建立
    外部API连接建立
    DNS解析
    影响：首次调用延迟增加

  冷启动时间：
    简单函数：< 1秒
    Spring Boot：1-5秒
    复杂应用：5-10秒
```

### 27.2 冷启动优化策略

```text
冷启动优化策略：

  依赖精简：
    移除不必要的依赖
    使用轻量级框架（如Micronaut/Quarkus）
    减少自动配置
    效果：减少类加载时间

  类加载优化：
    使用GraalVM Native Image
    预编译类（AOT编译）
    减少反射使用
    效果：减少JVM初始化时间

  连接池优化：
    使用RDS Proxy
    预热连接池
    减少连接数
    效果：减少网络连接时间

  内存优化：
    调整内存大小（128MB-1024MB）
    使用堆外内存
    优化对象分配
    效果：减少GC压力

  保温策略：
    定时调用保持函数热
    使用Provisioned Concurrency
    预置并发实例
    效果：避免冷启动
```

### 27.3 GraalVM Native Image优化

```bash
# GraalVM Native Image编译
native-image -jar my-function.jar \
  --no-fallback \
  --enable-http \
  --enable-https \
  --initialize-at-run-time=com.example.MyClass

# Maven配置
<plugin>
    <groupId>org.graalvm.nativeimage</groupId>
    <artifactId>native-image-maven-plugin</artifactId>
    <version>22.2.0</version>
    <configuration>
        <imageName>my-function</imageName>
        <buildArgs>
            <arg>--no-fallback</arg>
            <arg>--enable-http</arg>
            <arg>--enable-https</arg>
        </buildArgs>
    </configuration>
</plugin>

# 优势：
#   启动时间：< 100ms
#   内存占用：< 50MB
#   无JVM开销
#   适合：简单函数、CLI工具
```

## 二十八、Serverless定时任务模式

### 28.1 EventBridge Scheduler

```yaml
# EventBridge Scheduler配置
# 定时任务：每天凌晨2点执行
Resources:
  ScheduledFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: index.handler
      Runtime: nodejs18.x
      CodeUri: src/
      Events:
        Schedule:
          Type: Schedule
          Properties:
            Schedule: cron(0 2 * * ? *)
            Description: "每天凌晨2点执行"
            Enabled: true

# EventBridge Rule配置
Resources:
  ScheduledRule:
    Type: AWS::Events::Rule
    Properties:
      Description: "定时任务规则"
      ScheduleExpression: "cron(0 2 * * ? *)"
      State: ENABLED
      Targets:
        - Arn: !GetAtt ScheduledFunction.Arn
          Id: "ScheduledFunction"

# CloudWatch Events配置
Resources:
  ScheduledEvent:
    Type: AWS::Events::Rule
    Properties:
      Description: "定时任务"
      ScheduleExpression: "rate(1 hour)"
      State: ENABLED
      Targets:
        - Arn: !GetAtt ScheduledFunction.Arn
          Id: "ScheduledFunction"
```

### 28.2 定时任务模式对比

| 模式 | 触发方式 | 适用场景 | 优缺点 |
|------|----------|----------|--------|
| EventBridge Scheduler | cron/rate | 复杂调度 | 灵活但配置复杂 |
| CloudWatch Events | cron/rate | 简单调度 | 简单但功能有限 |
| Step Functions | 工作流 | 复杂流程 | 灵活但学习成本高 |
| Lambda Destination | 函数链 | 简单链路 | 简单但功能有限 |

### 28.3 定时任务最佳实践

```text
定时任务最佳实践：

  幂等设计：
    定时任务可能重复执行
    设计幂等逻辑（唯一键去重）
    避免重复处理

  错误处理：
    重试机制（指数退避）
    死信队列（失败消息）
    告警通知（失败时通知）

  监控告警：
    执行时间监控
    成功率监控
    失败率告警

  资源优化：
    合理设置内存大小
    优化执行时间
    避免资源浪费

  日志记录：
    记录执行开始/结束
    记录处理结果
    记录错误信息
```

## 二十九、Serverless消息处理模式

### 29.1 SQS+Lambda模式

```yaml
# SQS+Lambda配置
Resources:
  MyQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: "my-queue"
      VisibilityTimeout: 300
      MessageRetentionPeriod: 345600
      RedrivePolicy:
        deadLetterTargetArn: !GetAtt DeadLetterQueue.Arn
        maxReceiveCount: 3

  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: index.handler
      Runtime: nodejs18.x
      CodeUri: src/
      Events:
        SQSEvent:
          Type: SQS
          Properties:
            Queue: !GetAtt MyQueue.Arn
            BatchSize: 10
            MaximumBatchingWindowInSeconds: 5

  DeadLetterQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: "my-dlq"
      MessageRetentionPeriod: 1209600
```

```text
SQS+Lambda模式特点：

  优点：
    异步处理：解耦生产者和消费者
    可靠投递：消息持久化+重试
    自动扩展：Lambda自动扩展处理能力
    成本效益：按实际使用付费

  缺点：
    延迟：消息可能有几秒延迟
    顺序性：不保证消息顺序
    并发限制：SQS有并发限制

  适用场景：
    异步任务处理
    后台作业
    事件驱动架构
```

### 29.2 SNS+Lambda模式

```yaml
# SNS+Lambda配置
Resources:
  MyTopic:
    Type: AWS::SNS::Topic
    Properties:
      TopicName: "my-topic"

  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: index.handler
      Runtime: nodejs18.x
      CodeUri: src/
      Events:
        SNSEvent:
          Type: SNS
          Properties:
            Topic: !Ref MyTopic

# SNS+SQS+Lambda模式
Resources:
  MyTopic:
    Type: AWS::SNS::Topic
    Properties:
      TopicName: "my-topic"

  MyQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: "my-queue"

  TopicSubscription:
    Type: AWS::SNS::Subscription
    Properties:
      TopicArn: !Ref MyTopic
      Protocol: sqs
      Endpoint: !GetAtt MyQueue.Arn

  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: index.handler
      Runtime: nodejs18.x
      Events:
        SQSEvent:
          Type: SQS
          Properties:
            Queue: !GetAtt MyQueue.Arn
```

```text
SNS+Lambda模式特点：

  优点：
    广播能力：一条消息多个消费者
    实时性：消息实时推送
    灵活性：支持多种协议（HTTP/SQS/Lambda）
    可靠性：消息持久化+重试

  缺点：
    延迟：消息可能有几秒延迟
    成本：SNS按消息数计费
    复杂性：多组件配置复杂

  适用场景：
    事件广播
    多消费者场景
    实时通知
```

### 29.3 直接触发模式

```yaml
# 直接触发配置
Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: index.handler
      Runtime: nodejs18.x
      CodeUri: src/
      Events:
        ApiEvent:
          Type: Api
          Properties:
            Path: /api/function
            Method: post
        ScheduleEvent:
          Type: Schedule
          Properties:
            Schedule: rate(1 hour)
        S3Event:
          Type: S3
          Properties:
            Bucket: !Ref MyBucket
            Events: s3:ObjectCreated:*
        DynamoDBEvent:
          Type: DynamoDB
          Properties:
            Stream: !GetAtt MyTable.StreamArn
            StartingPosition: TRIM_HORIZON
            BatchSize: 100
```

```text
直接触发模式特点：

  优点：
    简单：直接集成，无需中间件
    低延迟：实时触发
    低成本：无需额外组件
    易维护：组件少，维护简单

  缺点：
    耦合度高：与触发源紧耦合
    扩展性差：难以支持复杂场景
    可靠性低：无重试机制

  适用场景：
    简单事件处理
    API网关
    文件上传处理
    数据库变更处理
```

## 三十、Serverless可观测性

### 30.1 CloudWatch Logs Insights

```sql
-- CloudWatch Logs Insights查询
-- 查询错误日志
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 100

-- 查询性能指标
fields @timestamp, @duration, @maxMemoryUsed
| stats avg(@duration) as avgDuration, 
        max(@duration) as maxDuration,
        avg(@maxMemoryUsed) as avgMemory
| by bin(1h)

-- 查询调用次数
fields @timestamp
| stats count(*) as invocations
| by bin(5m)

-- 查询错误率
fields @timestamp, @message
| filter @message like /ERROR/
| stats count(*) as errors
| by bin(1h)
```

### 30.2 分布式追踪X-Ray

```yaml
# X-Ray配置
Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: index.handler
      Runtime: nodejs18.x
      CodeUri: src/
      Tracing: Active
      Policies:
        - AWSLambdaBasicExecutionRole
        - AWSXRayDaemonWriteAccess

# X-Ray采样规则
Resources:
  SamplingRule:
    Type: AWS::XRay::SamplingRule
    Properties:
      RuleName: "MySamplingRule"
      Priority: 1
      FixedRate: 0.1
      ReservoirSize: 10
      ServiceName: "MyService"
      ServiceType: "*"
      Host: "*"
      HTTPMethod: "*"
      URLPath: "*"
      Version: 1
      ResolvedARN: "*"
```

```text
X-Ray追踪配置：

  追踪配置：
    Tracing: Active（启用追踪）
    采样率：10%（默认）
    采样规则：自定义采样规则

  追踪信息：
    调用链：完整调用链路
    延迟分析：各阶段延迟
    错误追踪：错误堆栈
    依赖分析：外部依赖

  告警规则：
    延迟告警：P99 > 5秒
    错误率告警：错误率 > 5%
    调用量告警：调用量异常
```

### 30.3 自定义指标

```javascript
// 自定义CloudWatch指标
const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch();

exports.handler = async (event) => {
    const startTime = Date.now();
    
    try {
        // 业务处理
        const result = await processEvent(event);
        
        // 记录成功指标
        await cloudwatch.putMetricData({
            Namespace: 'MyServerlessApp',
            MetricData: [
                {
                    MetricName: 'SuccessCount',
                    Dimensions: [
                        {
                            Name: 'FunctionName',
                            Value: process.env.AWS_LAMBDA_FUNCTION_NAME
                        }
                    ],
                    Value: 1,
                    Unit: 'Count'
                },
                {
                    MetricName: 'Duration',
                    Dimensions: [
                        {
                            Name: 'FunctionName',
                            Value: process.env.AWS_LAMBDA_FUNCTION_NAME
                        }
                    ],
                    Value: Date.now() - startTime,
                    Unit: 'Milliseconds'
                }
            ]
        }).promise();
        
        return result;
    } catch (error) {
        // 记录错误指标
        await cloudwatch.putMetricData({
            Namespace: 'MyServerlessApp',
            MetricData: [
                {
                    MetricName: 'ErrorCount',
                    Dimensions: [
                        {
                            Name: 'FunctionName',
                            Value: process.env.AWS_LAMBDA_FUNCTION_NAME
                        }
                    ],
                    Value: 1,
                    Unit: 'Count'
                }
            ]
        }).promise();
        
        throw error;
    }
};
```

## 三十一、Serverless成本分析模型

### 31.1 成本构成

```text
Serverless成本构成：

  请求费：
    按请求数计费
    每月前100万次免费
    超出部分：$0.20/百万次
    计算公式：请求数 × 单价

  计算费：
    按执行时间计费
    按内存大小计费
    每月前40万GB-秒免费
    超出部分：$0.0000166667/GB-秒
    计算公式：内存(GB) × 执行时间(秒) × 单价

  存储费：
    临时存储：512MB免费
    持久化存储：S3/EFS计费
    计算公式：存储大小 × 单价

  网络费：
    出站流量计费
    入站流量免费
    计算公式：出站流量 × 单价

  其他费用：
    API Gateway费用
    DynamoDB费用
    SQS/SNS费用
    CloudWatch费用
```

### 31.2 成本计算示例

```text
成本计算示例：

  场景：
    每月调用次数：1000万次
    平均执行时间：100ms
    内存大小：256MB
    出站流量：10GB

  计算：
    请求费：
      1000万次 - 100万次免费 = 900万次
      900万次 × $0.20/百万次 = $18.00

    计算费：
      256MB = 0.25GB
      0.25GB × 0.1秒 × 1000万次 = 250万GB-秒
      250万GB-秒 - 40万GB-秒免费 = 210万GB-秒
      210万GB-秒 × $0.0000166667/GB-秒 = $35.00

    存储费：
      临时存储免费

    网络费：
      10GB × $0.09/GB = $0.90

    总成本：
      $18.00 + $35.00 + $0.09 = $53.90
```

### 31.3 成本优化策略

```text
成本优化策略：

  内存优化：
    测试不同内存配置
    选择成本-性能平衡点
    避免过度配置

  执行时间优化：
    优化代码执行效率
    减少冷启动时间
    使用异步处理

  调用次数优化：
    批量处理
    缓存结果
    减少重复调用

  网络优化：
    减少出站流量
    使用CDN
    压缩数据

  架构优化：
    选择合适的服务
    避免过度使用
    使用免费额度

  监控优化：
    监控成本使用
    设置预算告警
    定期审查成本
```

## 三十二、与其他板块的关系

- 事件驱动架构见「[架构/事件溯源与CQRS](../../架构/事件溯源与CQRS实战.md)」；
- 云上消息（事件源）见「[云上消息与集成生态](./云上消息与集成生态.md)」；
- 云原生部署见「[云原生/Serverless与FaaS](../../云原生/Serverless与FaaS.md)」；
- 云上中间件总览见「[云上中间件体系总览](./云上中间件体系总览.md)」；
- 云容器编排见「[云容器编排与DevOps体系](./云容器编排与DevOps体系.md)」。

> 一句话：**Serverless = 事件驱动 + 按量付费 + 自动伸缩；选型先看「事件源在哪（云内/边缘）、执行时长（秒级/分钟级）、冷启动容忍度」，再定「函数/容器/边缘」形态——核心机制要懂「冷启动（保温/预置/SnapStart）+ 并发上限（Reserved/限流）+ 成本模型（低频免费/高频常驻更便宜）」**。