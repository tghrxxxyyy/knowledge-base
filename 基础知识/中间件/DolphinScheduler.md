# DolphinScheduler（工作流调度 / 大数据任务编排）

> Apache DolphinScheduler 是**国产开源的工作流任务调度平台**（Apache 顶级项目），以「**DAG 工作流可视化编排 + 分布式调度 + 多租户 + 容错**」成为大数据/数据平台任务调度的首选。相比 XXL-JOB（定时任务平台，无工作流 DAG）、Airflow（Python 编码，重）、Azkaban（LinkedIn 老牌）、Oozie（XML 配置，已边缘化），DolphinScheduler 以「**可视化拖拽 + 开箱即用 + 任务类型丰富（30+）**」独树一帜。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 任务依赖编排 | 数据任务有先后依赖（抽数→清洗→建模），cron 无法表达 |
| 失败重跑 | 任务失败要自动重试 + 支持断点重跑 |
| 任务运维 | 执行状态/日志/告警需要可视化 |
| 多租户隔离 | 多个业务线共用调度平台，互不干扰 |
| 跨系统任务 | 要调度 SQL/Shell/Spark/Flink/HTTP 等异构任务 |

> 核心认知：**DolphinScheduler = 「任务即 DAG，DAG 即可视化」**——把大数据链路的每一步画成流程图，平台负责调度、执行、重试、告警。

---

## 二、核心原理

### 2.1 架构

```
MasterServer（调度中心集群，无状态）
  ├── 生成/分发工作流实例（DAG 解析 → 任务实例）
  ├── 任务依赖管理（DAG 拓扑 → 就绪触发）
  └── 容错（Master 故障 → 其他 Master 接管实例）

WorkerServer（执行器集群）
  ├── 接收任务实例执行（任务类型插件化：Shell/SQL/Spark/Flink...）
  ├── 心跳上报 + 任务状态回传
  └── 租户（操作系统用户）隔离执行

ZooKeeper（协调）
  ├── Master/Worker 注册与选举（HA）
  └── 分布式锁（任务实例防重复）

API Server + UI（Web 控制台：DAG 拖拽编排/监控/告警）
数据库（工作流定义/实例/告警持久化：MySQL/PG）
```

### 2.2 核心流程深入

```
调度触发流程：
  时间/依赖满足 → 创建流程实例（快照 DAG 定义）
  → 遍历 DAG 拓扑：找出"入度为 0"就绪任务
  → Master 提交到队列 → 分发到合适 Worker
  → Worker 执行 → 回传状态（成功/失败/运行中）
  → 状态变化触发下游任务（依赖满足 → 就绪）
  → 流程结束（全部成功/失败策略生效）

失败策略（节点级）：
  失败重试 N 次（间隔可配）
  失败继续（非关键路径节点）
  失败停止（关键节点，整个流程失败）
  失败告警（邮件/钉钉/飞书/企微/Webhook）

关键机制：
  Master 无状态（流程实例状态在 DB）→ 任意 Master 可接管
  Worker 执行幂等（任务实例有唯一 ID，可重跑）
  ZK 分布式锁防重复调度
```

### 2.3 任务实例状态机

```
状态机：
  SUBMITTED_SUCCESS（已提交）→ RUNNING_EXECUTION（执行中）
  → SUCCESS（成功）/ FAILURE（失败，按策略重试/终止）
  特殊状态：
    READY_PAUSE / PAUSE（暂停）
    READY_STOP / STOP（终止）
    DELAY_EXECUTION（延迟执行）
    SERIAL_WAIT（串行等待，并发控制）

容错状态：
  NEED_FAULT_TOLERANCE（Worker 失联 → 其他 Worker 接管）
  DISPATCH（分发中）
```

### 2.4 关键能力

| 能力 | 说明 |
|------|------|
| 定时调度 | cron 表达式 + 日历（工作日/节假日） |
| 依赖调度 | 任务间 DAG 依赖 + 跨工作流依赖（上游完成才触发） |
| 补数 | 历史日期批量补跑（数据修复刚需） |
| 容错 | Master/Worker 故障自动接管，任务实例幂等 |
| 多租户 | 租户 ↔ 系统用户 ↔ 资源隔离 |
| 优先级 | 队列 + 优先级抢占（重要任务先跑） |
| 资源中心 | 文件/UDTF/UDF 统一管理 |
| 数据质量 | 内置数据质量检查（内置规则 + 自定义） |

### 2.5 补数机制深入

```
补数 = 对历史日期批量生成流程实例
  如：补 7 月 1-30 天的日报 → 生成 30 个实例并行跑
  参数化任务：${businessDate} 变量（每个实例注入不同日期）
  → 幂等是前提：任务可重复执行不产生脏数据（覆盖写/唯一键）

补数触发方式：
  手动：控制台选择日期区间 → 批量补跑
  定时：错过窗口自动补跑（如宕机恢复后）
  依赖：上游补数自动级联下游
```

### 2.6 参数传递机制

```
参数类型：
  全局参数（流程级）：所有任务可见
  局部参数（节点级）：单任务可见
  参数来源：
    手动定义
    OUT 参数：上游任务输出 → 下游引用（${task.xxx.output}）
    时间变量：${businessDate} / ${yesterday} 等内置变量
  替换时机：任务提交 Worker 时模板渲染
```

---

## 三、核心特性

| 特性 | 说明 |
|------|------|
| 可视化编排 | 拖拽式 DAG 设计器，零代码 |
| 任务类型丰富 | Shell/SQL（MySQL/PG/Hive/Spark SQL）/Spark/Flink/HTTP/MR/Python/DataX 等 30+ |
| 高可用 | Master/Worker 双集群 + ZK 协调 |
| 多租户 | 租户级资源/权限隔离 |
| 告警完善 | 邮件/钉钉/飞书/企微/Webhook 多渠道 |
| 补数/重跑 | 历史补数 + 失败任务单点重跑 |
| 数据质量 | 内置规则引擎（表行数/空值率/唯一性...） |
| 中文友好 | 国产项目，文档/社区中文 |
| 云原生 | 1.3+ 支持 K8s 部署/Operator |
| 参数化 | 全局/局部参数 + 时间变量 + 跨任务传递 |
| 运行组/租户 | Worker 分组 + 资源隔离（Weight/CPU 权重） |

### 3.1 数据质量能力

```
内置规则（开箱即用）：
  空值检查：空值率、空值个数
  完整性：表行数、行数波动
  唯一性：重复值率
  有效性：自定义 SQL 校验
  及时性：数据时间 vs 当前时间（新鲜度）

数据质量任务类型：
  DataQualityTask（SQL 数据质量检查任务）
  质量结果 → 判定（阻断/放行/告警）
  → 可结合血缘做"质量门禁"（质量不过 → 下游不跑）
```

---

## 四、DolphinScheduler vs Airflow vs XXL-JOB vs Azkaban

| 维度 | DolphinScheduler | Airflow | XXL-JOB | Azkaban |
|------|------------------|---------|---------|---------|
| 定位 | 大数据工作流 | 通用工作流（Python） | 定时任务 | 工作流 |
| 编排方式 | 可视化拖拽 | Python 代码（DAG） | 无 DAG | 配置/KV |
| 任务类型 | 30+ 内置（大数据丰富） | Operator（Python 编写） | Java Bean/脚本 | 命令 |
| 部署 | 中（ZK 依赖） | 重（K8s 友好） | 轻 | 轻 |
| 多租户 | 强 | 弱 | 无 | 中 |
| 补数 | 原生 | 需扩展 | 部分 | 弱 |
| 社区 | Apache 顶级（中文社区） | 全球（最活跃） | 国内活跃 | 维护缓慢 |
| 适用 | 数据平台/数仓 | 数据工程/MLOps | 业务定时任务 | 传统 Hadoop 批 |

**选型关注点**：
- 数据平台/数仓任务编排 → **DolphinScheduler**（可视化 + 任务类型 + 中文生态）；
- 数据工程/Python 生态/MLOps → **Airflow**（代码即编排，灵活最强）；
- 业务定时任务（无复杂依赖） → **XXL-JOB**（轻量）；
- 传统 Hadoop 环境 → **Azkaban**（简单够用）。

---

## 五、生产实践

### 5.1 关键配置

| 配置 | 建议 |
|------|------|
| 集群 | Master ≥2、Worker ≥3（奇数推荐），ZK 集群 |
| 租户 | 每业务线一个租户（用户隔离 + 权限） |
| 失败策略 | 关键链路失败重试 2~3 次 + 失败停止 + 告警 |
| 优先级 | 核心任务高优先级（队列抢占） |
| 数据质量 | 关键表接质量规则（行数波动/空值率告警） |
| 补数规范 | 补数加「幂等」（任务可重复执行不产生脏数据） |
| 监控 | Master/Worker 健康 + 任务积压 + 失败率告警 |
| Worker 分组 | 长任务/短任务分 Worker 组（WorkGroup），负载均衡 |

### 5.2 容量与资源管理

```
Worker 资源模型：
  每 Worker 有 CPU/内存权重 → 任务按权重分配（加权轮询）
  每个任务可指定 CPU/内存需求（最大并行数限制）
  任务实例数上限（maxTaskNum）防过载

优化：
  长 SQL/Spark 任务 → 独立 Worker 组（避免挤占短任务）
  高峰期错峰：重要任务优先（优先级抢占）
  监控 Worker 负载：CPU/内存/任务数
```

### 5.3 常见坑

- **任务不幂等**：失败重试/补数会导致重复数据 → 任务必须幂等（唯一键/覆盖写）；
- **Worker 负载不均**：长任务/短任务混跑 → 按业务拆 Worker 组（WorkGroup 隔离）；
- **ZK 是单点依赖**：ZK 集群故障会瘫痪调度 → ZK 必须 3 节点以上；
- **DB 是瓶颈**：工作流实例大量产生 → 定期清理历史实例（保留期配置）；
- **时区问题**：cron 与日历配置注意服务器时区（历史坑）；
- **流程实例爆炸**：依赖循环/触发配置错误 → 实例无限生成 → 设置最大实例数/超时时间。

### 5.4 高可用与故障恢复

```
Master HA：多 Master + ZK 选主（无主模式，任意 Master 处理）
Worker 容错：Worker 失联 → ZK 超时 → 任务标记 NEED_FAULT_TOLERANCE
  → 其他 Worker 重新执行（幂等保障）
DB HA：MySQL 主从 + 半同步（流程实例状态是核心数据）
ZK：3 节点以上（5 节点推荐）

故障恢复流程：
  Master 宕机 → 存活 Master 接管（流程实例从 DB 恢复调度）
  Worker 宕机 → 运行中任务重新派发
  数据库宕机 → 调度不可用（元数据全在 DB）→ DB 必须高可用
```

---

## 六、与 XXL-JOB 的选择

```
同源关系：DolphinScheduler 创始团队曾参与 XXL-JOB
定位差异：
  XXL-JOB：定时任务执行（无 DAG 编排），轻量，Java 业务任务
  DolphinScheduler：工作流编排（DAG），重，大数据任务

选择：
  纯业务定时任务（Java 方法/脚本，单任务）→ XXL-JOB
  数据管道编排（依赖/补数/数据质量）→ DolphinScheduler
  二者可共存：XXL-JOB 跑业务任务，DS 编排数据管道
```

---

## 七、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 数仓/数据平台编排 | DolphinScheduler | Airflow |
| Python 数据工程/MLOps | Airflow | DolphinScheduler |
| 业务定时任务 | XXL-JOB | DolphinScheduler |
| 多租户隔离 | DolphinScheduler | — |
| 可视化编排 | DolphinScheduler | Azkaban |
| 云上托管 | 云 EMR 调度/Workflow | DolphinScheduler on K8s |

### 7.1 决策树

```
有 DAG 依赖编排需求？→ 是 → 数据平台 → DS；Python/ML → Airflow
单任务定时？→ XXL-JOB
多租户强隔离？→ DS
团队习惯可视化 vs 代码？→ 可视化 → DS；代码 → Airflow
```

---

## 八、DolphinScheduler 架构深度解析

### 8.1 Master/Worker/Alert 架构详解

```
DolphinScheduler 分布式架构：

  API Server（Web 接口，可多实例）
    ├── REST API（工作流 CRUD、操作控制）
    ├── 权限管理（租户/项目/资源/告警）
    └── UI 前端（Vue.js）

  MasterServer（调度集群，无状态）
    ├── DAG 解析器（工作流定义 → 任务拓扑）
    ├── 调度器（定时触发 + 依赖触发）
    ├── 任务分发器（按策略分配到 Worker）
    ├── 容错管理器（检测 Worker 故障 → 重新调度）
    └── 依赖管理（跨工作流依赖）

  WorkerServer（执行器集群）
    ├── 任务执行器（Shell/SQL/Spark/Flink/HTTP）
    ├── 心跳上报（30 秒一次）
    ├── 日志采集（任务日志上传到 Master）
    └── 资源管理（CPU/内存权重）

  Alert Server（告警服务，独立部署）
    ├── 告警规则引擎
    ├── 告警渠道（邮件/钉钉/飞书/企微/Webhook）
    └── 告警历史管理

  ZooKeeper（协调）
    ├── Master 注册与选主
    ├── Worker 注册与健康检查
    └── 分布式锁（防重复调度）

  数据库（MySQL/PostgreSQL）
    ├── 工作流定义/版本
    ├── 工作流实例/任务实例
    ├── 项目/租户/用户
    └── 告警历史
```

### 8.2 DAG 调度内部实现

```
DAG 调度流程：

  1. 工作流定义解析：
     工作流 JSON/YAML → DAG 拓扑图
     识别入度为 0 的起始节点
     构建依赖关系邻接表

  2. 触发调度：
     定时触发：cron 表达式匹配 → 创建流程实例
     依赖触发：上游工作流完成 → 检查依赖条件
     手动触发：控制台点击运行

  3. 任务就绪判定：
     当前任务的所有上游任务状态均为 SUCCESS
     无跳过/失败停止的上游节点
     → 任务状态：SUBMITTED_SUCCESS

  4. 任务分发：
     Master 从 Worker 注册表中选择目标
     策略：加权轮询 / 随机 / 轮询
     考虑：Worker 资源权重、租户隔离、任务组

  5. 执行与回调：
     Worker 执行任务 → 定期心跳上报
     任务完成 → 回传状态给 Master
     Master 更新任务实例状态 → 触发下游任务

  6. 容错处理：
     Worker 心跳超时（默认 120s）→ 标记 NEED_FAULT_TOLERANCE
     → 其他 Worker 重新执行（幂等保障）
     Master 故障 → 其他 Master 从 DB 恢复调度状态
```

---

## 九、任务类型详解与资源中心

### 9.1 任务类型

| 任务类型 | 说明 | 关键配置 | 适用场景 |
|----------|------|----------|----------|
| **Shell** | 执行 Shell 脚本 | 脚本内容 + 参数 | 系统操作/简单脚本 |
| **SQL** | 执行 SQL 语句 | 数据源 + SQL + 类型 | 数据查询/写入/DML |
| **Spark** | 提交 Spark 任务 | 脚本路径 + 参数 | 大数据 ETL |
| **Flink** | 提交 Flink 任务 | 作业路径 + 参数 | 流处理 |
| **HTTP** | 调用 HTTP 接口 | URL + Method + Params | API 调用/Webhook |
| **MapReduce** | 提交 MR 作业 | JAR 路径 + 参数 | Hadoop 批处理 |
| **Python** | 执行 Python 脚本 | 脚本 + 参数 | 数据分析 |
| **DataX** | 数据同步任务 | 配置 JSON + 参数 | 跨源数据同步 |
| **Procedure** | 存储过程 | 数据源 + 过程名 | 数据库操作 |
| **Pysical** | 物理任务（手动） | 无 | 人工审批节点 |

### 9.2 SQL 任务类型深入

```sql
-- SQL 任务支持的类型：
-- 1. 单次查询（非查询 → 返回结果集）
-- 2. 预编译 SQL（支持参数化）
-- 3. 存储过程（调用 Procedure）

-- 参数化 SQL（全局/局部参数替换）：
--   输入参数：${businessDate}
--   SQL 模板：
SELECT * FROM orders
WHERE dt = '${businessDate}'
  AND status = '${orderStatus}'

-- 数据源配置：
--   支持 MySQL/PostgreSQL/Hive/SparkSQL/ClickHouse
--   连接池配置（最大连接数/超时时间）
--   数据源级别权限隔离
```

### 9.3 资源中心集成

```
资源中心（HDFS/S3/OSS/MinIO）：

  功能：
    文件上传/下载（UDF/脚本/配置文件）
    资源版本管理
    资源权限隔离（项目级/租户级）

  UDF 管理：
    UDF（User Defined Function）上传
    在 SQL 任务中引用：CREATE FUNCTION
    支持 Java UDF / Python UDF

  文件管理：
    脚本文件上传（Shell/Python/SQL）
    任务节点引用资源文件
    版本控制（历史版本可回滚）

  集成配置：
    部署模式下默认 MinIO
    生产环境切换 HDFS/S3/OSS
    配置项：
      resource.storage.type=hdfs
      resource.storage.upload.fs.default_name=hdfs://namenode:8020
```

---

## 十、多租户隔离与项目管理

### 10.1 多租户模型

```
租户（Tenant）→ 项目（Project）→ 工作流（Workflow）→ 任务（Task）

租户隔离：
  操作系统级：每个租户对应一个 Linux 用户
  Worker 执行时切换到对应用户（su - tenant_user）
  文件权限隔离（租户用户只能访问自己的文件）

  配置：
    worker.tenant.auto.create=true   # 自动创建 OS 用户
    worker.tenant.strategy=unix     # 用户隔离策略

项目管理：
  项目 = 工作流的逻辑容器
  项目内工作流互相可见
  跨项目依赖：工作流可以引用其他项目的工作流
  项目权限：管理员/普通成员/只读

  项目权限模型：
    管理员：创建/修改/删除/运行
    开发者：创建/修改/运行
    只读：查看/运行
```

### 10.2 工作流版本管理

```
工作流版本机制：

  每次修改工作流 → 自动创建新版本
  版本记录：
    版本号（自增）
    修改人
    修改时间
    版本快照（DAG 定义 + 任务定义）

  版本操作：
    查看历史版本
    对比版本差异
    回滚到指定版本
    启用/禁用特定版本

  注意事项：
    运行中的实例使用创建时的版本快照
    修改工作流不影响正在运行的实例
    回滚版本后新建实例使用回滚后的版本
```

---

## 十一、任务失败重试策略与告警系统

### 11.1 失败重试策略

```
重试策略配置：

  节点级重试：
    失败重试次数：maxRetryTimes（默认 0，不重试）
    重试间隔：retryInterval（默认 1 分钟）
    重试策略：fixed（固定间隔）/ exponential（指数退避）

  流程级失败策略：
    失败重试：关键节点失败 → 整个流程重试
    失败继续：非关键节点失败 → 跳过继续下游
    失败停止：任何节点失败 → 流程终止
    失败告警：仅告警，不阻断

  配置示例：
    任务节点：
      重试次数：3
      重试间隔：5 分钟
      失败策略：FAIL_END（失败停止）

    工作流：
      调度类型：串行/并行
      失败策略：FAIL_CONTINUE（失败继续）

  重试最佳实践：
    幂等是前提（任务可重复执行不产生脏数据）
    关键链路：重试 2-3 次 + 失败停止 + 告警
    非关键链路：失败继续（不阻塞主流程）
    指数退避：避免重试风暴（1min → 2min → 4min）
```

### 11.2 告警插件系统

```
告警渠道：

  内置渠道：
    邮件（SMTP）
    钉钉（Webhook）
    飞书（Webhook）
    企业微信（Webhook）
    HTTP（自定义 Webhook）

  告警事件：
    工作流实例成功/失败/超时
    任务实例成功/失败/超时
    Master/Worker 故障
    租户资源超限

  告警规则：
    事件触发 → 匹配规则 → 发送告警
    支持告警分组/去重/静默
    告警级别：INFO/WARNING/ERROR/CRITICAL

  自定义告警插件：
    实现 AlertPlugin 接口
    编译为 JAR 放入 alert 插件目录
    配置告警渠道参数

  告警最佳实践：
    分级告警：失败 → 通知开发，超时 → 通知负责人
    告警聚合：同一工作流多次失败合并告警
    静默窗口：避免夜间无意义告警
    告警升级：超过阈值未处理 → 升级通知
```

---

## 十二、DolphinScheduler vs Airflow vs XXL-JOB 深度对比

| 维度 | DolphinScheduler | Airflow | XXL-JOB |
|------|------------------|---------|---------|
| **架构** | Master/Worker/ZK | Scheduler/WebServer/Worker | Admin/Executor |
| **语言** | Java | Python | Java |
| **编排** | 可视化拖拽（零代码） | Python 代码（DAG） | 无 DAG |
| **调度** | 时间触发 + 依赖触发 | 时间触发 + 传感器 | Cron 触发 |
| **任务类型** | 30+ 内置 | Operator（Python 编写） | Java Bean/脚本 |
| **多租户** | 强（OS 级隔离） | 弱（命名空间） | 无 |
| **补数** | 原生（批量日期补跑） | 需扩展 | 部分 |
| **数据质量** | 内置规则引擎 | Great Expectations 集成 | 无 |
| **部署** | 中（ZK + DB） | 重（DB + Redis + K8s） | 轻（DB） |
| **中文生态** | 强（Apache 顶级项目） | 弱 | 强（国内活跃） |
| **社区** | Apache（中英文） | 全球（最活跃） | 国内 |
| **适用** | 数据平台/数仓编排 | 数据工程/MLOps | 业务定时任务 |

### 选型决策矩阵

```
场景 → 选型：
  数据平台/数仓 → DolphinScheduler（可视化 + 任务类型 + 多租户）
  Python 数据工程 → Airflow（代码即编排，灵活最强）
  业务定时任务 → XXL-JOB（轻量，Java 生态）
  MLOps → Airflow（ML Pipeline 生态好）
  多租户强隔离 → DolphinScheduler（OS 级隔离）
  大数据团队 → DolphinScheduler（30+ 大数据任务类型）
  小团队 → XXL-JOB（部署简单，学习成本低）
  混合场景 → DS + XXL-JOB（DS 编排数据管道，XXL-JOB 跑业务任务）
```

---

## 十三、生产部署最佳实践

### 13.1 部署架构

```
生产部署推荐：

  Master Server: 3 节点（奇数，ZK 选主）
  Worker Server: 5+ 节点（按任务量扩展）
  API Server: 2 节点（负载均衡）
  Alert Server: 2 节点（高可用）
  ZooKeeper: 3 节点（奇数）
  数据库: MySQL/PG 主从（半同步复制）

  网络：
    Master/Worker 之间：内网通信
    API Server：可暴露公网（反向代理保护）
    ZK：内网专用

  存储：
    资源中心：HDFS/S3（生产必须）
    日志：本地 + 集中采集（ELK）
    数据库：SSD + 主从备份
```

### 13.2 性能调优

```
Master 调优：
  调度线程数：master调度线程数（默认 1）
  实例数限制：最大工作流实例数
  心跳超时：Worker 超时时间（默认 120s）

Worker 调优：
  并发任务数：maxTaskNum（默认 120）
  线程池：worker.exec.threads（默认 CPU*2）
  资源权重：worker.weight（加权轮询分配）

数据库调优：
  连接池：最大连接数（默认 20）
  慢查询：开启慢查询日志
  索引：工作流实例表加时间索引

  关键监控：
    任务积压数（待执行任务数）
    任务执行耗时（P50/P90/P99）
    Worker CPU/内存使用率
    Master 调度延迟
    数据库连接数
```

### 13.3 常见问题与解决

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 任务提交后无状态变化 | Worker 未注册/资源不足 | 检查 Worker 心跳，调 maxTaskNum |
| 补数任务数据重复 | 任务非幂等 | 任务设计幂等（唯一键/覆盖写） |
| ZK 故障后调度中断 | ZK 是单点依赖 | ZK 集群 3+ 节点，监控 ZK |
| DB 连接池耗尽 | 并发任务过多 | 调大连接池 + 优化慢查询 |
| Worker 负载不均 | 长短任务混跑 | 按任务类型分 Worker 组 |
| 工作流实例爆炸 | 依赖循环/触发错误 | 设置最大实例数 + 超时时间 |
| 告警丢失 | 告警服务故障 | Alert Server 高可用 + 监控 |

---

## 十三-2、Master 任务分配算法

### Round-Robin 轮询

```
原理：按 Worker 注册顺序轮流分配
优点：简单，负载均匀
缺点：不考虑 Worker 资源差异

配置：
  master.resourcePool.worker-group.weight=1  # 权重=1
```

### 资源感知分配

```
原理：根据 Worker 的 CPU/内存权重 + 当前负载分配
优点：资源利用率高
缺点：需要实时采集 Worker 指标

流程：
  1. Worker 心跳上报 CPU/内存/任务数
  2. Master 计算各 Worker 可用资源
  3. 按权重 + 可用资源排序
  4. 选择资源最充足的 Worker

配置：
  master.resourcePool.worker-group.strategy=WEIGHTED_ROUND_ROBIN
```

## 十三-3、Worker 分组与任务隔离

```
Worker 分组 = 按业务或资源特性隔离执行环境

分组策略：
  1. 按任务类型：长任务组（Spark/Flink）+ 短任务组（Shell/SQL）
  2. 按业务线：订单组 + 用户组 + 数据组
  3. 按资源：CPU 密集组 + IO 密集组

隔离效果：
  - 长任务不挤占短任务资源
  - 高优先级任务组抢占低优先级
  - 故障隔离：一组 Worker 故障不影响其他组

配置：
  worker.group=long-tasks
  worker.weight=2  # 该组 Worker 权重
```

## 十三-4、告警插件开发（自定义告警器）

```
告警插件开发步骤：

1. 实现 AlertPlugin 接口
   public class CustomAlertPlugin implements AlertPlugin {
     @Override
     public void sendAlert(AlertMessage message) {
       // 自定义发送逻辑（如飞书/钉钉/Webhook）
       String webhook = message.getWebhook();
       String content = formatMessage(message);
       HttpUtils.post(webhook, content);
     }
   }

2. 编译打包为 JAR

3. 放入告警插件目录
   $DOLPHIN_HOME/lib/alert-plugin/

4. 配置告警渠道
   告警组 → 选择自定义插件
   配置 Webhook URL / Token

5. 告警模板
   支持变量替换：${workflowName}, ${taskName}, ${alertTime}
```

## 十三-5、项目权限模型（租户/项目/工作流三级）

```
三级权限模型：

租户（Tenant）
  ├── 管理员：创建项目/用户/资源
  └── 普通成员：只能访问所属项目

项目（Project）
  ├── 管理员：创建/修改/删除工作流
  ├── 开发者：创建/修改/运行工作流
  └── 只读：查看/运行工作流

工作流（Workflow）
  ├── 所有者：完全控制
  └── 协作者：编辑/运行

权限继承：
  租户管理员 → 项目管理员 → 工作流所有者

数据隔离：
  不同租户的项目/工作流/任务完全隔离
  不同项目的工作流互相不可见（除非显式授权）
```

## 十三-6、任务实例日志实时查看实现

```
实时日志查看架构：

1. Worker 执行任务时 → 实时写日志到本地文件
2. Master 日志采集线程 → 定期读取 Worker 日志文件
3. WebSocket 推送 → UI 实时展示日志流

实现细节：
  - 日志文件滚动：按大小/时间滚动
  - 日志格式：时间戳 + 级别 + 内容
  - 推送机制：WebSocket 长连接
  - 日志缓存：内存缓冲 + 异步写入

配置：
  worker.log.max-size=100MB
  worker.log.retention-days=7
  log.server.port=1234  # 日志服务端口
```

## 十三-7、与 Airflow 调度能力对比总结

| 维度 | DolphinScheduler | Airflow |
|------|------------------|---------|
| 编排 | 可视化拖拽（零代码） | Python 代码（DAG） |
| 调度 | 时间触发 + 依赖触发 | 时间触发 + Sensor |
| 任务类型 | 30+ 内置 | Operator（Python 编写） |
| 多租户 | 强（OS 级隔离） | 弱（命名空间） |
| 补数 | 原生（批量日期补跑） | 需扩展 |
| 数据质量 | 内置规则引擎 | Great Expectations |
| 部署 | 中（ZK + DB） | 重（DB + Redis + K8s） |
| 社区 | Apache（中英文） | 全球（最活跃） |
| 适用 | 数据平台/数仓编排 | 数据工程/MLOps |

选型建议：
  可视化 + 任务类型丰富 → DolphinScheduler
  代码即编排 + 灵活最强 → Airflow
  混合场景 → DS 编排数据管道，Airflow 做 ML Pipeline

## 十四、Master 任务分配算法

```
Master 任务分配流程：

  1. 任务提交：
    用户提交工作流 → Master 接收 → 解析 DAG 依赖
    → 生成任务实例（TaskInstance）

  2. 任务分配：
    Master 按 Worker 负载分配任务
    算法：Round Robin / Least Load / Resource Aware

  3. 任务执行：
    Worker 接收任务 → 创建线程池执行
    → 上报状态（Running/Success/Failed）
    → Master 更新任务状态

  4. 失败重试：
    任务失败 → Master 检查重试次数
    → 未超限 → 重新分配到其他 Worker
    → 超限 → 标记失败 → 触发告警

  关键配置：
    master.task.dispatch.strategy=round-robin  # 分配策略
    master.task.retry.max=3  # 最大重试次数
    master.task.timeout=600  # 任务超时（秒）
```

## 十五、Worker 分组任务隔离

```
Worker 分组隔离：

  场景：
    不同业务线使用不同 Worker 组
    大数据任务和实时任务隔离
    测试和生产环境隔离

  配置：
    Worker 启动时指定分组：
    --worker.group=data-pipeline

  任务路由：
    任务提交时指定 Worker 分组：
    workerGroup=data-pipeline

  隔离效果：
    1. 资源隔离：不同分组 Worker 资源独立
    2. 故障隔离：一个分组故障不影响其他分组
    3. 权限隔离：不同分组不同权限

  配置示例：
    worker.groups=data-pipeline,realtime,test
    worker.group=data-pipeline  # 当前 Worker 分组
```

## 十六、自定义告警插件

```java
// 自定义告警插件（飞书通知）
public class FeishuAlertPlugin implements AlertPlugin {
    @Override
    public void send(AlertInfo alertInfo) {
        String webhook = alertInfo.getWebhook();
        String title = alertInfo.getTitle();
        String content = alertInfo.getContent();

        // 构造飞书消息
        Map<String, Object> body = new HashMap<>();
        body.put("msg_type", "interactive");
        body.put("card", Map.of(
            "header", Map.of("title", Map.of("tag", "plain_text", "content", title)),
            "elements", List.of(
                Map.of("tag", "div", "text", Map.of("tag", "lark_md", "content", content))
            )
        ));

        // 发送请求
        HttpUtil.post(webhook, JSONUtil.toJsonStr(body));
    }
}
```

```yaml
# 告警插件配置
alert.plugin.type=feishu
alert.plugin.feishu.webhook=https://open.feishu.cn/open-apis/bot/v2/hook/xxx
alert.plugin.feishu.secret=your_secret
```

## 十七、任务依赖关系详解

```
任务依赖类型：

  1. 依赖上游任务：
    A → B → C（串行）
    A → B, A → C（并行）

  2. 依赖上游工作流：
    Workflow-A → Workflow-B（跨工作流依赖）

  3. 依赖时间：
    定时触发（cron 表达式）

  4. 依赖数据：
    数据到达触发（文件/表/消息）

  依赖配置：
    1. 依赖上游任务：前置任务完成
    2. 依赖上游工作流：前置工作流完成
    3. 依赖时间：定时触发
    4. 依赖数据：数据到达触发
```

```yaml
# 任务依赖配置
task:
  name: etl_task
  dependencies:
    - type: upstream_task
      task_id: 12345
    - type: upstream_workflow
      workflow_id: 67890
    - type: schedule
      cron: "0 2 * * *"
    - type: data
      path: "/data/input/*.csv"
```

## 十八、生产 HA 部署架构

```
DolphinScheduler 生产 HA 架构：

  Master 集群（3 节点）：
    Master-1 ←→ Master-2 ←→ Master-3
    ↕ 选主（ZK）
    任务分配 + 状态管理

  Worker 集群（N 节点）：
    Worker-1, Worker-2, ..., Worker-N
    任务执行 + 状态上报

  ZooKeeper 集群（3 节点）：
    ZK-1 ←→ ZK-2 ←→ ZK-3
    选主 + 配置管理

  MySQL 集群（主从）：
    MySQL-Master ←→ MySQL-Slave
    元数据存储

  Redis 集群：
    缓存 + 分布式锁

  关键配置：
    master.master数量=3
    worker.worker数量=5
    zk.connect.string=zk1:2181,zk2:2181,zk3:2181
    database.type=mysql
    database.url=jdbc:mysql://mysql:3306/dolphinscheduler
```

---

## master 任务分配算法

### round-robin / 资源感知 / 故障转移

```text
任务分配策略：

1. Round-Robin（轮询）
   - 按顺序分配任务到 Worker
   - 简单公平
   - 不考虑资源负载

2. 资源感知（Resource-Aware）
   - 根据 Worker 资源使用情况分配
   - CPU/内存/磁盘 权重
   - 避免资源过载

3. 故障转移（Failover）
   - 检测 Worker 故障
   - 自动重新分配任务
   - 支持任务重试
```

```yaml
# 任务分配配置
# master.properties
master.task.assign.strategy=resource_aware
master.resource.audit.log.enable=true

# Worker 资源配置
worker.resource.cpu.usage.max=0.8
worker.resource.memory.usage.max=0.8
worker.resource.disk.usage.max=0.9
```

```java
// 任务分配算法实现
public class ResourceAwareStrategy implements TaskAssignStrategy {
    @Override
    public Worker selectWorker(List<Worker> workers, Task task) {
        return workers.stream()
            .filter(w -> w.getCpuUsage() < 0.8)
            .filter(w -> w.getMemoryUsage() < 0.8)
            .filter(w -> w.getDiskUsage() < 0.9)
            .min(Comparator.comparingDouble(Worker::getTotalUsage))
            .orElseThrow(() -> new NoAvailableWorkerException());
    }
}
```

## worker 分组与任务隔离

### 租户→项目→工作流→任务四级

```text
隔离层级：
  租户（Tenant）：资源隔离
    └── 项目（Project）：权限隔离
        └── 工作流（Workflow）：调度隔离
            └── 任务（Task）：执行隔离

资源隔离：
  - 租户级别：CPU/内存配额
  - 项目级别：Worker 分组
  - 工作流级别：优先级
  - 任务级别：超时控制
```

```yaml
# Worker 分组配置
# worker.properties
worker.groups=group1,group2,group3

# 任务指定 Worker 分组
# 任务属性
worker.group=group1

# 租户资源配额
tenant.resource.quota:
  cpu: 8核
  memory: 16GB
  disk: 100GB
```

## 自定义告警插件开发

### 实现 AlertPlugin 接口

```java
// 自定义告警插件
public class DingTalkAlertPlugin implements AlertPlugin {
    @Override
    public String getName() {
        return "DingTalk";
    }

    @Override
    public List<String> getParams() {
        return Arrays.asList("webhook", "secret");
    }

    @Override
    public AlertResult send(Map<String, String> params, String content) {
        String webhook = params.get("webhook");
        String secret = params.get("secret");

        // 构建钉钉消息
        DingTalkMessage message = new DingTalkMessage();
        message.setText(content);
        message.setAtAll(true);

        // 发送请求
        HttpResponse response = HttpRequest.post(webhook)
            .header("Content-Type", "application/json")
            .body(JSON.toJSONString(message))
            .execute();

        return new AlertResult(response.isSuccessful());
    }
}

// 注册插件
@AlertPlugin(name = "DingTalk")
public class DingTalkAlertPlugin implements AlertPlugin { ... }
```

## 任务依赖关系

### workflow vs task 级别依赖

```text
依赖类型：
  1. 工作流依赖（Workflow Dependency）
     - 整个工作流完成后触发下一个
     - 粗粒度
  
  2. 任务依赖（Task Dependency）
     - 具体任务完成后触发下一个
     - 细粒度

依赖配置：
  - 上游任务完成 → 下游任务开始
  - 上游任务成功 → 下游任务开始
  - 上游任务失败 → 下游任务跳过/重试
```

```yaml
# 工作流依赖
workflow:
  name: daily_etl
  tasks:
    - name: extract
      type: shell
      command: "python extract.py"
    - name: transform
      type: shell
      command: "python transform.py"
      dependencies: ["extract"]
    - name: load
      type: shell
      command: "python load.py"
      dependencies: ["transform"]

# 任务依赖（跨工作流）
task:
  name: notify
  dependencies:
    - workflow: daily_etl
      task: load
      state: success
```

## DS vs Airflow 核心差异对比

### 架构/调度/API/DAG定义

| 维度 | DolphinScheduler | Airflow |
|------|------------------|---------|
| 架构 | Master-Worker（中心化） | Scheduler-Worker（分布式） |
| 调度 | 支持多种调度器 | 原生调度器 |
| API | REST API | REST API + CLI |
| DAG 定义 | 可视化 + YAML | Python 脚本 |
| 任务类型 | 丰富（100+） | 丰富（100+） |
| 监控 | 内置 UI | 内置 UI |
| 运维 | 简单（K8s） | 复杂（需运维） |
| 适用场景 | 大数据调度 | 通用调度 |

```text
选择建议：
  - 大数据场景 → DolphinScheduler
  - 通用调度 → Airflow
  - K8s 部署 → DolphinScheduler
  - Python 生态 → Airflow
  - 运维简单 → DolphinScheduler
```

## 生产 HA 部署架构

### master HA + worker 多实例 + ZK 锁

```yaml
# 生产环境部署
version: '3'
services:
  master-1:
    image: apache/dolphinscheduler:3.2.0
    container_name: ds-master-1
    environment:
      - MASTER_HOST=master-1
      - ZK_SERVERS=zk1:2181,zk2:2181,zk3:2181
    volumes:
      - ./conf/master.properties:/opt/dolphinscheduler/conf/master.properties

  master-2:
    image: apache/dolphinscheduler:3.2.0
    container_name: ds-master-2
    environment:
      - MASTER_HOST=master-2
      - ZK_SERVERS=zk1:2181,zk2:2181,zk3:2181

  worker-1:
    image: apache/dolphinscheduler:3.2.0
    container_name: ds-worker-1
    environment:
      - WORKER_HOST=worker-1
      - WORKER_GROUP=group1
      - ZK_SERVERS=zk1:2181,zk2:2181,zk3:2181

  worker-2:
    image: apache/dolphinscheduler:3.2.0
    container_name: ds-worker-2
    environment:
      - WORKER_HOST=worker-2
      - WORKER_GROUP=group2
      - ZK_SERVERS=zk1:2181,zk2:2181,zk3:2181
```

```text
HA 架构要点：
  - Master HA：ZK 选主，自动故障转移
  - Worker HA：多实例，任务自动重试
  - ZK 锁：分布式锁，防止任务重复执行
  - 元数据：MySQL 主从
  - 缓存：Redis 集群
```

## 十九、DolphinScheduler 监控指标与运维

### 19.1 核心监控指标

| 指标类别 | 指标名称 | 告警阈值 | 说明 |
|----------|----------|----------|------|
| 调度性能 | 调度延迟 | > 5s | Master 调度耗时 |
| 任务执行 | 任务失败率 | > 5% | 单次执行失败比例 |
| Worker | CPU 使用率 | > 80% | Worker 节点负载 |
| Worker | 内存使用率 | > 85% | Worker 节点内存 |
| ZK 连接 | ZK 延迟 | > 1s | ZK 集群响应时间 |
| 数据库 | 连接池使用率 | > 80% | MySQL 连接池 |

### 19.2 任务执行流程与日志分析

```
任务执行完整流程：
  Master 接收调度请求
    → 选择可用 Worker（负载均衡）
    → 发送任务到 Worker（Netty RPC）
    → Worker 接收任务
    → 创建子进程执行（Shell/Python/Java）
    → 实时上报任务状态
    → Master 更新任务实例状态
    → 任务完成 → 触发下游任务

  日志位置：
    ${DS_HOME}/logs/master/   → Master 日志
    ${DS_HOME}/logs/worker/   → Worker 日志
    ${DS_HOME}/logs/task/     → 任务执行日志
    任务实例详情页 → 可直接查看日志
```

### 19.3 任务失败重试与补数机制

| 策略 | 配置方式 | 说明 |
|------|----------|------|
| 自动重试 | maxRetryTimes + retryInterval | 失败后自动重试 |
| 手动重试 | 任务实例页面「重试」按钮 | 运维手动触发 |
| 补数（补数据） | 选择历史日期重新执行 | 调度历史日期任务 |
| 超时控制 | timeout | 超时自动 Kill + 失败 |
| 依赖缺失 | 依赖检查 | 上游未完成 → 等待 |

### 19.4 任务依赖关系可视化

| 依赖类型 | 配置方式 | 使用场景 |
|----------|----------|----------|
| 前置任务 | 任务节点连线 | 同工作流内任务顺序 |
| 子工作流 | SubProcess 任务 | 嵌套工作流 |
| 跨工作流依赖 | 依赖检查 | 工作流间前置条件 |
| 数据依赖 | 数据源检测 | 表级依赖检查 |

### 19.5 DolphinScheduler 安全与权限

```
安全体系架构：
  用户管理 → 多级用户（管理员/普通用户）
  项目管理 → 项目隔离（每个项目独立权限）
  资源管理 → 上传/下载/删除文件资源
  数据源管理 → 多数据源连接配置
  权限控制 → 项目级、工作流级、实例级
  审计日志 → 所有操作可追溯
```

### 19.6 与其他板块的关系

- 定时任务对比见「[分布式任务调度对比](./分布式任务调度对比.md)」；
- XXL-JOB 深度篇见「[任务调度 XXL-JOB](./任务调度XXL-JOB.md)」；
- 大数据技术体系见「[大数据/README](../大数据/README.md)」；
- 数据同步任务（DataX）见「[大数据/03-数据采集与同步](../大数据/03-数据采集与同步.md)」；
- 云上调度服务见「[云上中间件体系总览](./云上中间件体系总览.md)」。

> 一句话：**DolphinScheduler = 可视化 DAG 编排 + Master/Worker 分布式调度 + ZK 高可用 + 30+ 任务类型 + 多租户——数据平台编排首选；选型先看「编排形态（可视化→DS，Python 代码→Airflow）」，再定「容错（重试/告警/补数幂等）」，最后配「租户隔离 + Worker 分组 + 监控告警」**。

## 二十、DolphinScheduler 高级调度特性

### 20.1 任务优先级与队列

```
任务优先级队列：
  高优先级（HIGH）：紧急任务
  中优先级（MEDIUM）：常规任务
  低优先级（LOW）：批量任务

  队列配置：
    Master 队列：接收调度请求
    Worker 队列：执行任务

  优先级调度：
    高优先级任务优先执行
    同优先级按提交时间
    支持任务抢占
```

### 20.2 任务依赖与数据血缘

| 依赖类型 | 配置方式 | 应用场景 |
|----------|----------|----------|
| 任务依赖 | 任务节点连线 | 同工作流内任务顺序 |
| 数据依赖 | 数据源检测 | 表级依赖检查 |
| 时间依赖 | 时间触发器 | 定时任务依赖 |
| 外部依赖 | API 回调 | 外部系统触发 |

### 20.3 资源管理与隔离

```
资源管理架构：
  资源中心：统一管理文件资源
    → 脚本文件（Shell/Python/SQL）
    → JAR 包
    → 配置文件

  资源隔离：
    租户隔离：每个租户独立资源空间
    项目隔离：每个项目独立资源目录
    Worker 分组：任务按分组路由

  资源上传：
    Web 界面上传
    API 上传
    HDFS/OSS 上传
```

### 20.4 多租户最佳实践

| 实践 | 说明 | 收益 |
|------|------|------|
| 租户配额 | 限制 CPU/内存使用 | 资源隔离 |
| 租户队列 | 任务按优先级排队 | 公平调度 |
| 租户权限 | 项目级权限控制 | 安全隔离 |
| 租户监控 | 独立监控指标 | 问题定位 |

## 二十一、DolphinScheduler 与 Airflow 深度对比

### 架构/调度/API/DAG定义

| 维度 | DolphinScheduler | Airflow |
|------|------------------|---------|
| 架构 | Master-Worker（中心化） | Scheduler-Worker（分布式） |
| 调度 | 支持多种调度器 | 原生调度器 |
| API | REST API | REST API + CLI |
| DAG 定义 | 可视化 + YAML | Python 脚本 |
| 任务类型 | 丰富（100+） | 丰富（100+） |
| 监控 | 内置 UI | 内置 UI |
| 运维 | 简单（K8s） | 复杂（需运维） |
| 适用场景 | 大数据调度 | 通用调度 |

```text
选择建议：
  - 大数据场景 → DolphinScheduler
  - 通用调度 → Airflow
  - K8s 部署 → DolphinScheduler
  - Python 生态 → Airflow
  - 运维简单 → DolphinScheduler
```

### 调度能力对比

| 能力 | DolphinScheduler | Airflow |
|------|------------------|---------|
| 定时调度 | cron + 日历 | cron + 传感器 |
| 依赖调度 | 可视化连线 | 代码定义 |
| 补数 | 原生批量补跑 | 需扩展 |
| 数据质量 | 内置规则引擎 | Great Expectations |
| 多租户 | 强（OS 级隔离） | 弱（命名空间） |
| 社区 | Apache（中英文） | 全球（最活跃） |

### 选型决策矩阵

```text
场景 → 选型：
  数据平台/数仓 → DolphinScheduler（可视化 + 任务类型 + 多租户）
  Python 数据工程 → Airflow（代码即编排，灵活最强）
  业务定时任务 → XXL-JOB（轻量，Java 生态）
  MLOps → Airflow（ML Pipeline 生态好）
  多租户强隔离 → DolphinScheduler（OS 级隔离）
  大数据团队 → DolphinScheduler（30+ 大数据任务类型）
  小团队 → XXL-JOB（部署简单，学习成本低）
  混合场景 → DS + XXL-JOB（DS 编排数据管道，XXL-JOB 跑业务任务）
```

## 二十二、DolphinScheduler 安全与权限

### 安全体系架构

```
安全体系架构：
  用户管理 → 多级用户（管理员/普通用户）
  项目管理 → 项目隔离（每个项目独立权限）
  资源管理 → 上传/下载/删除文件资源
  数据源管理 → 多数据源连接配置
  权限控制 → 项目级、工作流级、实例级
  审计日志 → 所有操作可追溯
```

### 权限模型

```
三级权限模型：

租户（Tenant）
  ├── 管理员：创建项目/用户/资源
  └── 普通成员：只能访问所属项目

项目（Project）
  ├── 管理员：创建/修改/删除工作流
  ├── 开发者：创建/修改/运行工作流
  └── 只读：查看/运行工作流

工作流（Workflow）
  ├── 所有者：完全控制
  └── 协作者：编辑/运行

权限继承：
  租户管理员 → 项目管理员 → 工作流所有者

数据隔离：
  不同租户的项目/工作流/任务完全隔离
  不同项目的工作流互相不可见（除非显式授权）
```

### 资源管理与隔离

```
资源管理架构：
  资源中心：统一管理文件资源
    → 脚本文件（Shell/Python/SQL）
    → JAR 包
    → 配置文件

  资源隔离：
    租户隔离：每个租户独立资源空间
    项目隔离：每个项目独立资源目录
    Worker 分组：任务按分组路由

  资源上传：
    Web 界面上传
    API 上传
    HDFS/OSS 上传
```

### 多租户最佳实践

| 实践 | 说明 | 收益 |
|------|------|------|
| 租户配额 | 限制 CPU/内存使用 | 资源隔离 |
| 租户队列 | 任务按优先级排队 | 公平调度 |
| 租户权限 | 项目级权限控制 | 安全隔离 |
| 租户监控 | 独立监控指标 | 问题定位 |

## 二十三、DolphinScheduler 性能优化

### 21.1 Master 调度优化

```
Master 调度优化：
  1. 调度线程池
     → 增加调度线程数
     → 减少调度延迟

  2. 任务队列优化
     → 使用有界队列
     → 防止内存溢出

  3. 数据库优化
     → 索引优化
     → 查询优化

  4. 缓存优化
     → 任务定义缓存
     → 工作流定义缓存
```

### 21.2 Worker 执行优化

| 优化项 | 配置方式 | 效果 |
|--------|----------|------|
| 线程池大小 | worker.exec.threads | 提升并发 |
| 任务超时 | task.timeout | 防止阻塞 |
| 日志清理 | log.retention.days | 控制存储 |
| 资源限制 | worker.resource.limits | 防止过载 |

### 21.3 数据库性能调优

```
数据库调优：
  1. 连接池优化
     → HikariCP 配置
     → 连接数调整

  2. 索引优化
     → 建立合适索引
     → 定期分析表

  3. 查询优化
     → 避免全表扫描
     → 使用分页查询

  4. 慢查询日志
     → 开启慢查询日志
     → 定期分析
```

## 二十二、DolphinScheduler 故障恢复

### 22.1 Master 故障转移

```
Master 故障转移流程：
  1. ZK 检测 Master 失联
  2. 其他 Master 接管
  3. 重新调度未完成任务
  4. 更新工作流状态

  关键配置：
    master.heartbeat.interval=30s
    master.max.heartbeat.interval=60s
```

### 22.2 Worker 故障转移

```
Worker 故障转移流程：
  1. ZK 检测 Worker 失联
  2. Master 重新分配任务
  3. 新 Worker 接管任务
  4. 任务从检查点恢复

  任务恢复策略：
    从头执行：RESTART
    从检查点：FAILOVER
    跳过：SKIP
```