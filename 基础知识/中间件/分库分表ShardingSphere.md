# 分库分表 ShardingSphere

> 单表几千万行、写入开始变慢、DB 连接打满——这时候就该「分库分表」了。本文讲清 **ShardingSphere 怎么把分片做得对业务透明**，以及分片键怎么选、有哪些必踩的坑。
> 开源参考：[apache/shardingsphere](https://github.com/apache/shardingsphere)（Java，Apache-2.0，"Database Plus" 数据库增强层，提供 Sharding-JDBC / Sharding-Proxy 双接入端，5.5.x 活跃，49k+ commits，全球 1.9 万+ 项目采用）。

---

## 一、为什么分库分表

| 瓶颈 | 表现 |
|------|------|
| 单表数据量过大 | 索引树深、查询慢、DDL 卡死 |
| 单库连接 / CPU 打满 | 高并发下连接数瓶颈，一损俱损 |
| 单机容量上限 | 磁盘 / 内存不够 |

**垂直分库**：按业务拆（订单库、用户库、商品库）。
**垂直分表**：大表拆小表（热点字段 / 冗余字段分离）。
**水平分表 / 分库**：同一张表按分片键拆到多个表 / 库（本文重点）。

---

## 二、ShardingSphere 是什么：Database Plus

ShardingSphere 不是新数据库，而是**构建在异构数据库之上的增强层**——通过分布式 SQL 最大化现有数据库能力，提供统一访问 + 分片 / 读写分离 / 加密 / 分布式事务。

### 两种接入端

| 接入端 | 形态 | 优点 | 缺点 | 适用 |
|--------|------|------|------|------|
| **Sharding-JDBC** | JAR 嵌入应用，增强 JDBC | 直连无网络跳转、性能高、零部署 | 仅 Java、升级要发版 | 中小规模、Spring Boot 单体 |
| **Sharding-Proxy** | 独立透明代理，兼容 MySQL/PG 协议 | 多语言、DBA 友好、集中管控 | 多一跳网络、要部署 | 大规模、多语言、云原生 |

> 5.x 后包名从 `io.shardingsphere` 变为 `org.apache.shardingsphere`。

---

## 三、核心执行流程（对业务透明的关键）

```mermaid
flowchart LR
    A[应用 SQL] --> B[SQL 解析 ANTLR4→AST]
    B --> C[路由引擎: 算分片键→定位库表]
    C --> D[SQL 改写: 逻辑表→真实表名]
    D --> E[执行引擎: 并发下发多节点]
    E --> F[归并引擎: 排序/分页/聚合]
    F --> G[统一 ResultSet]
```

五步：**解析 → 路由 → 改写 → 执行 → 归并**。应用写 `SELECT * FROM t_order WHERE user_id=?`，ShardingSphere 自动路由到 `ds_0.t_order_2` 并把多节点结果归并返回——业务像操作单表。

---

## 四、分片核心概念

### 4.1 分片键（最重要）

决定数据「去哪个库哪个表」的列。选择原则：

- **高基数**：取值多，才能均匀分散（别用 status 这种低基数列）。
- **查询高频**：绝大多数查询都带它，避免广播。
- **避免热点**：如按 `user_id` 取模，某大 V 数据集中怎么办？可用 `user_id` + 二级打散。
- **全局唯一 ID**：分片后单库唯一索引无法保证全局唯一 → 必须上**分布式 ID**（雪花算法）。

### 4.2 分片算法

- **Standard（标准）**：单分片键，`inline`（行表达式，如 `t_order_${order_id % 4}`）、`interval`（范围）。
- **Complex（复合）**：多分片键自定义。
- **Hint（强制）**：代码里用 `HintManager` 强制指定路由（无分片键查询时救急，如 `强制主库`）。

### 4.3 配置示例（Sharding-JDBC，YAML）

```yaml
spring:
  shardingsphere:
    datasource:
      names: ds0,ds1
      ds0: {type: HikariDataSource, jdbc-url: jdbc:mysql://localhost:3306/order_db_0, ...}
      ds1: {type: HikariDataSource, jdbc-url: jdbc:mysql://localhost:3306/order_db_1, ...}
    rules:
      sharding:
        tables:
          t_order:
            actual-data-nodes: ds${0..1}.t_order_${0..3}
            database-strategy:
              standard: {sharding-column: user_id, sharding-algorithm-name: db-hash}
            table-strategy:
              standard: {sharding-column: order_id, sharding-algorithm-name: tbl-hash}
        sharding-algorithms:
          db-hash: {type: HASH_MOD, props: {sharding-count: 2}}
          tbl-hash: {type: HASH_MOD, props: {sharding-count: 4}}
```

### 4.4 读写分离

```yaml
rules:
  readwrite-splitting:
    data-sources:
      ms_ds:
        type: Static
        props:
          write-data-source-name: ds_master
          read-data-source-names: ds_slave0,ds_slave1
        load-balancer-name: round_robin
```

支持 `Hint` 强制主库（写完立刻读，防主从延迟读到旧值）。

---

## 五、分布式事务

ShardingSphere 内置多种事务模式：

- **LOCAL**：单库本地事务（默认）。
- **XA**：基于数据库 XA 接口的 2PC，强一致但性能差。
- **Seata（BASE）**：集成 Seata AT，最终一致，性能好（见「分布式事务 Seata」篇）。

---

## 六、其他增强能力

- **数据加密 / 脱敏**：字段级透明加密（如手机号、身份证），查询自动解密，密钥可轮换。
- **影子库压测**：线上流量复制 / 打标到影子库，无感做全链路压测。
- **DistSQL**：用 SQL 动态管理分片规则（`SHOW SHARDING TABLE RULES;`），**无需重启应用**。
- **数据治理**：SQL 审计、流量控制、可观测性。

---

## 七、必踩的坑（生产血泪）

| 坑 | 说明 | 应对 |
|----|------|------|
| 无分片键查询 | `WHERE order_id=?` 但按 user_id 分库 → 全库广播，性能灾难 | 选高频查询列做分片键；或用冗余索引表 / ES 异构索引 |
| 跨分片 JOIN | 分片后两表不在同库，JOIN 失效 | 尽量同分片键让相关数据同库；否则应用层二次查询 / 宽表 |
| 跨分片分页 / 排序 / 聚合 | 归并在内存，深度分页极慢 | 避免深度翻页（`limit 1000000`）；用游标 / 业务游标；ES 承担搜索 |
| 分布式主键 | 单库唯一索引不保证全局唯一 | 雪花算法 / UUID / Leaf |
| 分布式事务 | 跨库事务不在一个本地事务 | 引入 XA / Seata |
| 扩容迁移 | 分片数变了，数据要重新分布 | 提前规划容量；用 ShardingSphere-Scaling 在线迁移 |
| SQL 兼容性 | 复杂 SQL（子查询、函数）支持有限 | 提前验证；简化 SQL |
| 分片键热点 | 大 V / 热点商家数据集中 | 组合分片键 + 打散 |

---

## 八、选型与决策

- **要不要分？** 单表 < 500 万、QPS 不高 → 先优化索引 / 读写分离，不急着分。分库分表是「最后手段」，复杂度高。
- **分片数怎么定？** 单表目标 500 万 ~ 1000 万行；按 3 年业务增长预估。
- **ShardingSphere vs MyCat**：ShardingSphere-JDBC 嵌入无独立节点、性能高；MyCat 是独立代理、运维集中。Java 栈首选 ShardingSphere。
- **分库分表 vs 换 NewSQL**：数据量极大且不想管分片，可考虑 TiDB / PolarDB-X（自动分片），但迁移成本高。

---

## 九、面试高频速查

- **ShardingSphere 两种接入端区别？** JDBC 嵌入应用无网络跳转性能高（仅 Java）；Proxy 透明代理多语言（多一跳）。
- **执行流程？** 解析 → 路由 → 改写 → 执行 → 归并。
- **分片键怎么选？** 高基数、查询高频、避免热点；分片后必须上分布式 ID。
- **无分片键查询怎么办？** 全库广播（性能差）；用冗余索引表 / ES 异构索引。
- **深度分页问题？** 归并内存，慢；用游标分页，别 limit 大 offset。
- **跨库事务？** 用 XA 或集成 Seata。
- **和 MyCat 比？** ShardingSphere-JDBC 无独立节点性能高，Java 栈首选。

---

## 十、与其他板块的关系

- 和「**基础知识/分布式事务 Seata**」：跨库事务走 Seata AT 模式。
- 和「**基础知识/MQ**」：分片后异构同步（如订单同步 ES）用 Canal + MQ。
- 和「**基础知识/MySQL**」：分库分表建立在 MySQL 之上，索引 / 慢 SQL 优化仍是基础。
