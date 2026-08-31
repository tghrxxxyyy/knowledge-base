# 全文搜索与 Elasticsearch 实战

> 板块：场景设计 　|　 返回：[README](README.md)

## 一、搜索要解决什么

从海量文档/商品里按关键词/语义快速召回并排序。核心：倒排索引 + 相关性算分 + 高亮。

## 二、核心概念

- **倒排索引**：term → 文档列表，查询时求交集/并集，远快于全表 LIKE。
- **分词（Analyzer）**：中文需 IK/结巴等分词器，英文用 standard。
- **相关性**：TF-IDF / BM25 算分。
- **Mapping**：字段类型与索引方式（text 分词、keyword 不分词）。

## 三、ES 架构

- **Index / 类比库**，**Shard 分片**（水平扩展），**Replica 副本**（高可用）。
- 写入先进 translog 再 refresh 成可搜 segment（近实时，默认 1s）。

## 四、查询类型

- **term**：精确（keyword 字段）。
- **match**：全文分词匹配（text 字段）。
- **bool**：must/should/must_not/filter 组合。
- **range / exists / wildcard**。

```json
{
  "query": {
    "bool": {
      "must": [{ "match": { "title": "手机" } }],
      "filter": [{ "range": { "price": { "gte": 100, "lte": 5000 } } }]
    }
  }
}
```

## 五、性能与一致性

- 深翻页用 `search_after` 而非 `from+size` 大偏移。
- 聚合（aggs）做 facets/统计。
- 与数据库最终一致：CDC（Canal/Debezium）同步业务表到 ES。

## 六、混合检索（RAG 场景）

- 向量 + BM25 融合（RRF），详见 [大模型/RAG/02-RAG进阶与召回优化实战](../大模型/RAG/02-RAG进阶与召回优化实战.md)。

## 七、常见坑

1. 用 keyword 做全文 → 搜不到分词结果。
2. 深分页 from=10000 → 性能崩，改 search_after。
3. 不分片/不副本 → 单点/容量受限。
4. 映射设计错 → 需重建索引（reindex 成本高）。
5. 把 ES 当主库 → 它是索引，不是源。

## 八、延伸阅读

- [场景设计/缓存经典三问与一致性](缓存经典三问与一致性.md)
- [大模型/RAG/02-RAG进阶与召回优化实战](../大模型/RAG/02-RAG进阶与召回优化实战.md)
- [技术选型/数据库与缓存选型实战](../技术选型/数据库与缓存选型实战.md)
