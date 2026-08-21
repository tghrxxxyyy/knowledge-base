# Solr（企业级搜索平台 / Lucene 封装）

> Solr 是 Apache 基于 Lucene 的**企业级搜索平台**，以「全文检索 + 分面搜索 + 高亮 + 分布式」成为传统搜索领域事实标准。相比 Elasticsearch（轻量/实时）、Lucene（底层库），Solr 以「功能丰富 + 生态成熟 + 传统企业首选」独树一帜。本篇按「解决的问题 → 原理 → 特性 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 全文检索 | 数据库 LIKE 查询性能极差 |
| 分面搜索 | 电商筛选（品牌/价格/评分维度聚合） |
| 高亮 | 搜索结果关键词高亮 |
| 分布式搜索 | 大数据量搜索需水平扩展 |
| 多语言分词 | 中文/日文/韩文分词需求 |

> 核心认知：**Solr = Lucene 的企业级封装**——Lucene 是底层索引库，Solr 在其上提供 HTTP API/分布式/管理界面。

---

## 二、Solr 核心原理

### 2.1 架构

```
Solr Server
  ├── Solr Core（核心：一个索引实例）
  │   ├── Schema（字段定义：类型/分词器/是否索引/是否存储）
  │   ├── Index（Lucene 索引文件）
  │   └── Config（solrconfig.xml 配置）
  ├── SolrCloud（分布式模式）
  │   ├── ZooKeeper（协调：配置/选主/路由）
  │   ├── Collection（逻辑索引）
  │   ├── Shard（分片）
  │   └── Replica（副本）
  ├── RequestHandler（请求处理器：/select/update/SpellCheck...）
  └── Update Chain（更新链：分词→索引→副本同步）
```

### 2.2 Lucene 索引原理

```
文档 → 分析器（Analyzer）
  ├── 分词器（Tokenizer）：文本 → 词元流
  ├── 过滤器（TokenFilter）：小写/停用词/同义词/词干提取
  └── 词元（Token）：写入倒排索引

倒排索引（Inverted Index）
  ├── 词项字典（Term Dictionary）：所有词项有序
  ├── 倒排表（Posting List）：词项 → 文档ID列表 + 词频 + 位置
  └── 跳表（Skip List）：加速倒排表查找
```

**选型关注点**：倒排索引是搜索的核心——词项→文档的映射，支持快速全文检索。

### 2.3 分词器（Analyzer）

| 分词器 | 说明 | 适用 |
|--------|------|------|
| StandardTokenizer | 标准分词（按空格/标点） | 英文 |
| IKAnalyzer | 中文分词（细粒度/智能） | 中文（最常用） |
| jieba | 中文分词（Python 生态常用） | 中文 |
| HanLP | 中文分词（NLP 功能丰富） | 中文 |
| kuromoji | 日文分词 | 日文 |
| CJKTokenizer | 中日韩二元分词 | 中日韩 |

**选型关注点**：中文搜索 → IKAnalyzer（最流行，支持扩展词典/停用词）。

### 2.4 SolrCloud（分布式）

```
Collection（逻辑索引）
  ├── Shard 1（分片1）
  │   ├── Replica 1（Leader）
  │   └── Replica 2（Follower）
  └── Shard 2（分片2）
      ├── Replica 1（Leader）
      └── Replica 2（Follower）

ZooKeeper
  ├── 存储集群状态/配置
  ├── 选主（Leader 选举）
  └── 路由（请求路由到对应 Shard）
```

**选型关注点**：SolrCloud 依赖 ZK（与 ElasticSearch 相比是劣势，ES 自带集群协调）。

---

## 三、Solr 核心特性

| 特性 | 说明 |
|------|------|
| 全文检索 | 基于倒排索引的全文检索 |
| 分面搜索 | 按维度聚合统计（品牌/价格区间/评分） |
| 高亮 | 搜索结果关键词高亮 |
| 拼写检查 | 拼写纠错（"Did you mean"） |
| 自动补全 | 搜索建议/自动完成 |
| 空间搜索 | 地理空间搜索（距离/多边形） |
| 分组/折叠 | 结果分组/去重 |
| 多租户 | 多 Core/Collection 隔离 |
| 数据导入 | DataImportHandler（DB/CSV/XML/JSON 导入） |
| 安全 | 认证/授权/TLS |
| 管理界面 | Solr Admin UI |

---

## 四、Solr vs Elasticsearch

| 维度 | Solr | Elasticsearch |
|------|------|---------------|
| 底层 | Lucene | Lucene |
| 诞生 | 2004（早） | 2010（晚） |
| 分布式 | SolrCloud（依赖 ZK） | 自带集群协调（无外部依赖） |
| 实时性 | 近实时（soft commit） | 近实时（1s refresh） |
| 全文检索 | 强 | 强 |
| 分析/聚合 | 中 | 强（聚合能力更强） |
| 易用性 | 中 | 强（REST API 更友好） |
| 安装 | 较重 | 轻量 |
| 配置 | XML（复杂） | JSON/YAML（简洁） |
| 中文 | IKAnalyzer（成熟） | IK/结巴（成熟） |
| 生态 | 传统企业/电商 | 日志/监控/APM/搜索 |
| 社区 | 成熟 | 更活跃 |
| 云原生 | 弱 | 强（ES Operator） |
| 许可证 | Apache 2.0 | SSPL/Elastic License（变更后） |

**选型关注点**：
- 传统企业搜索/电商分面搜索 → **Solr**（功能更丰富）
- 日志/监控/APM/实时搜索 → **ElasticSearch**（生态更活跃）
- 需要最新特性/云原生 → **ElasticSearch**
- 已有 Solr 基础设施 → 继续 Solr

---

## 五、Solr 生产实践

### 5.1 Schema 设计

```xml
<field name="id" type="string" indexed="true" stored="true" required="true"/>
<field name="title" type="text_ik" indexed="true" stored="true"/>
<field name="content" type="text_ik" indexed="true" stored="true"/>
<field name="price" type="pdouble" indexed="true" stored="true"/>
<field name="brand" type="string" indexed="true" stored="true" docValues="true"/>
<field name="create_time" type="pdate" indexed="true" stored="true"/>
```

**选型关注点**：
- `indexed="true"`：是否索引（可搜索）
- `stored="true"`：是否存储（可返回原文）
- `docValues="true"`：是否列式存储（分面/排序/聚合需要）

### 5.2 关键配置

| 配置 | 说明 |
|------|------|
| autoCommit | 硬提交（fsync 到磁盘）间隔 |
| autoSoftCommit | 软提交（可见但不到磁盘）间隔 |
| mergeFactor | 段合并因子 |
| ramBufferSizeMB | 索引缓冲大小 |
| maxBufferedDocs | 缓冲文档数 |

### 5.3 性能调优

| 调优维度 | 建议 |
|----------|------|
| 分片数 | 按数据量和查询量（过多增加协调开销） |
| 副本数 | 查询多→增加副本（读扩展） |
| 缓存 | filterCache/queryResultCache/documentCache |
| 段合并 | 合理配置 mergePolicy（减少段数） |
| JVM 堆 | 不超过 32GB（压缩 OOPs） |

### 5.4 高可用

- SolrCloud：多副本 + ZK 协调（自动故障转移）
- 跨数据中心：Solr CDCR（Cross Data Center Replication）

---

## 六、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 全文检索 | Solr / ES | — |
| 电商分面搜索 | Solr | ES |
| 日志/监控 | ES | Loki |
| 实时搜索 | ES | Solr |
| 中文搜索 | Solr + IK | ES + IK |
| 自动补全 | ES Completion Suggester | Solr Suggester |
| 地理搜索 | ES / Solr | PostGIS |
| 云原生 | ES | — |

---

## 七、与其他板块的关系

- Elasticsearch 见「[ES 体系](../ES体系.md)」；
- Lucene 原理见「[搜索系统设计](../../场景设计/搜索系统设计.md)」；
- 云上搜索服务见「[云上数据库与缓存生态](./云上数据库与缓存生态.md)」；
- 云上中间件总览见「[云上中间件体系总览](./云上中间件体系总览.md)」。

> 一句话：**Solr = Lucene 企业级封装 + 全文检索 + 分面搜索 + 高亮 + SolrCloud 分布式；选型先看「场景（传统企业搜索→Solr，日志/实时→ES）」，再定「分词器（中文→IKAnalyzer）」，最后调「缓存/段合并/JVM 堆」**。

---

## 八、Solr 查询语法与高级特性

### 8.1 查询语法

```
# 基本查询
q=title:solr AND content:search

# 范围查询
q=price:[100 TO 500]

# 通配符
q=title:sol*

# 模糊查询（编辑距离）
q=title:solr~1

# 排序
sort=price asc, score desc

# 高亮
hl=true&hl.fl=title,content&hl.snippets=3

# 分面
facet=true&facet.field=brand&facet.field=category
```

### 8.2 高级特性

| 特性 | 说明 |
|------|------|
| Stats Component | 实时统计（min/max/mean/sum） |
| Group/Field Collapsing | 结果分组/折叠 |
| Real-time Get | 近实时获取刚索引的文档 |
| Collapse/Expand | 结果折叠+展开 |
| Debug Query | 查看评分细节 |
| Stats JSON Facet | 嵌套分面（深度聚合） |

### 8.3 SolrJ（Java 客户端）

```java
SolrClient client = new HttpSolrClient.Builder("http://localhost:8983/solr/mycore").build();
SolrQuery query = new SolrQuery();
query.setQuery("title:solr");
query.addFilterQuery("price:[100 TO 500]");
query.setFacet(true);
query.addFacetField("brand");
query.setRows(10);
query.setSort("score", SolrQuery.ORDER.desc);
QueryResponse response = client.query(query);
SolrDocumentList docs = response.getResults();
```

---

## 九、Solr 缓存体系详解

| 缓存 | 说明 | 调优 |
|------|------|------|
| filterCache | 过滤器结果缓存（fq 查询） | 热门过滤条件命中率 |
| queryResultCache | 查询结果缓存 | 高频相同查询命中 |
| documentCache | 文档字段缓存 | 减少磁盘 I/O |
| userValueCache | 自定义缓存 | 按业务需求 |

**调优建议**：
- `initialSize`：预估常用查询数量
- `autowarmCount`：新缓存预热数量（旧缓存迁移）
- `size`：缓存条目数（过大影响 GC）

---

## 十、Solr 高可用与跨数据中心

### 10.1 SolrCloud 高可用

```
Collection: my_index
  ├── Shard1
  │   ├── Leader (node1)
  │   ├── Replica (node2)
  │   └── Replica (node3)
  └── Shard2
      ├── Leader (node4)
      ├── Replica (node5)
      └── Replica (node6)

ZooKeeper 集群 (3节点)
  ├── 集群状态管理
  ├── Leader 选举
  └── 路由表维护
```

### 10.2 跨数据中心复制（CDCR）

```
DC1 (北京) → CDCR → DC2 (上海)
  ├── 双向异步复制
  ├── 冲突检测（最后写入者胜）
  └── 带宽控制（避免跨区流量爆炸）
```

---

## 十一、Solr 常见坑与最佳实践

| 坑 | 表现 | 解法 |
|----|------|------|
| 分片数过大 | 协调开销大、查询变慢 | 按数据量和查询量规划 |
| 段太多 | merge 跟不上，查询慢 | 调整 mergePolicy |
| 全文检索+聚合 | text 字段做聚合 | 拆分 text（搜索）+ keyword（聚合） |
| 深分页 | `start=10000` 性能崩溃 | 用 cursorMark |
| 缓存驱逐 | 内存不足导致缓存失效 | 调大 JVM 堆 + 合理设置缓存大小 |
| 数据导入全量 | DataImportHandler 性能差 | 用 SolrJ 批量写入 |
| Schema 变更 | 新字段需改 Schema | 用 Managed Schema + Schemaless 模式 |

---

## 十二、与其他板块的关系（扩展）

- Elasticsearch 见「[ES 体系](../ES体系.md)」；
- Lucene 原理见「[搜索系统设计](../../场景设计/搜索系统设计.md)」；
- 云上搜索服务见「[云上数据库与缓存生态](./云上数据库与缓存生态.md)」；
- 云上中间件总览见「[云上中间件体系总览](./云上中间件体系总览.md)」；
- 中文分词见「[IKAnalyzer](./IKAnalyzer.md)」；
- 对比 Elasticsearch 见「[ES 集群部署与调优](./ES集群部署与调优.md)」。

---

## 十三、速查表（扩展）

| 项 | 结论 |
|----|------|
| 类型 | 企业级搜索平台（Lucene 封装） |
| 底层 | Lucene（倒排索引） |
| 分布式 | SolrCloud（依赖 ZooKeeper） |
| 分词器 | IKAnalyzer（中文）/ StandardTokenizer（英文） |
| 缓存 | filterCache / queryResultCache / documentCache |
| 高可用 | 多副本 + ZK 协调 |
| 许可证 | Apache 2.0 |
| 适用场景 | 传统企业搜索/电商分面搜索 |
| 替代方案 | Elasticsearch（日志/实时/云原生） |
| 一句话 | 「Lucene 企业级封装 + 全文检索 + 分面搜索」 |
