# Trino（Presto）联邦查询引擎（深入）

> Trino（原 PrestoSQL）是**多源联邦 SQL 查询引擎**：一条 SQL 同时查 MySQL + Hive + Kafka + 对象存储 + 云数仓。本篇深入拆解：Connector SPI、调度模型、性能调优、生产部署、与 Iceberg/Hudi 集成。

---

## 一、解决的问题与定位

**解决的问题**：
1. 数据分散在多个系统，分析要搬数据、建管道，周期长；
2. Hive/Spark 查询重、分钟级，交互式分析需要秒级；
3. 数据湖缺一个「直接 SQL 查询」的引擎。

**定位一句话**：**「不存数据、只算数据」的分布式 SQL 引擎——连接器（Connector）模式对接 N 种数据源，SQL 下推与跨源 Join。**

---

## 二、核心原理

### 2.1 Coordinator + Worker 架构

```
Coordinator: 解析 SQL → 生成分布式执行计划 → 调度给 Worker
Worker 并行执行 Task；数据按分区(partition)分片

Coordinator: 无状态（可多活），只做解析/优化/调度
Worker: 执行计算，可无限水平扩展（加 Worker = 加并发）
无状态 + 弹性: 查询结束即释放，不存用户数据
```

### 2.2 查询执行流程

```
SQL → Parser → Analyzer → Optimizer → LogicalPlan → PhysicalPlan
  → Stage 分解（Coordinator/Worker 多级 Stage）
  → Task 分发到 Worker
  → Worker 读取数据（通过 Connector）
  → 执行 Filter/Join/Aggregation
  → 结果返回 Coordinator → 返回客户端

Stage 类型：
  CoordinatorOnly: 只在 Coordinator 执行（如展示结果）
  Source: 从 Connector 读数据
  Fixed: 在 Worker 上执行计算
  Single: 在 Coordinator 上汇聚结果
```

### 2.3 连接器（Connector）体系

| 连接器 | 数据源 | 关键点 |
|--------|--------|--------|
| Hive/Iceberg/Delta Lake | 数据湖表格式 | 元数据从 HMS/Catalog 读，数据扫对象存储 |
| JDBC 类 | MySQL/PG/Doris/ClickHouse… | 谓词下推减少传输 |
| Kafka | 实时流 | 可当实时表查（低延迟小批） |
| 对象存储+File | S3/OSS 上 JSON/CSV/Parquet | 无目录表也行（Raw Query） |
| 云数仓 | Redshift/BigQuery/Snowflake | 跨云联邦 |
| Elasticsearch | 搜索索引 | 全文检索 + 聚合 |
| Redis | KV 存储 | 简单查询 |

### 2.4 Connector SPI 开发

```java
// 自定义 Connector 需要实现的接口
public interface Connector {
    ConnectorMetadata getMetadata();
    ConnectorFactory getConnectorFactory();
    ConnectorSplitManager getSplitManager();
    ConnectorPageSourceProvider getPageSourceProvider();
    ConnectorPageSinkProvider getPageSinkProvider();
}

// 元数据接口
public interface ConnectorMetadata {
    List<String> listSchemaNames();
    List<String> listTables(ConnectorSession session, String schemaName);
    ConnectorTableHandle getTableHandle(ConnectorSession session, SchemaTableName tableName);
    ConnectorTableMetadata getTableMetadata(ConnectorSession session, ConnectorTableHandle tableHandle);
}

// Split 管理（数据分片）
public interface ConnectorSplitManager {
    ConnectorSplitSource getSplits(ConnectorSession session, ConnectorTableHandle table, DynamicFilter dynamicFilter);
}
```

---

## 三、下推与优化

### 3.1 谓词下推

```sql
-- 原始查询
SELECT * FROM mysql.users u JOIN hive.orders o ON u.id = o.user_id
WHERE u.age > 25 AND o.amount > 100;

-- Trino 优化后：
-- MySQL 端：WHERE age > 25（只拉符合条件的用户）
-- Hive 端：WHERE amount > 100（只拉符合条件的订单）
-- 内存中：Join 两小结果集

-- 验证下推：EXPLAIN 输出看 ConnectorScanNode 的过滤条件
EXPLAIN SELECT * FROM mysql.users WHERE age > 25;
-- 输出中应包含 "FilterExpression: (age > 25)" 在 ConnectorScanNode 中
```

### 3.2 关键优化

| 优化 | 说明 |
|------|------|
| 谓词下推 | WHERE/HAVING 条件压到源端执行 |
| 列裁剪 | 只读查询需要的列（对象存储按列切片） |
| 分区裁剪 | 只读匹配分区的数据 |
| Join 优化 | 小表广播（Broadcast）、大表分区分发 |
| 字段裁剪 | 只读需要的字段（减少 IO） |
| 聚合下推 | 源端预聚合（减少传输量） |
| 时间旅行 | Iceberg 表的快照查询 |

---

## 四、性能调优

### 4.1 Worker 资源配置

```properties
# worker 节点配置
query.max-memory=50GB           # 单查询最大内存
query.max-memory-per-node=8GB   # 单节点单查询最大内存
query.max-total-memory-per-node=10GB  # 单节点总内存限制
query.max-run-time=1h           # 单查询最大执行时间
query.queue-config-file=queue.json  # 资源队列配置
```

### 4.2 资源队列

```json
{
  "queues": {
    "root": {
      "maxQueued": 100,
      "maxRunning": 50,
      "schedulingPolicy": "fair",
      "subqueues": {
        "interactive": {
          "maxQueued": 50,
          "maxRunning": 30,
          "schedulingPolicy": "weighted",
          "subqueues": {
            "team_a": { "maxQueued": 20, "maxRunning": 10, "weight": 1 },
            "team_b": { "maxQueued": 20, "maxRunning": 10, "weight": 2 }
          }
        },
        "batch": {
          "maxQueued": 50,
          "maxRunning": 20
        }
      }
    }
  }
}
```

### 4.3 常见性能问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 跨源 Join 慢 | 数据没下推，全量拉取 | EXPLAIN 检查下推情况 |
| 内存溢出 | 单查询内存太大 | 调 query.max-memory |
| 数据倾斜 | 某个 partition 数据量特别多 | 调整分区策略 / Salting |
| 元数据慢 | Hive Metastore 响应慢 | 缓存元数据 / 用 Iceberg |
| Worker OOM | 并发查询太多 | 资源队列 + 调并发限制 |

---

## 五、与 Iceberg 集成

### 5.1 Iceberg 表配置

```sql
-- 创建 Iceberg 表
CREATE TABLE iceberg.mydb.users (
    id BIGINT,
    name VARCHAR,
    age INT
) WITH (
    format = 'ORC',
    partitioning = ARRAY['age'],
    location = 's3://my-bucket/iceberg/mydb/users'
);

-- 时间旅行查询
SELECT * FROM iceberg.mydb.users FOR TIMESTAMP AS OF TIMESTAMP '2024-01-01 00:00:00';
SELECT * FROM iceberg.mydb.users FOR VERSION AS OF 12345;

-- Schema 演进
ALTER TABLE iceberg.mydb.users ADD COLUMN email VARCHAR;
```

### 5.2 Iceberg + Trino 优势

| 特性 | 说明 |
|------|------|
| 列统计 | 自动收集列统计信息优化查询 |
| 分区裁剪 | 按分区过滤，只读需要的数据 |
| 时间旅行 | 查询历史快照 |
| Schema 演进 | 安全地添加/删除列 |
| ACID 事务 | 并发写入安全 |
| 小文件合并 | 自动合并小文件 |

---

## 六、生产部署

### 6.1 部署模式

```
独立部署（Self-Hosted）：
  - Coordinator × 2（高可用）
  - Worker × N（按需扩缩）
  - 依赖：Metastore（HMS）+ 对象存储

云托管：
  - AWS EMR Trino
  - Google Cloud Dataproc Trino
  - Starburst Galaxy
  - Allen AI Trino

K8s 部署：
  - trino-kubernetes-operator
  - Helm Chart
```

### 6.2 生产检查清单

| 项目 | 建议 |
|------|------|
| Coordinator HA | 2 个 Coordinator + 负载均衡 |
| Worker 数量 | 按并发查询数 × 单查询资源需求 |
| 内存规划 | 每 Worker 16~64GB，JVM 堆占 70% |
| 网络 | Worker 间 10Gbps+（shuffle 吃带宽） |
| 元数据缓存 | HMS 缓存 / Iceberg 元数据缓存 |
| 监控 | JMX Exporter + Prometheus + Grafana |
| 日志 | 结构化日志 + 集中采集 |

---

## 七、与其他引擎对比

| 引擎 | 定位 | 存储 | 延迟 | 适用 |
|------|------|------|------|------|
| **Trino** | 联邦查询 | 不存数据 | 秒级 | 联邦/BI/Ad-hoc |
| **Spark** | 批处理 | 不存数据 | 分钟~小时 | ETL/ML |
| **Hive** | 离线数仓 | HDFS | 分钟~小时 | 离线分析 |
| **ClickHouse** | OLAP | 自存储 | 毫秒~秒 | 实时分析 |
| **Doris** | OLAP | 自存储 | 毫秒~秒 | 实时分析 |
| **PrestoDB** | 联邦查询 | 不存数据 | 秒级 | Facebook 生态 |

---

## 八、速查表

| 主题 | 一句话 |
|------|--------|
| 定位 | 无状态多源联邦 SQL 引擎，不存数据只算 |
| 架构 | Coordinator + 无状态 Worker，弹性扩展 |
| 连接器 | Hive/Iceberg/JDBC/Kafka/ES/对象存储全对接 |
| 关键优化 | 谓词下推 + 列裁剪 + 分区裁剪 + 内存 Join |
| 对比 | 查得快→Trino；ETL→Spark；要存数据→CK/Doris |
| 典型组合 | Iceberg 湖 + Trino 查询层；CK 热数据 + Trino 联邦 |

---

## 九、Trino 架构深入与查询优化

### 9.1 Coordinator + Worker 架构详解

```
Trino 集群架构：

  Coordinator（协调节点，可多实例）：
    ├── SQL 解析器（ANTLR 语法解析）
    ├── 查询分析器（语义分析/类型检查）
    ├── 查询优化器（规则优化 + 成本优化）
    ├── Stage 调度器（分解 Stage → 分发 Task）
    ├── 结果聚合（合并 Worker 结果）
    └── REST API（客户端通信）

  Worker（工作节点，可水平扩展）：
    ├── Task 执行器（Pipeline 执行模型）
    ├── 页面源（PageSource → 从 Connector 读数据）
    ├── 页面 Sink（PageSink → 写数据到 Connector）
    ├── 内存管理器（查询级内存限制）
    └── 任务管理器（Task 生命周期管理）

  存储层（不存储数据）：
    ├── Connector SPI（连接器接口）
    ├── 元数据缓存（表/列/分区信息）
    └── 数据源对接（MySQL/Hive/S3/ES...）

  通信机制：
    Coordinator ↔ Worker: REST API（HTTP/HTTPS）
    Worker ↔ Worker: 数据 Shuffle（Exchange）
    所有节点: 基于 HTTP/2 的高效通信
```

### 9.2 查询解析与优化

```
Trino 查询处理流程：

  SQL 字符串
  → Parser（ANTLR 语法树）
  → Analyzer（语义分析/类型推断/权限检查）
  → Logical Plan（逻辑计划）
  → Optimizer（规则优化 + 成本优化）
  → Physical Plan（物理计划）
  → Stage 分解（Coordinator/Source/Fixed/Single）
  → Task 生成（分布式执行单元）
  → Task 分发到 Worker
  → Pipeline 执行（读→处理→写）
  → 结果返回 Coordinator → 客户端

关键优化器规则：
  1. 谓词下推（Predicate Pushdown）：WHERE 条件推到 Connector
  2. 列裁剪（Column Pruning）：只读需要的列
  3. 分区裁剪（Partition Pruning）：只读匹配分区
  4. 聚合下推（Aggregation Pushdown）：源端预聚合
  5. Join 重排序（Join Reordering）：按成本选择最优 Join 顺序
  6. 子查询合并（Subquery Merging）：减少重复扫描
  7. 常量折叠（Constant Folding）：编译期计算常量表达式
```

### 9.3 动态过滤（Dynamic Filtering）

```
动态过滤 = Join 时从大表提取过滤条件，应用到小表扫描

示例：
  SELECT * FROM orders o
  JOIN users u ON o.user_id = u.id
  WHERE o.order_date > '2024-01-01';

  传统执行：
    orders 扫描全量 → Join → 过滤
    users 扫描全量 → Join → 过滤

  动态过滤执行：
    阶段 1：扫描 orders（过滤 order_date > 2024-01-01）
           → 提取 user_id 集合 {101, 102, 103, ...}
    阶段 2：将 user_id 集合推送到 users Connector
           → users 只扫描 id IN (101, 102, 103, ...)
           → 大幅减少 users 扫描量

  配置：
    optimizer.dynamic-filtering=true（默认开启）
    dynamic-filtering-max-domain-combinations=1000
    dynamic-filtering-pushdown-filter-factor=10
```

### 9.4 字典聚合（Dictionary Aggregation）

```
字典聚合 = 用字典编码优化 GROUP BY

原理：
  低基数列（如 status, region）GROUP BY 时
  传统：逐行比较字符串 → CPU 开销大
  字典聚合：将字符串映射为整数 → 整数 GROUP BY → 极快

  适用条件：
    列的唯一值数量有限（< 几千）
    GROUP BY 列是低基数列

  配置：
    dictionary-aggregation=true（默认开启）

  验证：
    EXPLAIN 输出中看到 "DictionaryAggregation" 节点
    表示字典聚合已生效
```

---

## 十、Trino Connector SPI 深入

### 10.1 Connector 核心接口

```java
// Connector 实现核心接口
public interface Connector {
    // 元数据管理
    ConnectorMetadata getMetadata();

    // Split 管理（数据分片）
    ConnectorSplitManager getSplitManager();

    // 数据读取
    ConnectorPageSourceProvider getPageSourceProvider();

    // 数据写入（可选）
    ConnectorPageSinkProvider getPageSinkProvider();

    // 事务管理（可选）
    ConnectorTransactionHandle beginTransaction();
}

// 元数据接口（实现表/列信息查询）
public interface ConnectorMetadata {
    // Schema 管理
    List<String> listSchemaNames(ConnectorSession session);
    List<SchemaTableName> listTables(ConnectorSession session, Optional<String> schema);

    // 表元数据
    ConnectorTableHandle getTableHandle(ConnectorSession session, SchemaTableName tableName);
    ConnectorTableMetadata getTableMetadata(ConnectorSession session, ConnectorTableHandle handle);
    List<ConnectorColumnHandle> getColumns(ConnectorSession session, ConnectorTableHandle handle);

    // 应用谓词下推（核心）
    Optional<ConnectorApplyFilterResult> applyFilter(
        ConnectorSession session,
        ConnectorTableHandle handle,
        TupleDomain<ColumnHandle> filter);

    // 聚合下推
    Optional<ConnectorAggregationgregationPushdownResult> applyAggregationgregationPushdown(
        ConnectorSession session,
        ConnectorTableHandle handle,
        ConnectorAggregationgregationPushdownResult result);
}

// Split 管理（数据分片）
public interface ConnectorSplitManager {
    ConnectorSplitSource getSplits(
        ConnectorSession session,
        ConnectorTableHandle table,
        DynamicFilter dynamicFilter);
}
```

### 10.2 自定义 Connector 开发流程

```
开发自定义 Connector 步骤：

  1. 实现 Connector 接口
     实现 getMetadata/getSplitManager/getPageSourceProvider

  2. 实现 ConnectorMetadata
     实现 listSchemaNames/listTables/getTableHandle
     实现 getColumns（返回列信息）
     实现 applyFilter（谓词下推）

  3. 实现 ConnectorSplitManager
     getSplits：将表数据划分为 Split（分片）
     每个 Split 对应一个数据源片段

  4. 实现 ConnectorPageSourceProvider
     createPageSource：根据 Split 读取数据
     返回 PageSource（逐页读取数据）

  5. 打包为 JAR → 放入 Trino plugin 目录
     每个 Connector 一个目录（如 plugin/mysql/）

  6. 配置 catalog
     catalog/properties 文件指定 Connector 类
```

---

## 十一、Trino 容错执行与安全

### 11.1 容错执行（Fault-Tolerant Execution）

```
Trino 容错模式（实验性）：

  传统执行（当前默认）：
    查询失败 → 整体失败 → 需要重跑

  容错执行（可选）：
    任务失败 → 重新调度到其他 Worker → 继续执行
    中间结果持久化到存储（S3/HDFS）→ 避免重复计算

  配置：
    queryFaultToleranceEnabled=true

  工作原理：
    Stage 中间结果写入临时存储（S3/HDFS）
    Task 失败 → 重新创建 Task → 从临时存储读取中间结果
    支持 Stage 级别重试（非查询级别）

  适用场景：
    大规模 ETL 查询（运行数小时）
    资源不稳定集群（Spot 实例）
    多租户环境（资源竞争频繁）

  当前状态：
    实验性功能（非生产就绪）
    性能开销：中间结果持久化增加 10-20% 开销
    社区持续优化中
```

### 11.2 Trino 安全机制

```
认证（Authentication）：
  LDAP：集成 Active Directory / OpenLDAP
  Kerberos：企业级身份认证
  Password：内置密码认证
  Certificate：双向 TLS 认证
  OAuth 2.0：集成身份提供商

  配置示例（LDAP）：
    http-server.authentication.type=LDAP
    ldap.url=ldap://ldap.example.com:389
    ldap.user-base-dn=dc=example,dc=com
    ldap.user-filter=(&(objectClass=person)(uid=${USER}))

授权（Authorization）：
  RBAC（基于角色的访问控制）
    角色 → 权限 → 资源（Catalog/Schema/Table/Column）
    系统角色：admin、user
    自定义角色：data_analyst、data_engineer

  配置：
    access-control.name=file
    access-control.config-file=/etc/trino/access-control.json

列级掩码（Column Masking）：
  敏感列自动脱敏（如手机号、身份证号）
  不同角色看到不同数据

  配置示例：
    {
      "row-filters": [],
      "column-masks": {
        "users.phone": {
          "type": "partial",
          "mask": "concat('***', substring(${USER} from 8))"
        }
      }
    }

行级过滤（Row Filtering）：
  不同角色只能看到部分行（如区域数据隔离）
```

---

## 十二、Trino 性能调优

### 12.1 内存调优

```properties
# Worker 内存配置
query.max-memory=50GB              # 单查询最大内存（集群级）
query.max-memory-per-node=8GB      # 单节点单查询最大内存
query.max-total-memory-per-node=10GB  # 单节点总内存
query.memory-headroom=2GB          # 系统预留内存

# 查询内存分配：
#   每查询内存 = min(query.max-memory, query.max-memory-per-node × Worker 数)
#   Join/聚合操作消耗最多内存
#   大表 JOIN → 可能 OOM → 调小 query.max-memory

# 内存溢出排查：
#   查询日志：EXCEEDED_MEMORY_LIMIT
#   监控：trino_queries 查询内存使用
#   解决：调小并发/查询内存限制/优化查询
```

### 12.2 Join 策略优化

```
Trino Join 策略：

  1. Broadcast Join（广播 Join）：
     小表广播到所有 Worker → 大表分区处理
     适用：小表 < 几百 MB
     优势：避免 Shuffle，性能好
     劣势：小表重复传输（网络开销）

  2. Partitioned Join（分区 Join）：
     大表按 Join Key 分区 → Shuffle → Worker 本地 Join
     适用：大表 JOIN 大表
     优势：内存友好
     劣势：网络 Shuffle 开销大

  3. Hash Join（哈希 Join）：
     构建阶段：构建哈希表（小表）
     探测阶段：大表逐行探测
     支持：内连接/左连接/右连接/全连接

  优化器自动选择：
    优化器根据统计信息选择最优策略
    统计信息：表行数、列基数、数据分布
    收集统计信息：ANALYZE table_name;
```

### 12.3 性能监控与诊断

```sql
-- 查询执行信息
SELECT
    query_id,
    user,
    source,
    state,
    query,
    started,
    end_time - started AS duration,
    queued_time_ms,
    analyze_time_ms,
    process_time_ms,
    result_queue_time_ms
FROM system.runtime.queries
WHERE state = 'FINISHED'
ORDER BY duration DESC
LIMIT 20;

-- 查询内存使用
SELECT
    query_id,
    user,
    memory_pool,
    peak_memory
FROM system.runtime.queries
WHERE memory_pool != 'reserved'
ORDER BY peak_memory DESC;

-- Stage 执行详情
SELECT
    query_id,
    stage_id,
    stage_number,
    state,
    rows,
    bytes,
    cpu_time_ms,
    wall_time_ms,
    user_memory_reservation
FROM system.runtime.stages
WHERE query_id = 'your_query_id';

-- Worker 健康
SELECT
    node_id,
    http_uri,
    node_pool,
    active_queries,
    memory_available,
    cpu_available
FROM system.runtime.nodes
WHERE state = 'active';
```

---

## 十三、Trino on Kubernetes

### 13.1 K8s 部署架构

```yaml
# Trino on K8s 架构
Coordinator Deployment:
  replicas: 2（高可用）
  containers:
    - coordinator: Coordinator 服务
  services:
    - ClusterIP: 内部通信
    - LoadBalancer: 客户端访问

Worker StatefulSet:
  replicas: N（弹性伸缩）
  containers:
    - worker: Worker 服务
  volumeClaimTemplates:
    - 本地缓存卷（可选）

ConfigMap:
  config.properties: Trino 配置
  catalog/: 数据源配置

Secret:
  ldap-password: LDAP 认证密码
  tls-cert: TLS 证书

Ingress:
  路由规则：trino.example.com → Coordinator
```

### 13.2 Helm Chart 部署

```bash
# 使用 Trino Helm Chart
helm repo add trino https://trino.io/charts
helm repo update

# 安装 Trino
helm install trino trino/trino \
  --set coordinator.replicas=2 \
  --set worker.replicas=3 \
  --set worker.autoscaling.enabled=true \
  --set worker.autoscaling.minReplicas=3 \
  --set worker.autoscaling.maxReplicas=10 \
  --set coordinator.config."query\.max-memory"="50GB"

# 监控集成
helm install trino trino/trino \
  --set prometheus.enabled=true \
  --set grafana.enabled=true
```

---

## 十四、Trino vs PrestoDB vs Athena 对比

| 维度 | Trino | PrestoDB | AWS Athena |
|------|-------|----------|------------|
| **维护方** | Trino 社区（Starburst 主导） | Facebook/Meta | AWS |
| **协议** | Apache License 2.0 | Apache License 2.0 | 闭源 |
| **功能** | 最丰富（最新特性） | 稳定（Facebook 验证） | 简化版 |
| **Connector** | 最多（50+） | 中等 | 有限（AWS 生态） |
| **性能** | 优秀（持续优化） | 优秀 | 良好（受限） |
| **部署** | 自托管/云 | 自托管 | 托管服务 |
| **成本** | 自运维成本 | 自运维成本 | 按查询付费 |
| **社区** | 活跃（GitHub 最快增长） | 活跃（Facebook 背书） | 无开源社区 |
| **SQL 方言** | ANSI 标准 | ANSI 标准 | AWS 扩展 |
| **适用** | 通用联邦查询 | Facebook 生态 | AWS 数据湖 |

### 选型决策

```
场景 → 选型：
  通用联邦查询（多云）→ Trino（功能最全，社区最活跃）
  Facebook 生态（Hive 表格式兼容）→ PrestoDB
  AWS 数据湖（S3 + Glue）→ Athena（零运维）
  功能需求（动态过滤/字典聚合）→ Trino（新特性最多）
  已有 Trino 集群 → 继续用（迁移成本高）
  新建集群 → Trino（社区方向，Starburst 支持）
```

---

## 十五、Trino 容错执行深入（Exchange/Split/Single Task）

### 15.1 容错执行架构

```
Fault-Tolerant Execution（容错执行）核心机制：

  Exchange（交换）：
    Stage 间数据传输的中间层
    支持物化到磁盘/对象存储（S3/HDFS）
    Task 失败时可从 Exchange 重读中间结果
    避免从头重算整个 Stage

  Split（分片）：
    数据源的最小调度单元
    每个 Split 对应一个数据源片段（如 Hive 表的一个分区）
    失败的 Split 可重新调度到其他 Worker

  Single Task 模型：
    每个 Stage 只创建一个 Task（而非 N 个并行 Task）
    Task 内部按 Split 流水线执行
    失败时整体重新调度（而非单个并行 Task 重试）
    简化容错逻辑

容错执行配置：
  query.fault-tolerant-execution.enabled=true
  exchange.deduplication.max-buffer-size=1GB
  fault-tolerant-execution.target-stage-input-positions=100000000
```

### 15.2 容错执行 vs 传统执行对比

| 维度 | 传统执行 | 容错执行 |
|------|---------|---------|
| 中间结果 | 内存传输 | 物化到存储（S3/HDFS） |
| Task 失败 | 整个查询失败 | 单 Task 重试 |
| Stage 失败 | 整个查询失败 | Stage 级重试 |
| 资源浪费 | 重试全量计算 | 仅重算失败部分 |
| 性能开销 | 无额外开销 | 增加 10-20% IO |
| 适用场景 | 交互式查询 | 大规模 ETL / Spot 实例 |

```text
容错执行适用场景：
  1. 大规模 ETL 查询（运行数小时，失败代价高）
  2. Spot 实例集群（实例随时被回收）
  3. 多租户环境（资源竞争频繁，任务易失败）
  4. 数据源不稳定（网络抖动导致读取失败）
```

## 十六、动态过滤器（Dynamic Filtering）原理与 EXPLAIN 输出

### 16.1 动态过滤原理

```
动态过滤 = Join 时从大表提取过滤条件，应用到小表扫描

原理详解：
  1. Phase 1（构建阶段）：
     扫描大表 orders，提取 JOIN 键的值集合
     如：SELECT DISTINCT user_id FROM orders WHERE order_date > '2024-01-01'
     → 提取 user_id 集合 {101, 102, 103, ...}

  2. Phase 2（推送阶段）：
     将 user_id 集合推送到小表 users 的 Connector
     → Connector 生成过滤条件：WHERE id IN (101, 102, 103, ...)

  3. Phase 3（执行阶段）：
     users 表扫描量大幅减少（从全量 → 仅匹配行）
     → Join 性能提升显著

配置：
  optimizer.dynamic-filtering=true（默认开启）
  dynamic-filtering-max-domain-combinations=1000
  dynamic-filtering-pushdown-filter-factor=10
```

### 16.2 EXPLAIN 输出解读

```sql
-- 开启动态过滤后的 EXPLAIN
EXPLAIN SELECT * FROM orders o
JOIN users u ON o.user_id = u.id
WHERE o.order_date > '2024-01-01';

-- EXPLAIN 输出关键信息：
-- DynamicFilter: [o.user_id IN (101, 102, 103, ...)]
-- → 表示动态过滤已生效
-- → users 表只扫描 id IN (...) 的行

-- 未开启动态过滤的 EXPLAIN：
-- → users 表全表扫描（无 IN 条件）
-- → Join 在内存中完成（慢）
```

```text
EXPLAIN 输出解读：
  DynamicFilter: [...] → 动态过滤已生效
  FilterExpression: (id IN (...)) → Connector 层过滤
  Estimates: rows=1000 (vs 全量 100 万) → 扫描量大幅减少
  性能提升：通常 10-100 倍（取决于过滤选择性）
```

## 十七、字典聚合优化（DictionaryAggregationOperator）

```
字典聚合 = 用字典编码优化 GROUP BY

原理：
  低基数列（如 status, region, gender）GROUP BY 时
  传统：逐行比较字符串 → CPU 开销大（字符串哈希+比较）
  字典聚合：将字符串映射为整数 → 整数 GROUP BY → 极快

  适用条件：
    列的唯一值数量有限（< 几千）
    GROUP BY 列是低基数列

  工作流程：
    1. 扫描时构建字典（string → int 映射）
    2. GROUP BY 用整数比较（替代字符串比较）
    3. 聚合完成后将整数映射回字符串

  配置：
    dictionary-aggregation=true（默认开启）

  验证：
    EXPLAIN 输出中看到 "DictionaryAggregation" 节点
    表示字典聚合已生效

  性能提升：
    低基数列 GROUP BY：2-10 倍提速
    高基数列（如 user_id）：不适用（字典过大）
```

```sql
-- 验证字典聚合是否生效
EXPLAIN SELECT status, COUNT(*) FROM orders GROUP BY status;
-- 输出中应包含 "DictionaryAggregation" 节点

-- 如果没有出现，检查：
-- 1. status 列基数是否过高（> 10000）
-- 2. dictionary-aggregation 是否被禁用
```

## 十八、Trino on Kubernetes（trino-operator）

### 18.1 trino-operator 部署

```yaml
# 使用 trino-operator 部署 Trino 集群
apiVersion: trino.apache.org/v1alpha1
kind: TrinoCluster
metadata:
  name: trino-cluster
spec:
  coordinator:
    replicas: 2
    image:
      repository: trinodb/trino
      tag: "433"
    resources:
      requests:
        memory: "4Gi"
        cpu: "2"
      limits:
        memory: "8Gi"
        cpu: "4"
  worker:
    replicas: 3
    image:
      repository: trinodb/trino
      tag: "433"
    resources:
      requests:
        memory: "8Gi"
        cpu: "4"
      limits:
        memory: "16Gi"
        cpu: "8"
    autoscaling:
      enabled: true
      minReplicas: 3
      maxReplicas: 10
      targetCPUUtilization: 70
  catalog:
    mysql: |
      connector.name=mysql
      connection-url=jdbc:mysql://mysql:3306/mydb
      connection-user=user
      connection-password=pass
    hive: |
      connector.name=hive
      hive.metastore.uri=thrift://hive-metastore:9083
```

### 18.2 trino-operator vs Helm Chart 对比

| 维度 | trino-operator | Helm Chart |
|------|---------------|------------|
| 部署方式 | K8s Operator（CRD） | Helm 安装 |
| 扩缩容 | 自动（HPA） | 手动/HPA |
| 版本升级 | 滚动更新 | Helm upgrade |
| 配置管理 | CRD 声明式 | values.yaml |
| 运维复杂度 | 低（Operator 管理） | 中 |
| 适用 | K8s 原生部署 | 传统部署 |

## 十九、Trino 安全模型（System Access Control）

```
Trino 安全模型（System Access Control）：

  认证（Authentication）：
    LDAP：集成 Active Directory / OpenLDAP
    Kerberos：企业级身份认证
    Password：内置密码认证
    Certificate：双向 TLS 认证
    OAuth 2.0：集成身份提供商

  授权（Authorization）：
    System Access Control：全局授权框架
    文件型（file）：JSON 配置文件定义权限
    Ranger：Apache Ranger 集成（Hadoop 生态）
    访问控制粒度：Catalog / Schema / Table / Column

  列级掩码（Column Masking）：
    敏感列自动脱敏（如手机号、身份证号）
    不同角色看到不同数据

  配置示例：
    access-control.name=file
    access-control.config-file=/etc/trino/access-control.json

  行级过滤（Row Filtering）：
    不同角色只能看到部分行（如区域数据隔离）

  审计日志：
    记录所有查询操作（用户/时间/查询/结果行数）
    集成 ELK/Splunk 做安全分析
```

```json
// access-control.json 示例
{
  "tables": [
    {
      "group": "analytics",
      "catalog": "hive",
      "schema": "default",
      "table": "users",
      "columns": ["phone", "id_card"],
      "mask": {
        "phone": "concat('***', substring(phone from 8))",
        "id_card": "concat('****', substring(id_card from 15))"
      }
    }
  ],
  "row-filters": [
    {
      "group": "regional",
      "catalog": "hive",
      "schema": "default",
      "table": "orders",
      "filter": "region = currentUserRegion()"
    }
  ]
}
```

## 二十、Trino 性能调优（query.max-memory-per-node / join-distribution-type）

### 20.1 内存调优

```properties
# Worker 内存配置
query.max-memory=50GB              # 单查询最大内存（集群级）
query.max-memory-per-node=8GB      # 单节点单查询最大内存
query.max-total-memory-per-node=10GB  # 单节点总内存
query.memory-headroom=2GB          # 系统预留内存

# 内存分配公式：
#   每查询内存 = min(query.max-memory, query.max-memory-per-node × Worker 数)
#   Join/聚合操作消耗最多内存
#   大表 JOIN → 可能 OOM → 调小 query.max-memory

# 内存溢出排查：
#   查询日志：EXCEEDED_MEMORY_LIMIT
#   监控：trino_queries 查询内存使用
#   解决：调小并发/查询内存限制/优化查询
```

### 20.2 Join 分布式类型

```properties
# join-distribution-type 配置
# AUTOMATIC（默认）：优化器自动选择 Broadcast 或 Partitioned
# BROADCAST：强制广播 Join（小表广播到所有 Worker）
# PARTITIONED：强制分区 Join（大表按 JOIN 键分区）

# 选择策略：
#   小表 < 几百 MB → BROADCAST（避免 Shuffle）
#   大表 JOIN 大表 → PARTITIONED（内存友好）
#   AUTOMATIC → 优化器根据统计信息自动选择

# 配置示例：
join-distribution-type=AUTOMATIC
```

```text
调优 Checklist：
  1. 收集统计信息：ANALYZE table_name;
  2. 检查 EXPLAIN 输出中的 Join 类型
  3. 调整 query.max-memory-per-node（单节点内存）
  4. 调整 join-distribution-type（Broadcast vs Partitioned）
  5. 监控查询内存使用（system.runtime.queries）
  6. 优化数据倾斜（Salting / 自定义 Partitioner）
```

## 二十一、与其他板块的关系

- 数据湖格式见「[列式存储与数据湖格式](../大数据/05-列式存储与数据湖格式.md)」；
- 与 Spark/ClickHouse 对比见对应文档；
- 云上对应见「[云上数仓与大数据生态](./云上数仓与大数据生态.md)」。

> 一句话：**Trino = 「哪里的数据都能查」的联邦 SQL——不是存储不是 ETL，是「分布式查询层」；生产核心：谓词下推 + 资源队列 + Iceberg 集成 + Worker 弹性扩缩**。
