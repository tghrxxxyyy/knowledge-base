# ES 集群调优（分片策略 / JVM / 查询优化）

> Elasticsearch 集群调优 =「**分片设计 + JVM 调优 + 查询优化 + 集群运维**」四个维度。分片太少浪费并发，太多拖垮性能；JVM 配置不当导致 GC 停顿；查询写法不对全表扫描。本篇按「生产问题 → 调优手段 → 避坑」拆解。

---

## 一、分片策略

### 1.1 核心原则

```
分片 = ES 并发与分布的最小单位（不可再拆）
  单个分片大小：建议 10~50GB（最佳 20~30GB）
  分片数量：index 创建后不可减少（只能 Reindex）
  主分片数 = 节点数的倍数（均匀分布）

公式参考：
  分片数 ≈ 数据总量 ÷ 单分片大小（30GB）
  例：100GB 数据 → 3~4 个主分片
  预估：数据增长 3 倍 → 分片数 × 3
```

### 1.2 分片调优

| 问题 | 原因 | 解决 |
|------|------|------|
| 写入慢 | 分片太少，并发度低 | 增加分片数（Reindex） |
| 查询慢 | 分片太多，聚合开销大 | Reindex 合并分片 |
| 写入拒绝 | 分片过多，线程池耗尽 | 减少分片 + 控制写入速率 |
| 热点 | 单分片数据不均 | 调整路由/分片分配策略 |
| 内存溢出 | 分片过多导致元数据膨胀 | 控制分片总数（建议 < 500/节点） |

### 1.3 分片分配策略

```yaml
# 索引级别分片分配
"index.routing.allocation.require.zone": "zone_a"
"index.routing.allocation.require.node_type": "hot"

# 集群级别分片分配
"cluster.routing.allocation.awareness.attributes": "zone"

# 分片过滤
"index.routing.allocation.include.zone": "zone_a,zone_b"
"index.routing.allocation.exclude.zone": "zone_c"
```

### 1.4 分片总数控制

| 指标 | 建议值 |
|------|--------|
| 每节点分片数 | < 20 |
| 集群总分片数 | < 100,000 |
| 单分片大小 | 10~50GB |
| 单分片文档数 | < 200M |

---

## 二、JVM 调优

### 2.1 堆内存配置

```
ES 堆内存建议：
  物理内存 ≤ 64GB：堆 = 物理内存的 50%（最大 31GB）
  物理内存 > 64GB：堆 = 31GB（留内存给 OS 文件缓存）

示例（64GB 机器）：
  ES_JAVA_OPTS="-Xms31g -Xmx31g"

注意：
  Xms = Xmx（避免堆大小动态调整的开销）
  不要超过 31GB（指针压缩失效，内存翻倍）
  留一半给 OS 做文件缓存（Lucene 依赖 OS 缓存）
```

### 2.2 GC 调优

| 参数 | 说明 |
|------|------|
| `-XX:+UseG1GC` | G1 GC（ES 7+ 默认） |
| `-XX:MaxGCPauseMillis=50` | 目标停顿时间 |
| `-XX:+HeapDumpOnOutOfMemoryError` | OOM 时 dump |
| `-XX:HeapDumpPath=/var/log/es/heapdump.hprof` | dump 路径 |
| `-XX:+UseGCLogFileRotation` | GC 日志轮转 |
| `-XX:GCLogFileSize=64m` | GC 日志大小 |

### 2.3 JVM 监控

```bash
# 查看 JVM 堆使用
curl -s localhost:9200/_nodes/stats/jvm | jq '.nodes[].jvm.mem'

# 查看 GC 情况
curl -s localhost:9200/_nodes/stats/jvm | jq '.nodes[].jvm.gc.collectors'

# 查看分片内存
curl -s localhost:9200/_cat/allocation?v
```

### 2.4 常见 JVM 问题

| 问题 | 原因 | 解决 |
|------|------|------|
| GC 停顿长 | 堆过大/对象过多 | 减小堆/优化查询 |
| OOM | 堆不足/内存泄漏 | 加内存/查泄漏 |
| 指针压缩失效 | 堆 > 31GB | 控制堆 ≤ 31GB |

---

## 三、查询优化

### 3.1 写入优化

| 实践 | 说明 |
|------|------|
| 批量写入 | `_bulk` API（减少网络开销） |
| refresh_interval | 写入密集时调大（如 30s，默认 1s） |
| translog | 写入时可调 `translog.durability: async`（提升写入，有丢数据风险） |
| 副本数 | 写入时可设 0，写完再恢复（提升写入） |
| 路由 | 同一文档路由到同一分片（减少跨分片） |

### 3.2 查询优化

| 实践 | 说明 |
|------|------|
| 避免 wildcard | `*keyword*` 全量扫描（用 ngram 或 completion） |
| 避免深分页 | `from+size` 超过 10000 用 `search_after` |
| filter 替代 query | filter 不计分且可缓存 |
| 字段裁剪 | `_source` 指定返回字段（减少网络） |
| 聚合优化 | `size: 0` 只返回聚合不返回文档 |
| 冷热分离 | 热数据 SSD，冷数据 HDD |

### 3.3 深分页方案

```json
// 方案一：search_after（推荐）
POST /my-index/_search
{
  "size": 100,
  "sort": [{"timestamp": "asc"}, {"_id": "asc"}],
  "search_after": ["2024-01-01", "doc_id_123"]
}

// 方案二：scroll（不推荐，有状态）
// 方案三：Terminating aggregation（只统计不取文档）
```

### 3.4 查询慢原因分析

| 原因 | 排查方式 | 解决 |
|------|----------|------|
| 全表扫描 | 检查 query 是否匹配所有文档 | 加过滤条件 |
| 深分页 | 检查 from+size | 改用 search_after |
| wildcard | 检查通配符 | 用 ngram/tokenizer |
| 跨分片聚合 | 检查聚合字段 | 减少分片数 |
| 慢查询日志 | 开启 slow log | 分析慢查询原因 |

---

## 四、集群运维

### 4.1 集群健康

```bash
# 集群状态（green/yellow/red）
curl -s localhost:9200/_cluster/health?pretty

# 分片状态
curl -s localhost:9200/_cat/shards?v

# 未分配分片原因
curl -s localhost:9200/_cluster/allocation/explain?pretty

# 节点状态
curl -s localhost:9200/_cat/nodes?v&h=name,heap.percent,ram.percent,load_1m
```

### 4.2 常见集群问题

| 问题 | 原因 | 解决 |
|------|------|------|
| Yellow | 副本分片未分配（节点不够） | 扩容节点 / 调整副本数 |
| Red | 主分片丢失（数据丢失风险） | 从备份恢复 / 重新索引 |
| 写入拒绝 | 线程池满 / 磁盘水位线 | 控制写入速率 / 扩容 |
| 查询超时 | 分片太多 / 查询不合理 | 优化查询 / 合并分片 |
| 磁盘满 | 未及时清理 | 增加磁盘 / 调整水位线 / 删除索引 |

### 4.3 水位线管理

```yaml
# 磁盘水位线（默认值）
cluster.routing.allocation.disk.watermark.low: 85%    # 停止分配新分片
cluster.routing.allocation.disk.watermark.high: 90%    # 尝试迁移分片
cluster.routing.allocation.disk.watermark.flood_stage: 95%  # 只读
```

### 4.4 线程池监控

```bash
# 查看线程池状态
curl -s localhost:9200/_cat/thread_pool?v&h=node_name,name,active,queue,rejected

# 关键线程池
# write: 写入线程池（active/rejected）
# search: 查询线程池（active/rejected）
# get: 点查询线程池（active/rejected）
```

### 4.5 索引生命周期管理（ILM）

```
Hot → Warm → Cold → Delete

Hot：热数据，SSD，写入+查询
Warm：温数据，HDD，只查询
Cold：冷数据，归档，低频查询
Delete：自动删除过期数据
```

---

## 五、与其他板块的关系

- ES 基础见「[ES 体系](../ES体系.md)」；
- ES 源码见「[MySQL InnoDB 源码](../../源码系列/MySQL-InnoDB源码.md)」（参考思路）；
- 搜索场景见「[场景设计/搜索系统设计](../../场景设计/搜索系统设计.md)」；
- 日志体系见「[ELK 日志体系](./ELK日志体系.md)」；
- Solr 对比见「[Solr 搜索平台](./Solr搜索平台.md)」。

---

## 六、ES 生产配置清单

### 6.1 elasticsearch.yml 关键配置

```yaml
# 集群配置
cluster.name: my-cluster
node.name: node-1
node.roles: [master, data_hot]

# 路径配置
path.data: /data/elasticsearch
path.logs: /var/log/elasticsearch

# 网络配置
network.host: 0.0.0.0
http.port: 9200
transport.port: 9300

# 内存配置
bootstrap.memory_lock: true

# 索引配置
action.auto_create_index: false
action.destructive_requires_name: true
```

### 6.2 索引模板示例

```json
{
  "index_patterns": ["logs-*"],
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "refresh_interval": "30s",
    "index.routing.allocation.require.node_type": "hot"
  },
  "mappings": {
    "properties": {
      "@timestamp": {"type": "date"},
      "message": {"type": "text"},
      "level": {"type": "keyword"}
    }
  }
}
```

### 6.3 监控指标

```
关键 ES 指标：
  集群状态：green/yellow/red
  JVM 堆使用率：<70% 正常
  GC 频率：<1次/分钟
  索引延迟：<200ms
  查询延迟：<100ms
  磁盘使用率：<80%
  分片分布是否均匀
  线程池拒绝数：0
```

### 6.4 常见问题排查

| 问题 | 原因 | 解决 |
|------|------|------|
| 集群 Yellow | 副本未分配 | 扩容节点/调整副本数 |
| 写入拒绝 | 线程池满/磁盘满 | 控制写入速率/扩容 |
| 查询超时 | 分片太多/查询不合理 | 优化查询/合并分片 |
| JVM OOM | 堆过大/内存泄漏 | 减小堆/查泄漏 |
| 磁盘满 | 未及时清理 | 删除索引/调整水位线 |

---

> 一句话：**ES 调优 = 分片（10~30GB/分片，别太多）+ JVM（堆 ≤31GB，留一半给 OS 缓存）+ 查询（filter 替代 query，避免深分页 wildcard）+ 集群（监控 health/水位线/线程池）**。
