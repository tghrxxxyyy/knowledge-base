# Neo4j（图数据库）—— 关系的「一等公民」

> 把「实体间的关系」作为一等公民存储，专为多跳关联、路径查找、社群发现等场景而生。
> 适合：社交网络、知识图谱、推荐系统、反欺诈/反洗钱（关系链）、供应链/网络拓扑、最短路径。
> 不适合：强事务报表、结构化 CRUD（这些仍是关系型主场）。

---

## 一、为什么需要图数据库

关系型数据库靠「外键 + JOIN」重建实体关系。当关联深度 ≥ 3 跳（如「朋友的朋友」「风险传导链」），JOIN 数量指数增长、执行计划难优化、I/O 暴涨。

图数据库用 **节点(Node) + 关系(Relationship)** 显式建模，关系直接作为存储结构的一部分，遍历只跟随指针，**性能与路径长度相关、与总数据量弱相关**。

> 仓库 `github.com/neo4j/neo4j`：官方自述 "world's leading Graph Database"，Java/Scala 实现，Community 版 **GPLv3**，Enterprise 版闭源商业许可；8.5 万+ commits；支持 ACID。

---

## 二、核心数据模型（属性图 Property Graph）

| 要素 | 说明 |
|------|------|
| **Node（节点）** | 实体，如 人/公司/商品 |
| **Relationship（关系）** | 有方向、有类型、可带属性，如 `(:Person)-[:FRIEND]->(:Person)` |
| **Label（标签）** | 节点分类，如 `:Person`、`:Customer`，一节点可多标签 |
| **Property（属性）** | 键值对，节点和关系都能挂 |

```cypher
CREATE (p:Person {name:'张三', age:30, city:'北京'})
CREATE (p)-[:FRIEND {since:2020}]->(:Person {name:'李四'})
```

---

## 三、为什么快：原生图存储 + 免索引邻接

Neo4j 的核心秘密是 **Index-Free Adjacency（免索引邻接）**：

- 节点记录里**直接存指向其关系的指针链表**；关系记录里存起始/结束节点 ID 与前后关系指针。
- 遍历时：跟随节点记录的关系指针 → 跳到关系记录 → 再跳到下一个节点，O(1) 跳转。
- **不需要全局索引来查找关系**，避免了「先查索引再回表」的开销。

对比：关系型做 5 跳要 6 次 LEFT JOIN + 递归 CTE，性能差两个数量级；Neo4j 的 Cypher 一行搞定：

```cypher
MATCH (u1:User {name:'Alice'})-[:FRIEND*1..5]->(u2:User)
RETURN u2.name, length((u1)-[:FRIEND*1..5]->(u2)) AS hops
```

`*1..5` 表示 1 到 5 跳可变深度遍历，毫秒级返回。

---

## 四、Cypher 查询语言

Cypher 是「图领域的 SQL」，声明式模式匹配：

```cypher
MATCH (p1:Person {name:'张三'})-[:FRIEND]->(p2:Person)
WHERE p2.age > 25 AND p2.city = '北京'
RETURN p2.name, p2.age
ORDER BY p2.age DESC
```

- `MATCH`：定义图模式
- `WHERE`：过滤
- `RETURN`：投影
- 还支持 `CREATE`/`MERGE`（去重创建）/`DELETE`/`SET`，以及聚合、最短路径 `shortestPath()`、图算法（PageRank、社区发现等，Graph Data Science 库）。

---

## 五、架构与高可用

- **单机**：一个 `neo4j` 进程 + Bolt 协议（二进制，类似 JDBC）。
- **因果集群（Causal Cluster）**：Core（Raft 共识，保证写入一致）+ Read Replica（只读扩展），支持多数据中心。
- **AuraDB**：官方全托管云服务，免费起步。
- 提供 Neo4j Browser 可视化、多语言驱动（Java/Python/Go/JS）、与 Spark/ETL 集成。

---

## 六、Neo4j vs 关系型（选型边界）

| 维度 | Neo4j | MySQL |
|------|-------|-------|
| 模型 | 节点+关系（关系一等公民） | 表-行-列 |
| 多跳关联 | ⭐ 毫秒级（指针遍历） | 深 JOIN 性能崩溃 |
| 事务 | ACID 支持 | ACID 完整成熟 |
| 扩展 | 企业版集群/复制 | 垂直为主 |
| 报表/CRUD | 弱 | ⭐ 成熟 |
| 典型场景 | 社交/图谱/反欺诈 | 订单/账务/库存 |

**选型要点**：业务核心是「关系的表达与遍历」→ 图数据库；核心是「强事务 + 报表」→ 关系型。

---

## 七、生产实践与避坑

1. **建模先想遍历**：图模型的优劣取决于「会不会顺着关系走」。热路径要短、关系要明确。
2. **索引仍重要**：虽然遍历免索引，但「入口定位」（如按 name 找起点节点）要建索引/BTREE，否则全图扫。
3. **超级节点陷阱**：一个节点挂几百万关系（如「热门商品」被所有人购买），遍历会爆。需拆关系、限采样或用分桶。
4. **关系属性别滥用**：关系上挂属性方便，但过多会变重；大字段放节点。
5. **与关系型配合**：真实系统常「事务数据在 MySQL，关系网络在 Neo4j」，通过 CDC 同步。见 [数据同步 CDC-Canal](数据同步CDC-Canal.md)。
6. **Java 集成**：官方 Java Driver / Spring Data Neo4j（SDN），用 `@Node`、`@Relationship` 注解映射。

---

## 八、与其他板块的关系

- 与 [MongoDB](MongoDB.md)：MongoDB 用引用也能存图，但遍历要应用层多次查，深度关联远不如原生图存储。
- 与 [MySQL](mysql知识.md)：二者互补——事务在 MySQL，关系网络在 Neo4j，CDC 同步。
- 与 [大模型/知识图谱](大模型/)：Neo4j 是经典知识图谱存储底座，配合 LLM 做 RAG 中的「实体-关系」检索。

---

## 九、速查表

| 项 | 结论 |
|----|------|
| 类型 | 属性图数据库 |
| 模型 | Node + Relationship + Label + Property |
| 查询 | Cypher（声明式模式匹配） |
| 性能核心 | 原生图存储 + 免索引邻接（O(1) 跳转） |
| 事务 | ACID |
| 高可用 | Causal Cluster（Raft）+ AuraDB 云 |
| 许可证 | Community GPLv3 / Enterprise 商业 |
| 一句话 | 「关系密集 + 多跳」场景的天然解 |
