# 05 ShardingSphere 实战

> 前四章是方法论，本章用主流中间件 **Apache ShardingSphere** 把它们落到配置与代码。ShardingSphere 提供两种接入形态：**Sharding-JDBC**（客户端 jar，无中心节点，性能好）与 **Sharding-Proxy**（独立代理，对应用透明，异构语言友好）。
> 中间件级的安装/接入细节见 [基础知识/中间件/分库分表ShardingSphere](../基础知识/中间件/分库分表ShardingSphere.md)，本文聚焦**工程配置与关键特性实战**。

---

## 一、核心概念

| 概念 | 说明 |
|------|------|
| 逻辑表（logicTable） | 应用看到的表名，如 `orders` |
| 真实表（actualTable） | 物理分片，如 `orders_0` ... `orders_63` |
| 分片键（shardingKey） | 路由依据的列，如 `user_id` |
| 分片算法（shardingAlgorithm） | 决定行落到哪个真实表 |
| 分片策略（shardingStrategy） | 分库策略 + 分表策略 |
| 绑定表（bindingTable） | 同分片键的父子表，JOIN 本地化 |
| 广播表（broadcastTable） | 每个分片都存的字典/小表 |

---

## 二、Sharding-JDBC 分库分表配置（YAML）

```yaml
spring:
  shardingsphere:
    datasource:
      names: ds0, ds1
      ds0: { type: com.zaxxer.hikari.HikariDataSource, jdbc-url: jdbc:mysql://db0:3306/order, username: ..., password: ... }
      ds1: { type: com.zaxxer.hikari.HikariDataSource, jdbc-url: jdbc:mysql://db1:3306/order, username: ..., password: ... }

    rules:
      sharding:
        tables:
          orders:
            actual-data-nodes: ds${0..1}.orders_${0..31}   # 2库 × 32表 = 64分片
            database-strategy:
              standard:
                sharding-column: user_id
                sharding-algorithm-name: db-mod
            table-strategy:
              standard:
                sharding-column: user_id
                sharding-algorithm-name: tbl-mod
        sharding-algorithms:
          db-mod:  { type: MOD, props: { sharding-count: 2 } }
          tbl-mod: { type: MOD, props: { sharding-count: 32 } }
```

💡 上面用 `user_id` 既做分库又做分表（同键）。若分库用 `user_id % 2`、分表用 `order_id % 32` 则属不同键，需保证查询常带两者。

---

## 三、分布式主键配置

```yaml
spring:
  shardingsphere:
    rules:
      sharding:
        tables:
          orders:
            key-generate-strategy:
              column: id
              key-generator-name: snowflake
        key-generators:
          snowflake:
            type: SNOWFLAKE
            props:
              worker-id: 1        # 集群内唯一，避免 ID 冲突
```

👉 算法选型回顾见 [02 章](../分库分表与数据迁移/02-分布式主键与读写分离.md)。生产建议用号段（LEAF_SEGMENT）或雪花，按业务选。

---

## 四、读写分离（每分片 1 主 N 从）

```yaml
spring:
  shardingsphere:
    rules:
      readwrite-splitting:
        data-sources:
          ds0:
            type: Static
            props:
              write-data-source-name: ds0_master
              read-data-source-names: ds0_slave0, ds0_slave1
            load-balancer-name: round-robin
        load-balancers:
          round-robin: { type: ROUND_ROBIN }
```

- 默认读走从库；需强制走主时用 **Hint**（见下）。
- 主从延迟导致的脏读问题，见 [02 章 3.2](../分库分表与数据迁移/02-分布式主键与读写分离.md#三读写分离每分片仍配主从)。

---

## 五、绑定表与广播表（解决跨分片 JOIN）

```yaml
spring:
  shardingsphere:
    rules:
      sharding:
        binding-tables:
          - orders, order_item      # 都按 order_id 分片 → JOIN 在单分片内完成
        broadcast-tables:
          - province_dict           # 字典表，每个分片都存，避免跨片 JOIN
```

- **绑定表**：父子表按相同分片键分 → 关联查询不跨片，性能最佳。
- **广播表**：小字典表全量复制到每个分片 → 任意分片都能本地 JOIN。

---

## 六、Hint 强制路由（绕过分片键）

当查询不带分片键、但你知道目标分片时，用 Hint 显式指定（也用于强制走主库）：

```java
try (HintManager hint = HintManager.getInstance()) {
    hint.addTableShardingValue("orders", "user_id", 12345); // 强制路由到该分片
    hint.setWriteRouteOnly();                               // 读也走主库
    List<Order> list = orderMapper.selectByStatus(PAID);
}
```

---

## 七、分页 / 聚合的坑与应对

ShardingSphere 对 `LIMIT/OFFSET`、聚合（`COUNT/SUM/MAX`）、`ORDER BY` 的处理：

| 操作 | 行为 | 风险 |
|------|------|------|
| `LIMIT 10` | 各分片取 10 条，内存归并 | 安全但非全局排序 |
| `ORDER BY + LIMIT` | 各分片排序取 N，归并 | 全局 Top-N 正确 |
| 深分页 `LIMIT 100000,10` | 各分片取 100010 再归并 | **极慢、IO 爆炸** |
| `COUNT(*)` | 各分片 COUNT 汇总 | 正确但慢 |
| `MAX/MIN` | 各分片取极值再比 | 正确 |

📌 **深分页救星**：改用**游标/连续 ID 翻页**：

```sql
-- 避免 LIMIT 100000,10
SELECT * FROM orders WHERE user_id=? AND id > :last_id ORDER BY id LIMIT 10;
```

---

## 八、ShardingSphere-Proxy（异构语言 / 统一管控）

- 独立进程，伪装成 MySQL/PostgreSQL 服务，应用无感知。
- 适合非 Java 技术栈、或希望分片规则集中治理的场景。
- 代价：多一跳网络；但运维简单、语言无关。

---

## 九、选型小结

| 形态 | 优点 | 缺点 | 适用 |
|------|------|------|------|
| Sharding-JDBC | 无中心、性能最好、配置简单 | 仅 Java、规则散在应用 | 纯 Java 主流 |
| Sharding-Proxy | 语言无关、集中治理 | 多一跳、需运维 | 异构栈/强管控 |

👉 下一篇：[06 典型场景与设计反模式](06-典型场景与设计反模式.md)
