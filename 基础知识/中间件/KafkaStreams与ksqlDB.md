# Kafka Streams 与 ksqlDB（Kafka 生态流处理）

> Kafka Streams 是 **Apache Kafka 官方的轻量流处理库**（Java），ksqlDB 是构建在其上的 **SQL 流处理引擎**。核心思想「**流是数据库，数据库是流的物化视图**」——不部署独立集群，嵌入应用即用。相比 Flink（独立集群/重）、Spark Streaming（微批）、Storm（已边缘化），Kafka Streams 以「**零运维（复用 Kafka 集群）+ 库而非框架 + 状态精确一次（Streams DSL）**」独树一帜。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 流处理太重 | Flink/Spark 要部署集群、运维 Job，小场景不值当 |
| 应用内处理 | 消息消费后需要聚合/关联/窗口计算，不想引入新系统 |
| 状态管理 | 流计算（累加/去重/Join）需要本地状态 |
| 精确一次 | 消息重放要保证结果不重不丢 |
| 交互查询 | 实时计算的结果想直接查询（物化视图） |

> 核心认知：**Kafka Streams = 「把 Kafka 变成可编程流数据库」**——topic 是流，KTable 是表（物化视图），应用内写 Java 代码或 ksqlDB 写 SQL 即可处理。

---

## 二、核心原理

### 2.1 架构（无独立集群）

```
应用（Kafka Streams 库，多个实例组成拓扑）
  ├── Source Processor（消费 topic → 流）
  ├── 处理节点（filter/map/aggregate/join/window）
  ├── State Store（RocksDB 本地状态 + 变更日志 topic 备份）
  ├── Sink Processor（结果写回 topic）
  └── 交互式查询（REST 查 State Store 物化视图）

Kafka 集群：输入 topic / 输出 topic / changelog topic（状态备份）
```

**零运维**：不部署任何新组件——实例数 = 业务应用实例数，Kafka 自动做消费者组负载均衡/故障转移。

### 2.2 核心抽象：KStream / KTable / GlobalKTable

| 抽象 | 语义 | 说明 |
|------|------|------|
| KStream | 事件流 | 每一条记录都是新事件（append-only） |
| KTable | 变更日志表 | 同 key 只保留最新值（upsert，物化视图） |
| GlobalKTable | 全局表 | 所有实例全量拷贝（小维表 Join） |

**Kafka Streams 的 DSL（声明式）**：`map/filter/groupBy/aggregate/join/windowedBy` 链式编程，类似 Spark DataFrame。

### 2.3 有状态计算（State Store + Changelog）

```
聚合/Join/去重 → State Store（RocksDB，本地磁盘）
  ├── 写状态同时写 changelog topic（变更日志）
  ├── 实例重启 → 从 changelog 恢复状态
  └── 分区迁移 → 新实例重建状态
```

**选型关注点**：RocksDB 状态 + changelog 备份 = 状态精确一次的基础；代价是状态越大 changelog 流量越大。

### 2.4 精确一次语义（EOS）

- **幂等生产者**（enable.idempotence）+ **事务**（跨消费/生产原子提交）；
- 消费 offset 与输出结果在同一事务提交——失败重放不会产生重复结果。

```
EOS 实现：
  processing.guarantee=exactly_once_v2（Kafka 3.x）
  事务协调器（Transaction Coordinator）协调两阶段提交
  代价：事务有额外开销（非关键链路用 at-least-once + 幂等）
```

### 2.5 窗口与时间

| 窗口 | 说明 |
|------|------|
| Tumbling | 固定不重叠（每 5 分钟计数） |
| Hopping | 固定可滑动（每 1 分钟滑 10 秒） |
| Sliding | 按事件时间区间（Join 用） |
| Session | 按活跃间隔（用户会话） |

```
时间语义：
  事件时间（event-time，推荐）vs 处理时间（processing-time）vs 摄入时间（ingestion-time）
  水位线/延迟允许（grace period）：迟到的记录在允许窗口内仍计入
  窗口结果有"最终确定性"问题：窗口关闭后迟到的数据如何处理（suppression/grace）
```

### 2.6 交互式查询（Interactive Queries）

```
State Store 是本地物化视图 → 通过 REST/API 直接查询
  查询"当前累计金额/当前用户状态"
  分布式：实例间需发现（K8s service / 服务发现）
  与 ksqlDB 的 SELECT 联动（实时大屏直接查物化结果）
```

### 2.7 ksqlDB（SQL 化）

```sql
-- 流与表
CREATE STREAM orders (id BIGINT, amount DOUBLE, user STRING)
  WITH (KAFKA_TOPIC='orders', VALUE_FORMAT='AVRO');

-- 连续查询（持续物化，结果自动写回 topic）
CREATE TABLE order_stats AS
  SELECT user, SUM(amount) AS total
  FROM orders
  WINDOW TUMBLING (SIZE 1 MINUTE)
  GROUP BY user EMIT CHANGES;

-- 交互查询（REST）：直接查物化视图
SELECT * FROM order_stats WHERE user='u1' EMIT CHANGES;
```

```
ksqlDB 服务端：独立进程（ksqlDB server），管理多个查询
  用 SQL 把 Stream/Table 定义 + 连续查询 → 简化开发
  EMIT CHANGES：持续推送结果（物化视图增量）
  适合实时大屏/监控统计/轻量流 ETL
```

**选型关注点**：ksqlDB 让「流处理 SQL 化 + 结果即表（可查询）」——实时大屏/监控统计场景开发效率极高。

---

## 三、核心特性

| 特性 | 说明 |
|------|------|
| 零集群 | 复用 Kafka，无独立流处理集群 |
| 库嵌入 | Java 依赖即用，与微服务同进程 |
| 状态精确一次 | RocksDB + changelog + 事务 |
| 交互式查询 | State Store 物化视图 REST 查询 |
| 容错 | 消费者组机制自动故障转移 |
| 弹性 | 加实例自动重平衡（rebalance） |
| 时间语义 | 事件时间 + 水位线 + 四种窗口 |
| ksqlDB | SQL 流处理 + 连续物化视图 |
| 生态 | 与 Kafka Connect/Schema Registry 一体 |

---

## 四、Kafka Streams vs Flink vs Spark Structured Streaming

| 维度 | Kafka Streams | Flink | Spark Structured Streaming |
|------|---------------|-------|---------------------------|
| 形态 | 库（嵌入应用） | 独立集群框架 | 独立集群框架 |
| 运维 | 零（复用 Kafka） | 重（集群+Job） | 重（集群+Job） |
| 延迟 | 毫秒级 | 毫秒级 | 秒级（微批） |
| 状态 | RocksDB + changelog | RocksDB/内存 | 有状态（Stateful） |
| 精确一次 | 支持 | 支持 | 支持 |
| 复杂度 | 低 | 高 | 中 |
| 能力上限 | 中（Kafka 生态内） | 最高（复杂流处理） | 高（批流一体） |
| 适用 | 服务内实时处理 | 独立实时平台 | 批流统一平台 |

**选型关注点**：
- 服务内轻量实时处理（聚合/Join/清洗）→ **Kafka Streams**（零运维）；
- 独立实时数仓/复杂事件处理 → **Flink**；
- 批流一体统一平台 → **Spark**。

---

## 五、生产实践

### 5.1 关键配置

| 配置 | 建议 |
|------|------|
| 并行度 | 实例数 × 每个实例线程数 = 分区数（最优） |
| 状态目录 | state.dir 用 SSD/独立磁盘（RocksDB 写入） |
| 精确一次 | 重要链路 `processing.guarantee=exactly_once_v2` |
| RocksDB | 内存/缓存/压缩参数按状态大小调 |
| 交互查询 | 查询服务与流处理分开部署（实例发现：K8s service/发现服务） |
| 监控 | Kafka Lag + Streams 指标（kafka-streams-metrics） |

### 5.2 常见坑

- **实例数 > 分区数**：多余实例闲置（并行度 = 分区数）；
- **rebalance 风暴**：频繁重启/心跳超时导致反复重平衡 → 调大 session.timeout；
- **状态膨胀**：无界聚合状态无限增长 → 窗口/压缩/TTL 策略；
- **EOS 性能开销**：事务有额外开销，非关键链路用 at-least-once + 幂等；
- **拓扑变更**：改拓扑/变更状态结构需要停机迁移（state store 版本管理）；
- **反序列化错误**：消息格式不匹配 → 配置 error handling / dead-letter topic；
- **窗口延迟数据**：正确设置 grace 与 suppression，避免"结果回跳"。

### 5.3 典型应用

```
实时监控：统计每分钟各服务错误数（窗口聚合 → 物化视图 → 大屏）
实时推荐特征：用户行为流 + 用户画像表 join → 特征 topic
实时风控：交易流 + 规则聚合 → 异常事件 topic
流式 ETL：topic 清洗/格式转换 → 落湖/更新索引
```

---

## 六、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 服务内实时聚合/Join | Kafka Streams | ksqlDB |
| 实时大屏统计 | ksqlDB | Flink SQL |
| 独立实时数仓 | Flink | Spark Streaming |
| 批流一体 | Spark | Flink |
| 简单清洗转发 | Kafka Streams（几句代码） | 纯消费者 |

---

## 七、Kafka Streams State Store 内部机制

### 7.1 State Store 架构

```mermaid
graph TD
    A[KStream/KTable] --> B[State Store]
    B --> C[RocksDB 本地存储]
    B --> D[Changelog Topic 备份]
    C --> E[内存缓存]
    C --> F[磁盘持久化]
```

### 7.2 State Store 类型

| 类型 | 说明 | 适用 |
|------|------|------|
| RocksDB Store | 本地磁盘存储 | 大状态（生产首选） |
| InMemory Store | 内存存储 | 小状态/测试 |
| Window Store | 窗口状态 | 时间窗口聚合 |
| Session Store | 会话状态 | 会话窗口 |

### 7.3 Changelog 机制

```
写入流程：
  1. 更新 State Store（RocksDB）
  2. 同时写入 Changelog Topic（备份）
  3. 返回成功

恢复流程：
  实例故障 → 新实例接管
  → 从 Changelog Topic 恢复状态
  → 重放变更事件
  → 状态重建完成

Changelog 配置：
  cleanup.policy=compact（保留最新值）
  压缩策略：同 key 只保留最新值
```

### 7.4 State Store 调优

| 参数 | 说明 | 建议 |
|------|------|------|
| `state.dir` | 状态目录 | SSD 磁盘 |
| `rocksdb.block.cache.size` | Block Cache 大小 | 按内存调整 |
| `rocksdb.write.buffer.size` | 写缓冲大小 | 64MB |
| `rocksdb.max.write.buffer.number` | 写缓冲数量 | 3 |
| `rocksdb.compaction.style` | Compaction 策略 | LEVEL |

---

## 八、Kafka Streams 交互式查询

### 8.1 查询架构

```mermaid
graph LR
    A[REST API] --> B[Kafka Streams 实例]
    B --> C[State Store]
    C --> D[本地查询]
    E[其他实例] --> F[远程查询]
```

### 8.2 查询方式

| 方式 | 说明 | 适用 |
|------|------|------|
| 本地查询 | 查询当前实例的 State Store | 单实例 |
| 远程查询 | 查询其他实例的 State Store | 分布式 |
| 聚合查询 | 汇总所有实例的结果 | 全局统计 |

### 8.3 查询示例

```java
// 获取 State Store
ReadOnlyKeyValueStore<String, Long> store =
    KafkaStreams.queryableStoreStores().queryableStoreTypes()
        .keyValueStore("counts-store");

// 本地查询
Long value = store.get("key");

// 远程查询（通过 REST）
// GET /queryable-store/stores/counts-store/keys/key
```

### 8.4 查询最佳实践

| 实践 | 说明 |
|------|------|
| 查询路由 | 服务发现 + 负载均衡 |
| 缓存结果 | 减少 State Store 查询压力 |
| 异步查询 | 非阻塞查询 |
| 监控延迟 | 查询响应时间 |

---

## 九、ksqlDB Pull Query vs Push Query

### 9.1 查询类型对比

| 类型 | 说明 | 适用 |
|------|------|------|
| Pull Query | 一次性查询当前状态 | 交互式查询 |
| Push Query | 持续推送结果 | 实时大屏 |

### 9.2 Pull Query 特点

```
特点：
  一次查询，返回当前状态
  类似 SQL SELECT
  不会持续更新
  支持 WHERE 条件

使用场景：
  实时大屏查询当前值
  交互式数据分析
  API 查询物化视图

限制：
  不支持聚合函数（SUM/COUNT）
  只查询当前状态
```

### 9.3 Push Query 特点

```
特点：
  持续推送结果（EMIT CHANGES）
  类似数据库触发器
  实时更新
  支持窗口聚合

使用场景：
  实时大屏
  监控告警
  实时推荐

配置：
  EMIT CHANGES（持续推送）
  EMIT FINAL（窗口关闭后推送最终结果）
```

### 9.4 查询示例

```sql
-- Pull Query（一次性查询）
SELECT * FROM page_view_stats WHERE page_id = 'home';

-- Push Query（持续推送）
SELECT page_id, COUNT(*) FROM page_views
GROUP BY page_id EMIT CHANGES;

-- Push Query + 窗口
SELECT page_id, COUNT(*) FROM page_views
WINDOW TUMBLING (SIZE 5 MINUTES)
GROUP BY page_id EMIT FINAL;
```

---

## 十、ksqlDB 物化视图

### 10.1 物化视图原理

```mermaid
graph LR
    A[Stream/Source] --> B[CREATE TABLE AS SELECT]
    B --> C[物化视图 Topic]
    C --> D[增量更新]
    D --> E[查询当前状态]
```

### 10.2 物化视图操作

```sql
-- 创建物化视图
CREATE TABLE order_stats AS
SELECT user_id, SUM(amount) AS total, COUNT(*) AS cnt
FROM orders
GROUP BY user_id;

-- 查询物化视图
SELECT * FROM order_stats WHERE user_id = 'u1';

-- 删除物化视图
DROP TABLE IF EXISTS order_stats;
```

### 10.3 物化视图 vs 流查询

| 维度 | 物化视图 | 流查询 |
|------|----------|--------|
| 结果 | 持久化到 Topic | 临时结果 |
| 查询 | 可 Pull Query | 只能 Push |
| 状态 | 持久化 | 不持久化 |
| 恢复 | 可恢复 | 不可恢复 |

---

## 十一、Kafka Streams Exactly-once 深入

### 11.1 EOS 实现原理

```mermaid
sequenceDiagram
    participant C as Consumer
    participant P as Producer
    participant T as Transaction Coordinator
    participant K as Kafka
    C->>K: 消费消息
    C->>P: 处理并发送结果
    C->>T: 提交 offset + 消息（同一事务）
    T->>K: 提交事务
    T->>K: 提交消费 offset
```

### 11.2 EOS 配置

```properties
# 启用 EOS
processing.guarantee=exactly_once_v2

# 生产者配置
enable.idempotence=true
transactional.id=my-streams-app
```

### 11.3 EOS 性能影响

| 维度 | at-least-once | exactly_once |
|------|---------------|--------------|
| 吞吐 | 高 | 中（事务开销） |
| 延迟 | 低 | 中 |
| 重复 | 可能 | 无 |
| 适用 | 非关键链路 | 关键链路 |

### 11.4 EOS 最佳实践

| 实践 | 说明 |
|------|------|
| 关键链路启用 | 财务/订单等场景 |
| 非关键用幂等 | 性能优先 |
| 监控事务 | 事务提交成功率 |
| 合理超时 | 避免事务超时 |

---

## 十二、Kafka Streams vs Flink vs Spark Streaming

### 12.1 核心对比

| 维度 | Kafka Streams | Flink | Spark Streaming |
|------|---------------|-------|-----------------|
| 形态 | 库嵌入应用 | 独立集群 | 独立集群 |
| 运维 | 零 | 重 | 重 |
| 延迟 | 毫秒 | 毫秒 | 秒 |
| 状态 | RocksDB + changelog | RocksDB/内存 | 有状态 |
| 窗口 | 4种 | 丰富 | 有限 |
| EOS | 事务 | Checkpoint | WAL+Checkpoint |
| SQL | ksqlDB | Flink SQL | Spark SQL |
| 复杂事件 | 有限 | 强（CEP） | 无 |
| 适用规模 | 中小 | 大 | 大 |

### 12.2 选型决策

```
场景选型：
  应用内轻量处理 → Kafka Streams（零运维）
  复杂流处理/CEP → Flink
  批流一体 → Spark
  实时数仓 SQL → Flink SQL / ksqlDB
  实时大屏 → ksqlDB
```

---

## 十三、Kafka Streams 在微服务

### 13.1 架构模式

```mermaid
graph TD
    A[Service A] -->|生产事件| B[Kafka]
    B -->|消费事件| C[Service B]
    C -->|处理| D[State Store]
    D -->|查询| E[REST API]
```

### 13.2 微服务集成

```java
// Spring Boot 集成
@Bean
public KStream<String, Order> processOrders(StreamsBuilder builder) {
    KStream<String, Order> orders = builder.stream("orders");
    
    KTable<String, Long> stats = orders
        .groupBy((key, order) -> order.getUserId())
        .count();
    
    // 交互式查询
    ReadOnlyKeyValueStore<String, Long> store =
        kafkaStreams.store(
            StoreQueryParameters.fromNameAndType("counts-store", QueryableStoreTypes.keyValueStore())
        );
    
    return orders;
}
```

### 13.3 微服务最佳实践

| 实践 | 说明 |
|------|------|
| 状态独立 | 每个服务独立 State Store |
| 查询路由 | 服务发现 + 负载均衡 |
| 错误处理 | Dead Letter Topic |
| 监控 | Kafka Lag + 处理延迟 |

---

## 十四、ksqlDB UDF

### 14.1 UDF 类型

| 类型 | 说明 | 示例 |
|------|------|------|
| 标量 UDF | 输入→输出 | URL 解析 |
| 聚合 UDF | 多行→一行 | 自定义聚合 |
| 表值函数 | 一行→多行 | JSON 展开 |

### 14.2 UDF 开发

```java
// 标量 UDF
@UdfDescription(name = "parse_url", ...)
public class ParseUrlUdf {
    @Udf
    public String parseUrl(String url, String part) {
        // 解析逻辑
    }
}

// 聚合 UDF
@UdfDescription(name = "string_agg", ...)
public class StringAggUdf {
    @Udaf(description = "字符串聚合")
    public StringAgg create() {
        return new StringAgg();
    }
}
```

### 14.3 UDF 注册与使用

```sql
-- 注册 UDF
CREATE FUNCTION parse_url AS 'com.example.ParseUrlUdf';

-- 使用 UDF
SELECT parse_url(url, 'host') AS host FROM urls;

-- 删除 UDF
DROP FUNCTION IF EXISTS parse_url;
```

---

## 十五、Exactly-once vs At-least-once 权衡深入

### 15.1 语义对比

| 维度 | At-least-once | Exactly-once (EOS) |
|------|---------------|---------------------|
| 消息可能重复 | 是（消费者重平衡时） | 否（事务原子提交） |
| 吞吐量 | 高（无事务开销） | 中（事务协调开销 10-20%） |
| 端到端延迟 | 低 | 中（等待事务完成） |
| 实现复杂度 | 低 | 中（需事务协调器） |
| 适用场景 | 日志采集、非关键链路 | 财务、订单、计费 |

### 15.2 EOS 实现的三阶段

```
Kafka Streams EOS 三阶段：
  1. 生产阶段：幂等生产者 + 事务 ID（enable.idempotence=true）
  2. 消费阶段：从 input topic 消费，状态写入 RocksDB + changelog
  3. 提交阶段：offset 与输出消息在同一事务提交

  失败重放路径：
    事务未提交 → TC 回滚 → 消费者重平衡 → 重新消费未提交的 offset
    由于 output 也未提交 → 无重复输出

  性能开销来源：
    ├── 事务协调器通信（~2-5ms/事务）
    ├── 事务日志写入（磁盘 IO）
    ├── 状态快照（checkpoint）
    └── 生产者批量发送（减少开销的关键）
```

### 15.3 选型决策矩阵

| 场景 | 推荐语义 | 配置 |
|------|----------|------|
| 实时大屏统计 | At-least-once + 幂等 | `processing.guarantee=at_least_once` |
| 电商订单处理 | Exactly-once | `processing.guarantee=exactly_once_v2` |
| 日志聚合分析 | At-least-once | 默认配置 |
| 金融交易对账 | Exactly-once | `exactly_once_v2` + 幂等消费者 |
| 用户行为埋点 | At-least-once | 丢少量可接受 |

---

## 十六、ksqlDB UDF 高级开发

### 16.1 UDF 类型与注册

```java
// 标量 UDF：输入一行 → 输出一行
@UdfDescription(name = "parse_json_field", ...)
public class ParseJsonFieldUdf {
    @Udf
    public String parseJsonField(
        @UdfDescription(name = "json_str", type = "VARCHAR") String jsonStr,
        @UdfDescription(name = "field_path", type = "VARCHAR") String fieldPath
    ) {
        ObjectMapper mapper = new ObjectMapper();
        JsonNode node = mapper.readTree(jsonStr);
        String[] parts = fieldPath.split("\\.");
        for (String part : parts) {
            node = node.get(part);
            if (node == null) return null;
        }
        return node.asText();
    }
}

// 聚合 UDF：多行 → 一行
@UdfDescription(name = "percentile_approx", ...)
public class PercentileApproxUdf {
    @Udaf(description = "近似百分位数")
    public PercentileApproxState create() {
        return new PercentileApproxState();
    }
}

@UdafDescription(name = "percentile_approx", ...)
public static class PercentileApproxState {
    private final List<Double> values = new ArrayList<>();

    @UdafAggregator(description = "聚合值")
    public void aggregate(Double value, PercentileApproxState state) {
        if (value != null) state.values.add(value);
    }

    @UdafFixup(description = "合并状态")
    public void fixup(PercentileApproxState other, PercentileApproxState state) {
        state.values.addAll(other.values);
    }

    @UdafTerminator(description = "输出结果")
    public Double terminate(PercentileApproxState state) {
        Collections.sort(state.values);
        int idx = (int) Math.ceil(0.99 * state.values.size()) - 1;
        return state.values.get(Math.max(0, idx));
    }
}
```

### 16.2 UDF 部署与测试

```sql
-- 注册 UDF（JAR 方式）
CREATE FUNCTION parse_json_field AS 'com.example.udf.ParseJsonFieldUdf'
  WITH (jar='s3://ksql-udfs/parse-json-1.0.jar');

-- 使用 UDF
SELECT parse_json_field(event_data, 'user.id') AS user_id
FROM raw_events
EMIT CHANGES;

-- 单元测试（JUnit）
@Test
public void testParseJsonField() {
    ParseJsonFieldUdf udf = new ParseJsonFieldUdf();
    String result = udf.parseJsonField(
        "{\"user\":{\"id\":\"12345\"}}", "user.id");
    assertEquals("12345", result);
}
```

---

## 十七、ksqlDB 窗口聚合高级模式

### 17.1 四种窗口对比

```sql
-- 1. Tumbling Window（固定不重叠）
SELECT user_id, COUNT(*) AS cnt
FROM page_views
WINDOW TUMBLING (SIZE 5 MINUTES)
GROUP BY user_id EMIT CHANGES;

-- 2. Hopping Window（固定可滑动）
SELECT user_id, COUNT(*) AS cnt
FROM page_views
WINDOW HOPPING (SIZE 10 MINUTES, ADVANCE BY 5 MINUTES)
GROUP BY user_id EMIT CHANGES;

-- 3. Sliding Window（按事件时间区间）
SELECT user_id, COUNT(*) AS cnt
FROM page_views
WINDOW SLIDING (SIZE 5 MINUTES)
GROUP BY user_id EMIT CHANGES;

-- 4. Session Window（按活跃间隔）
SELECT user_id, COUNT(*) AS cnt
FROM page_views
WINDOW SESSION (30 MINUTES)
GROUP BY user_id EMIT CHANGES;
```

### 17.2 窗口聚合最佳实践

| 窗口类型 | 适用场景 | 注意事项 |
|----------|----------|----------|
| Tumbling | 固定周期统计（每分钟UV） | 窗口边界对齐 |
| Hopping | 滑动平均（最近10分钟均值） | ADVANCE 不宜过小 |
| Sliding | 用户行为间隔（两事件间隔） | 仅在 Join 时常用 |
| Session | 用户会话分析 | INACTIVITY GAP 需按业务调 |

---

## 十八、Kafka Streams State Store 清理策略

### 18.1 Changelog 清理

```
Changelog 清理策略：
  1. compact + delete：保留最新值，超过 retention 自动删除
  2. cleanup.policy=compact：仅压缩（默认）
  3. cleanup.policy=delete：仅删除
  4. cleanup.policy=compact,delete：压缩+删除

  配置建议：
    高频更新场景：cleanup.policy=compact
    有时效数据：cleanup.policy=compact,delete + retention.ms
    大状态：配合 min.cleanable.dirty.ratio 调整合并频率
```

### 18.2 State Store 生命周期

```
State Store 生命周期：
  创建 → 初始化 → 正常读写 → 故障恢复 → 关闭
  
  清理触发条件：
    ├── 应用关闭：store.close() 释放 RocksDB 资源
    ├── 分区重分配：旧实例释放，新实例重建
    ├── 拓扑变更：state store 版本不匹配需重建
    └── 手动清理：rm -rf {state.dir}/{application.id}

  生产建议：
    state.dir 使用独立磁盘（避免与日志竞争 IO）
    定期监控 RocksDB 磁盘使用量
    清理前确认无活跃消费者
```

---

## 十九、Kafka Streams 线程模型

### 19.1 StreamThread 架构

```
Kafka Streams 线程模型：
  ├── StreamThread（默认 = 1，可配置 num.stream.threads）
  │   ├── StreamTask（每个 partition 一个 task）
  │   │   ├── Source Processor → 消费 input topic
  │   │   ├── 处理节点（filter/map/aggregate/join）
  │   │   └── Sink Processor → 写入 output topic
  │   └── State Store（每个 task 独立的 RocksDB）
  ├── GlobalStreamThread（GlobalKTable 专用，1个）
  └── ScheduledExecutor（后台定时任务）

  并行度计算：
    实例数 × StreamThread 数 = 分区数（最优）
    例：3 实例 × 2 线程 = 6 线程 → input topic 需 6 分区
```

### 19.2 线程调优

| 参数 | 默认值 | 建议 |
|------|--------|------|
| `num.stream.threads` | 1 | 按 CPU 核数调整 |
| `state.dir` | /tmp/kafka-streams | SSD 独立磁盘 |
| `commit.interval.ms` | 30000 | 关键路径调小（5000） |
| `cache.max.bytes.buffering` | 10MB | 大状态调大 |
| `num.records.for递交` | 10000 | 批量提交 |

---

## 二十、ksqlDB Pull Query 优化

### 20.1 Pull Query 限制与优化

```
Pull Query 限制：
  1. 只查询物化视图的当前状态（非历史）
  2. 不支持聚合函数（SUM/COUNT）
  3. 只支持 WHERE 条件（主键或全表扫描）

  优化策略：
    ├── 为 Pull Query 建专用物化视图
    ├── 使用 WHERE 条件命中主键（避免全表扫描）
    ├── 监控 Pull Query 延迟（< 10ms 为健康）
    └── 高频查询结果缓存（应用层 Redis）
```

### 20.2 Pull vs Push 选型

| 维度 | Pull Query | Push Query |
|------|------------|------------|
| 结果形式 | 一次性返回 | 持续推送 |
| 延迟 | 毫秒级 | 秒级 |
| 适用场景 | API 查询/实时大屏 | 监控告警/实时推荐 |
| 资源消耗 | 低（按需查询） | 高（持续物化） |
| 并发能力 | 高 | 中（结果集大） |

---

## 二十一、Kafka Streams vs Flink SQL 深度对比

| 维度 | Kafka Streams + ksqlDB | Flink SQL |
|------|------------------------|-----------|
| 部署 | 库嵌入应用（零集群） | 独立集群（需部署） |
| SQL 引擎 | ksqlDB（有限） | Flink SQL（完备） |
| 窗口 | 4种 | 丰富（含 Cumulative/Sliding） |
| 水位线 | 基于时间戳（简单） | 自定义水位线策略（灵活） |
| 复杂事件 | 有限 | 强（CEP 库） |
| 批流一体 | 不支持 | 原生支持 |
| 状态存储 | RocksDB + changelog | 多后端（RocksDB/堆内存/外部） |
| 背压 | 依赖 Kafka | 反压机制（流量控制） |
| 生态 | Kafka 生态内 | 独立生态（Hive/Iceberg/…） |
| 适用规模 | 中小（应用内处理） | 大（独立平台） |

```
选型决策：
  应用内轻量处理 → Kafka Streams
  复杂流处理/CEP → Flink SQL
  批流一体 → Flink SQL
  实时数仓 → Flink SQL
  实时大屏 → ksqlDB
  已有 Kafka 生态 → Kafka Streams + ksqlDB
```

---

## 二十二、生产部署模式

### 22.1 部署拓扑

```
生产部署模式：
  模式一：嵌入应用（推荐）
    微服务 A（Kafka Streams 库）
    微服务 B（Kafka Streams 库）
    → 无独立集群，复用 Kafka

  模式二：独立流处理集群
    Kafka Streams 集群（多个实例）
    → 适合需要独立扩缩容的场景

  模式三：ksqlDB 集群
    ksqlDB Server 1
    ksqlDB Server 2
    → SQL 化流处理，适合非 Java 团队
```

### 22.2 生产 Checklist

| 检查项 | 说明 |
|--------|------|
| 并行度 | 实例数 × 线程数 = 分区数 |
| 状态目录 | SSD 独立磁盘 |
| 精确一次 | 关键链路 `exactly_once_v2` |
| 监控 | Kafka Lag + Streams Metrics |
| 容错 | 消费者组自动故障转移 |
| 拓扑变更 | 停机迁移 + 状态 store 版本管理 |
| 错误处理 | dead-letter topic + 重试策略 |
| 窗口配置 | 正确设置 grace period |
| 交互查询 | 查询服务与流处理分开部署 |

---

## 窗口操作详解

### 四种窗口类型

| 窗口类型 | 说明 | 适用场景 |
|----------|------|----------|
| Tumbling | 固定大小不重叠 | 每分钟聚合 |
| Hopping | 固定大小可重叠 | 滑动平均 |
| Sliding | 基于事件时间滑动 | 连续事件检测 |
| Session | 基于活跃会话 | 用户行为分析 |

### 窗口操作示例

```java
// 滚动窗口：每5分钟统计一次
KTable<Windowed<String>, Long> counts = orders
    .groupByKey()
    .windowedBy(TimeWindows.ofSizeWithNoGrace(Duration.ofMinutes(5)))
    .count();

// 滑动窗口：每1分钟滑动，窗口大小5分钟
KTable<Windowed<String>, Double> slidingAvg = orders
    .groupByKey()
    .windowedBy(TimeWindows.ofSizeWithNoGrace(Duration.ofMinutes(5))
        .advanceBy(Duration.ofMinutes(1)))
    .aggregate(
        () -> new AvgInitializer(),
        (key, value, agg) -> agg.add(value),
        Materialized.as("sliding-avg-store")
    );

// 会话窗口：30分钟超时
KTable<Windowed<String>, Long> sessions = orders
    .groupByKey()
    .windowedBy(SessionWindows.ofInactivityGapWithNoGrace(Duration.ofMinutes(30)))
    .count();
```

## Join 操作详解

### 三种 Join 类型

```mermaid
flowchart LR
    KStream1[KStream A] --> JOIN[Join]
    KStream2[KStream B] --> JOIN
    KTable1[KTable A] --> JOIN
    KTable2[KTable B] --> JOIN
    JOIN --> RESULT[结果]
```

```java
// KStream-KStream Join（窗口内关联）
KStream<String, Order> orders = ...;
KStream<String, Payment> payments = ...;

KStream<String, OrderWithPayment> joined = orders.join(
    payments,
    (order, payment) -> new OrderWithPayment(order, payment),
    JoinWindows.ofTimeDifferenceWithNoGrace(Duration.ofMinutes(5)),
    StreamJoined.with(Serdes.String(), orderSerde, paymentSerde)
);

// KTable-KTable Join（维度关联）
KTable<String, Order> orders = ...;
KTable<String, Customer> customers = ...;

KTable<String, OrderWithCustomer> enriched = orders.join(
    customers,
    (order, customer) -> new OrderWithCustomer(order, customer)
);

// KStream-KTable Join（流与维度表关联）
KStream<String, Order> orderStream = ...;
KTable<String, Product> productTable = ...;

KStream<String, OrderWithProduct> enrichedStream = orderStream.join(
    productTable,
    (order, product) -> new OrderWithProduct(order, product)
);
```

| Join 类型 | 缓存要求 | 窗口要求 | 适用场景 |
|-----------|----------|----------|----------|
| KStream-KStream | 需要 | 必须 | 事件关联 |
| KTable-KTable | 需要 | 不需要 | 维度关联 |
| KStream-KTable | 不需要 | 不需要 | 流与维度表 |

## State Store 详解

### State Store 类型

| 类型 | 存储位置 | 特点 | 适用场景 |
|------|----------|------|----------|
| RocksDB | 本地磁盘 | 持久化、大容量 | 有状态计算 |
| In-Memory | 内存 | 快速、易失 | 临时计算 |
| Queryable | 可查询 | 支持交互查询 | 实时服务 |

### Changelog 与容错

```mermaid
flowchart TB
    STREAM[流处理] --> STATE[State Store]
    STATE --> CHANGELOG[Changelog Topic]
    CHANGELOG --> KAFKA[Kafka]
    KAFKA --> RECOVERY[故障恢复]
    RECOVERY --> STATE
```

```java
// 自定义 State Store
StateStoreSupplier<String, String> storeSupplier = Stores.keyValueStoreBuilder(
    Stores.persistentKeyValueStore("my-store"),
    Serdes.String(),
    Serdes.String()
).withLoggingEnabled(changelogConfig)  // 启用 changelog
 .withCachingEnabled()  // 启用缓存
 .build();
```

## Exactly-Once 语义（EOS）

### EOS 实现原理

```text
Kafka Streams EOS 流程：
  1. 开启事务（beginTransaction）
  2. 读取输入消息（consume）
  3. 处理消息（process）
  4. 写入输出（produce）
  5. 写入 State Store（commit）
  6. 提交事务（commitTransaction）

保证：
  - 输入-处理-输出原子性
  - 无重复消费
  - 无数据丢失
```

```java
// EOS 配置
Properties props = new Properties();
props.put(StreamsConfig.PROCESSING_GUARANTEE_CONFIG, 
    StreamsConfig.EXACTLY_ONCE_V2);  // 推荐
props.put(StreamsConfig.producerPrefix(ProducerConfig.TRANSACTIONAL_ID_CONFIG), 
    "streams-app-1");
```

| 语义级别 | 说明 | 性能 | 适用场景 |
|----------|------|------|----------|
| AT_LEAST_ONCE | 可能重复 | 高 | 一般场景 |
| EXACTLY_ONCE | 无重复 | 中 | 关键业务 |
| EXACTLY_ONCE_V2 | 优化版EOS | 中高 | 推荐生产 |

## ksqlDB 实战

### ksqlDB 常用 SQL

```sql
-- 创建流
CREATE STREAM orders_stream (
    order_id VARCHAR KEY,
    user_id VARCHAR,
    amount DOUBLE,
    event_time TIMESTAMP
) WITH (
    KAFKA_TOPIC = 'orders',
    VALUE_FORMAT = 'JSON',
    TIMESTAMP = 'event_time'
);

-- 创建表（聚合）
CREATE TABLE order_counts AS
    SELECT user_id, COUNT(*) AS order_count
    FROM orders_stream
    WINDOW TUMBLING (SIZE 5 MINUTES)
    GROUP BY user_id
    EMIT CHANGES;

-- 连接流和表
CREATE STREAM enriched_orders AS
    SELECT o.user_id, o.amount, u.user_name
    FROM orders_stream o
    JOIN users_table u ON o.user_id = u.user_id
    EMIT CHANGES;

-- 创建推送查询
CREATE PUSH QUERY AS
    SELECT * FROM order_counts
    WHERE order_count > 10
    EMIT CHANGES;
```

### ksqlDB vs Kafka Streams

| 维度 | ksqlDB | Kafka Streams |
|------|--------|---------------|
| 语言 | SQL | Java/Scala |
| 部署 | 独立集群 | 嵌入应用 |
| 学习曲线 | 低 | 中 |
| 灵活性 | 中 | 高 |
| 适用 | 非Java团队 | Java团队 |

## 与其他板块的关系

- Kafka 基础见「[Kafka](./Kafka.md)」；
- Flink 对比见「[Apache Flink 流处理](./ApacheFlink流处理.md)」；
- Schema（Avro/Protobuf）见「[Schema Registry 与消息序列化](./SchemaRegistry与消息序列化.md)」；
- 实时数仓见「[云上数仓与大数据生态](./云上数仓与大数据生态.md)」。

> 一句话：**Kafka Streams = 库形态（零集群）+ KStream/KTable 抽象 + RocksDB 状态（changelog 备份）+ EOS 事务；选型先看「形态（应用内轻量→Kafka Streams，独立平台→Flink）」，再定「编程（Java DSL→Streams，SQL→ksqlDB）」，最后配「并行度=分区数 + 状态磁盘 + 监控」**。

---

## 六、Kafka Streams DSL 详解

### 6.1 KStream 操作（事件流）

```java
StreamsBuilder builder = new StreamsBuilder();
KStream<String, Order> orders = builder.stream("orders");

// 过滤 + 映射
KStream<String, Order> bigOrders = orders
    .filter((key, order) -> order.getAmount() > 1000)
    .mapValues(order -> {
        order.setStatus("HIGH_VALUE");
        return order;
    });

// 分组聚合
KTable<String, Long> countByUser = orders
    .groupBy((key, order) -> order.getUserId())
    .count();

// 窗口聚合
KTable<Windowed<String>, Long> minuteCount = orders
    .groupBy((key, order) -> order.getUserId())
    .windowedBy(TimeWindows.ofSizeWithNoGrace(Duration.ofMinutes(1)))
    .count();
```

### 6.2 KTable 操作（变更日志表）

```java
// KTable = 同 key 最新值（物化视图）
KTable<String, UserProfile> profiles = builder.table("user-profiles");

// KStream + KTable Join（富化）
KStream<String, EnrichedOrder> enriched = orders
    .join(profiles,
        (order, profile) -> new EnrichedOrder(order, profile),
        Joined.with(Serdes.String(), orderSerde, profileSerde)
    );

// GlobalKTable Join（小维表，全量广播）
KTable<String, Product> products = builder.globalTable("products");
KStream<String, OrderWithProduct> withProduct = orders
    .join(products,
        (order, product) -> new OrderWithProduct(order, product),
        Joined.with(Serdes.String(), orderSerde, productSerde)
    );
```

### 6.3 窗口类型详解

| 窗口 | 语义 | 代码示例 |
|------|------|----------|
| Tumbling | 固定不重叠 | `TimeWindows.ofSizeWithNoGrace(Duration.ofMinutes(5))` |
| Hopping | 固定可滑动 | `TimeWindows.ofSizeWithNoGrace(Duration.ofMinutes(5)).advanceBy(Duration.ofMinutes(1))` |
| Sliding | 区间滑动（Join 用） | `JoinWindows.ofTimeDifferenceWithNoGrace(Duration.ofMinutes(5))` |
| Session | 活跃间隔 | `SessionWindows.ofInactivityGapAndGrace(Duration.ofMinutes(5), Duration.ofMinutes(1))` |

---

## 七、ksqlDB 高级特性

### 7.1 流式查询

```sql
-- 创建流
CREATE STREAM page_views (
    user_id VARCHAR KEY,
    page_id VARCHAR,
    view_time TIMESTAMP
) WITH (KAFKA_TOPIC='page_views', VALUE_FORMAT='AVRO');

-- 持续聚合（物化视图）
CREATE TABLE page_view_stats AS
    SELECT page_id, COUNT(*) AS view_count
    FROM page_views
    WINDOW TUMBLING (SIZE 5 MINUTES)
    GROUP BY page_id
    EMIT CHANGES;

-- 窗口连接（流-流 Join）
CREATE STREAM enriched_clicks AS
    SELECT c.user_id, c.page_id, u.name, u.age
    FROM clicks c
    JOIN users u ON c.user_id = u.user_id
    WITHIN 5 MINUTES
    EMIT CHANGES;
```

### 7.2 Push Query vs Pull Query

| 类型 | 说明 | 适用 |
|------|------|------|
| Push Query | 持续推送结果（EMIT CHANGES） | 实时大屏 |
| Pull Query | 一次性查询当前状态 | 交互式查询 |

```sql
-- Pull Query（查当前物化视图）
SELECT * FROM page_view_stats WHERE page_id = 'home' EMIT CHANGES;

-- Pull Query（一次性查询，类似 SQL）
SELECT * FROM page_view_stats WHERE page_id = 'home';
```

### 7.3 UDF（用户自定义函数）

```java
// 注册 UDF
@UdfDescription(name = "parse_url", ...)
public class ParseUrlUdf {
    @Udf
    public String parseUrl(String url, String part) {
        // 自定义解析逻辑
    }
}
```

```sql
-- 使用 UDF
CREATE FUNCTION parse_url AS 'com.example.ParseUrlUdf';
SELECT parse_url(url, 'host') AS host FROM urls;
```

---

## 八、Kafka Streams vs Flink 深度对比

| 维度 | Kafka Streams | Flink |
|------|---------------|-------|
| 部署 | 库嵌入应用（零集群） | 独立集群（需部署） |
| 状态存储 | RocksDB + changelog | RocksDB / 堆内存 / 外部存储 |
| 精确一次 | 事务（exactly_once_v2） | Checkpoint（exactly-once） |
| 窗口 | 4种（Tumbling/Hopping/Sliding/Session） | 丰富（Event/Processing/Ingestion） |
| 水位线 | 基于时间戳（简单） | 自定义水位线策略（灵活） |
| 复杂事件处理 | 有限 | 强（CEP 库） |
| 背压 | 依赖 Kafka | 反压机制（流量控制） |
| 批流一体 | 不支持 | 原生支持 |
| SQL | ksqlDB | Flink SQL |
| 适用规模 | 中小（应用内处理） | 大（独立平台） |

---

## 九、Kafka Streams 生产最佳实践

| 维度 | 建议 |
|------|------|
| 并行度 | 实例数 × 线程数 = 分区数 |
| 状态目录 | 用 SSD（RocksDB 写磁盘） |
| 精确一次 | 关键链路 `exactly_once_v2` |
| 监控 | Kafka Lag + Streams Metrics |
| 容错 | 消费者组自动故障转移 |
| 拓扑变更 | 停机迁移 + 状态 store 版本管理 |
| 错误处理 | dead-letter topic + 重试策略 |

---

## 十、与其他板块的关系（扩展）

- Kafka 基础见「[Kafka](./Kafka.md)」；
- Flink 对比见「[Apache Flink 流处理](./ApacheFlink流处理.md)」；
- Schema（Avro/Protobuf）见「[Schema Registry 与消息序列化](./SchemaRegistry与消息序列化.md)」；
- 实时数仓见「[云上数仓与大数据生态](./云上数仓与大数据生态.md)」；
- 对比 Spark Streaming 见「[Apache Spark 批处理](./ApacheSpark批处理.md)」；
- ClickHouse 实时分析见「[ClickHouse](./ClickHouse.md)」。

---

## 十一、Kafka Streams窗口操作配置

### 11.1 窗口操作配置

```java
// 窗口操作配置
// 滚动窗口（Tumbling Window）
KStream<String, Order> orderStream = builder.stream("orders");

KTable<Windowed<String>, Double> tumblingWindow = orderStream
    .groupByKey()
    .windowedBy(TimeWindows.ofSizeWithNoGrace(Duration.ofMinutes(5)))
    .aggregate(
        () -> 0.0,
        (key, order, value) -> value + order.getAmount(),
        Materialized.as("tumbling-window-store")
    );

// 跳跃窗口（Hopping Window）
KTable<Windowed<String>, Double> hoppingWindow = orderStream
    .groupByKey()
    .windowedBy(TimeWindows.ofSizeWithNoGrace(Duration.ofMinutes(10))
        .advanceBy(Duration.ofMinutes(5)))
    .aggregate(
        () -> 0.0,
        (key, order, value) -> value + order.getAmount(),
        Materialized.as("hopping-window-store")
    );

// 滑动窗口（Sliding Window）
KTable<Windowed<String>, Double> slidingWindow = orderStream
    .groupByKey()
    .windowedBy(TimeWindows.ofSizeWithNoGrace(Duration.ofMinutes(5)))
    .aggregate(
        () -> 0.0,
        (key, order, value) -> value + order.getAmount(),
        Materialized.as("sliding-window-store")
    );

// 会话窗口（Session Window）
KTable<Windowed<String>, Long> sessionWindow = orderStream
    .groupByKey()
    .windowedBy(SessionWindows.ofGapWithNoGrace(Duration.ofMinutes(10)))
    .count(Materialized.as("session-window-store"));
```

### 11.2 窗口操作最佳实践

```text
窗口操作最佳实践：

  窗口类型选择：
    滚动窗口：固定时间窗口，不重叠
    跳跃窗口：固定时间窗口，可重叠
    滑动窗口：基于时间戳，可重叠
    会话窗口：基于活动间隔，动态大小

  窗口大小设置：
    实时场景：1-5分钟
    准实时：5-30分钟
    离线场景：1小时-1天

  容错配置：
    grace period：处理延迟数据
    changelog：状态存储备份
    事务：精确一次保证

  监控指标：
    窗口数量：当前活跃窗口数
    窗口延迟：窗口处理延迟
    窗口大小：窗口时间范围
```

## 十二、Kafka Streams Join操作配置

### 12.1 Join操作配置

```java
// Join操作配置
// KStream-KStream Join
KStream<String, Order> orderStream = builder.stream("orders");
KStream<String, Customer> customerStream = builder.stream("customers");

KStream<String, OrderWithCustomer> joined = orderStream.join(
    customerStream,
    (order, customer) -> new OrderWithCustomer(order, customer),
    Joined.with(Serdes.String(), orderSerde, customerSerde)
);

// KStream-GlobalKTable Join
KStream<String, Order> orderStream = builder.stream("orders");
GlobalKTable<String, Product> productTable = builder.globalTable("products");

KStream<String, OrderWithProduct> joined = orderStream.join(
    productTable,
    (order, product) -> new OrderWithProduct(order, product),
    Joined.with(Serdes.String(), orderSerde)
);

// KStream-KTable Join
KStream<String, Order> orderStream = builder.stream("orders");
KTable<String, Inventory> inventoryTable = builder.table("inventory");

KStream<String, OrderWithInventory> joined = orderStream.join(
    inventoryTable,
    (order, inventory) -> new OrderWithInventory(order, inventory),
    Joined.with(Serdes.String(), orderSerde)
);
```

### 12.2 Join操作最佳实践

```text
Join操作最佳实践：

  Join类型选择：
    KStream-KStream：两个流Join
    KStream-GlobalKTable：流与全局表Join
    KStream-KTable：流与表Join

  数据准备：
    分区键：确保相同Key路由到相同分区
    数据格式：统一数据格式
    时间对齐：处理时间对齐

  性能优化：
    缓存策略：合理设置缓存
    并行度：增加并行度
    状态存储：使用SSD

  容错处理：
    重试机制：失败重试
    死信队列：失败消息处理
    监控告警：Join失败告警
```

## 十三、Kafka Streams State Store配置

### 13.1 State Store配置

```java
// State Store配置
// RocksDB State Store
StateStoreBuilder<KeyValueStore<String, Order>> storeBuilder = Stores.keyValueStoreBuilder(
    Stores.persistentKeyValueStore("order-store"),
    Serdes.String(),
    orderSerde
).withCachingEnabled()
  .withLoggingEnabled(new HashMap<>());  // 启用changelog

// 内存State Store
StateStoreBuilder<KeyValueStore<String, Order>> memoryStoreBuilder = Stores.keyValueStoreBuilder(
    Stores.inMemoryKeyValueStore("memory-order-store"),
    Serdes.String(),
    orderSerde
);

// 窗口State Store
StateStoreBuilder<WindowStore<String, Double>> windowStoreBuilder = Stores.windowStoreBuilder(
    Stores.persistentWindowStore("window-order-store",
        Duration.ofMinutes(10),
        Duration.ofMinutes(5),
        false),
    Serdes.String(),
    Serdes.Double()
);

// 使用State Store
KStream<String, Order> stream = builder.stream("orders");
KTable<String, Order> table = stream.groupByKey().aggregate(
    () -> null,
    (key, order, value) -> order,
    Materialized.as("order-store")
);
```

### 13.2 State Store最佳实践

```text
State Store最佳实践：

  存储类型选择：
    RocksDB：持久化存储，支持大数据
    内存存储：高性能，小数据量
    窗口存储：时间窗口数据

  配置优化：
    缓存：启用缓存提高性能
    changelog：启用数据备份
    刷写策略：配置刷写频率

  监控指标：
    存储大小：当前存储大小
    读写性能：读写延迟
    刷写频率：刷写次数

  运维管理：
    状态迁移：版本升级迁移
    数据清理：定期清理旧数据
    备份恢复：定期备份数据
```

## 十四、Kafka Streams Exactly-Once语义配置

### 14.1 Exactly-Once配置

```java
// Exactly-Once配置
Properties props = new Properties();
props.put(StreamsConfig.APPLICATION_ID_CONFIG, "my-stream-app");
props.put(StreamsConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
props.put(StreamsConfig.PROCESSING_GUARANTEE_CONFIG, 
    StreamsConfig.EXACTLY_ONCE_V2);  // 启用Exactly-Once

// 事务配置
props.put(StreamsConfig.producerPrefix(ProducerConfig.TRANSACTIONAL_ID_CONFIG), 
    "my-stream-app-transaction");
props.put(StreamsConfig.producerPrefix(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG), true);

// 消费者配置
props.put(ConsumerConfig.ISOLATION_LEVEL_CONFIG, "read_committed");

// 创建拓扑
StreamsBuilder builder = new StreamsBuilder();
KStream<String, Order> stream = builder.stream("orders");

// 处理数据（Exactly-Once保证）
stream.mapValues(order -> order.withAmount(order.getAmount() * 1.1))
    .to("processed-orders");

KafkaStreams streams = new KafkaStreams(builder.build(), props);
streams.start();
```

### 14.2 Exactly-Once最佳实践

```text
Exactly-Once最佳实践：

  事务配置：
    transactional.id：唯一事务ID
    enable.idempotence：启用了幂等
    isolation.level：read_committed

  处理保证：
    exactly_once_v2：推荐，最新版本
    exactly_once_beta：旧版本，兼容性好
    at_least_once：最低保证

  性能影响：
    事务开销：10-20%性能下降
    幂等开销：5-10%性能下降
    事务大小：限制16MB

  监控指标：
    事务提交次数
    事务回滚次数
    事务超时次数
```

## 十五、ksqlDB流式SQL配置

### 15.1 ksqlDB配置

```sql
-- ksqlDB配置
-- 创建流
CREATE STREAM orders_stream (
    order_id VARCHAR KEY,
    customer_id VARCHAR,
    amount DOUBLE,
    timestamp BIGINT
) WITH (
    KAFKA_TOPIC = 'orders',
    VALUE_FORMAT = 'JSON'
);

-- 创建表
CREATE TABLE customer_table (
    customer_id VARCHAR PRIMARY KEY,
    name VARCHAR,
    email VARCHAR
) WITH (
    KAFKA_TOPIC = 'customers',
    VALUE_FORMAT = 'JSON'
);

-- 创建物化视图
CREATE TABLE order_summary AS
SELECT 
    customer_id,
    COUNT(*) AS order_count,
    SUM(amount) AS total_amount
FROM orders_stream
GROUP BY customer_id
EMIT CHANGES;

-- 查询物化视图
SELECT * FROM order_summary;

-- 创建流处理管道
CREATE STREAM order_processor AS
SELECT 
    o.order_id,
    o.customer_id,
    o.amount,
    c.name AS customer_name
FROM orders_stream o
JOIN customer_table c ON o.customer_id = c.customer_id
EMIT CHANGES;
```

### 15.2 ksqlDB最佳实践

```text
ksqlDB最佳实践：

  数据建模：
    流：append-only事件流
    表：可更新的实体表
    物化视图：预计算聚合

  查询优化：
    WHERE过滤：减少数据量
    GROUP BY聚合：预计算结果
    JOIN操作：关联多个流/表

  性能优化：
    分区策略：合理分区
    并行度：增加并行度
    缓存：启用查询缓存

  运维管理：
    监控查询性能
    管理流/表生命周期
    备份恢复数据
```

---

## 十二、速查表（扩展）

| 项 | 结论 |
|----|------|
| 类型 | Kafka 官方轻量流处理库 |
| 形态 | 库嵌入应用（零集群） |
| 核心抽象 | KStream / KTable / GlobalKTable |
| 状态存储 | RocksDB + changelog 备份 |
| 精确一次 | 事务（exactly_once_v2） |
| SQL 引擎 | ksqlDB（流式 SQL + 物化视图） |
| 窗口 | Tumbling / Hopping / Sliding / Session |
| 交互查询 | State Store 物化视图 REST 查询 |
| 适用场景 | 服务内实时聚合/清洗/Join |
| 替代方案 | Flink（复杂流处理）/ Spark（批流一体） |
| 一句话 | 「零运维的轻量流处理——库形态 + KStream/KTable + RocksDB 状态」 |