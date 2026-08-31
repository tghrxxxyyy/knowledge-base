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

---

## 十、数据加密与脱敏（合规必备）

ShardingSphere 内置 **数据加密规则**，对敏感字段（手机号/身份证/密码）自动加解密，且支持"明文+密文"双写平滑迁移：

```yaml
spring:
  shardingsphere:
    rules:
      encrypt:
        tables:
          user:
            columns:
              phone:
                cipher-column: phone_cipher      # 密文列
                plain-column: phone              # 明文列(迁移期保留)
                encryptor-name: aes-encryptor
        encryptors:
          aes-encryptor:
            type: AES
            props:
              aes-key-value: ${ENCRYPT_KEY}       # 从环境变量注入，勿硬编码
```

- **平滑迁移**：先双写明文+密文，验证后切到只读密文、删明文列。
- 合规场景（等保/国密）必备，详见 [安全工程/05-数据安全与密码学基础](../安全工程/05-数据安全与密码学基础.md)。

---

## 十一、分布式事务集成（ShardingSphere + Seata）

ShardingSphere 可对接 Seata 做跨分片事务，把 TCC/Saga 托管起来：

```yaml
spring:
  shardingsphere:
    rules:
      sharding:
        # ... 分片规则
    transaction:
      default-type: SEATA
      provider-type: SEATA
```

- 应用侧用 `@GlobalTransactional`（Seata）标注跨分片事务，ShardingSphere 负责 SQL 路由，Seata 负责全局事务协调。
- 落地细节见 [基础知识/中间件/分布式事务Seata](../基础知识/中间件/分布式事务Seata.md) 与 [04 章](../分库分表与数据迁移/04-分布式事务与一致性.md)。

---

## 十二、弹性伸缩（ShardingSphere-Scaling）

在线把分片数从 N 扩到 M，自动化"存量迁移 + 增量同步 + 一致性校验"：

```yaml
spring:
  shardingsphere:
    scaling:
      default-algorithm-name: AUTO
      block-size: 1000
```

| 阶段 | 工具行为 |
|------|----------|
| 存量迁移 | 按新分片规则分批迁老数据 |
| 增量追平 | CDC 监听老库 binlog 同步到新分片 |
| 一致性校验 | 行级/哈希分桶比对 |
| 流量切换 | 校验通过后切流，老分片下线 |

> 自建方案本质相同（见 [03 章](../分库分表与数据迁移/03-数据迁移双写与平滑扩容.md)）。优先翻倍预案（N→2N）可大幅降低迁移量。

---

## 十三、影子库压测（Shadow 规则）

上线前用影子库承接复制流量，验证分片路由与性能，不污染生产：

```yaml
spring:
  shardingsphere:
    rules:
      shadow:
        data-sources:
          shadow-ds0:
            source-data-source-name: ds0
            shadow-data-source-name: ds0-shadow
        tables:
          orders:
            dataSourceNames: shadow-ds0
            shadow-algorithm-names: simple-note-algorithm
```

- 压测流量打标后自动路由到影子库，生产库零影响。
- 配合 [03 章影子流量](../分库分表与数据迁移/03-数据迁移双写与平滑扩容.md#十二影子流量验证新链路不生效) 思路。

---

## 十四、排障：高频问题与定位

| 现象 | 可能原因 | 定位/修复 |
|------|----------|-----------|
| 路由到错误分片 | 分片算法与代码路由不一致 | 核对 `sharding-column` 与算法 |
| 全路由（广播所有分片） | 查询没带分片键 | 加 Hint 或改分片键 |
| 跨分片 JOIN 极慢 | 未设绑定表/广播表 | 配置绑定表或冗余 |
| 分页深翻页慢 | `LIMIT 100000,10` | 改游标翻页 |
| 连接数暴涨 | 分片多 × 连接池大 | 收敛连接池 + 连接复用 |
| 启动报算法名找不到 | `sharding-algorithm-name` 与定义不匹配 | 检查算法名一致性 |

> 排障心法：**先确认 SQL 实际路由到了哪些分片**（开 SQL 日志），再判断是路由错、缺键、还是跨片。

---

## 十五、配置陷阱（避免上线翻车）

| 陷阱 | 说明 | 正确做法 |
|------|------|----------|
| `actual-data-nodes` 表达式错 | `ds${0..1}.orders_${0..31}` 漏写导致分片缺失 | 表达式与真实表严格对应 |
| 算法名前后不一致 | 策略里引用 `db-mod` 但只定义了 `db_mod` | 命名全局唯一、仔细核对 |
| 分库分表用不同键无关联 | user_id 分库、order_id 分表，查询难兼顾 | 同键或编码关联（基因法） |
| 分布式主键未配 | 仍用自增，各分片冲突 | 配 `key-generate-strategy` |
| 生产硬编码密码/密钥 | 泄露风险 | 走配置中心/环境变量 |

---

## 十六、性能调优要点

| 维度 | 建议 |
|------|------|
| 连接池 | 分片多时单库连接数 × 分片数很大，用 Hikari 合理上限 + 复用 |
| 路由缓存 | 分片路由结果可缓存，减少重复计算 |
| 批量写入 | 同分片批量 `INSERT` 合并，减少网络往返 |
| 避免跨片事务 | 设计上让核心事务同分片，性能最优 |
| 监控 | 接入 ShardingSphere 的 metrics（路由分布/慢 SQL） |

```yaml
spring:
  shardingsphere:
    props:
      sql-show: false            # 生产关 SQL 日志，排障临时开
      max-connections-size-per-query: 1   # 控制单查询占用连接
```

---

## 十七、生产踩坑清单（深度版）

| 坑 | 现象 | 根因 | 修正 |
|----|------|------|------|
| 分片键漏配 | 全路由、比不分还慢 | 查询不带键 | Hint/改键 |
| 绑定表漏配 | JOIN 笛卡尔爆慢 | 缺绑定关系 | 配 binding-tables |
| 深分页拖垮 | 各分片取 10w+ 归并 | LIMIT 大 offset | 游标翻页 |
| 自增主键冲突 | 数据错乱 | 没配生成器 | 配 SNOWFLAKE/LEAF |
| 加密密钥硬编码 | 泄露/合规翻车 | 明文写配置 | 环境变量注入 |
| 影子库没隔离 | 压测污染生产 | 路由错 | 独立影子数据源 |

---

## 十八、ShardingSphere 实战速记口诀

```
逻辑表对真实表，分片键定路由向；
同键分库又分表，异键基因要编码；
绑定广播解 JOIN，深分页用游标翻；
主键全局不靠增，雪花号段配生成；
读写分离每片主，主从延迟走 Hint；
加密脱敏合规线，影子压测上线前；
调优先看路由分布，跨片事务要避免。
```

---

## 十九、版本与兼容性注意

| 维度 | 注意 |
|------|------|
| ShardingSphere 版本 | 4.x → 5.x 配置从 `orchestration` 大改为 `rules`，升级需重写配置 |
| Spring Boot 适配 | 5.x 用 `spring.shardingsphere.*`，注意 starter 包名与版本匹配 |
| 数据库版本 | MySQL 8.0 驱动 `com.mysql.cj.jdbc.Driver`，5.7 为旧驱动 |
| Proxy vs JDBC | 同一套规则，Proxy 多一跳、语言无关，JDBC 代码侵入小 |

> 版本落点也要写进 ADR（见 [技术选型 05](../技术选型/05-选型落地与治理.md)），它直接影响"能用哪些特性、踩哪些已知 bug"。

> 迁移/升级 ShardingSphere 本身也是一次"分库分表级"的变更，应按 [03 章](../分库分表与数据迁移/03-数据迁移双写与平滑扩容.md) 的灰度思路：先在测试库验证规则、再小流量、再全量。
