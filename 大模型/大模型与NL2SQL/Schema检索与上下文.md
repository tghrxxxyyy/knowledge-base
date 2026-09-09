# Schema 检索与上下文构建

> 对应 NL2SQL 的工程核心；检索思想参考 RAG（Lewis et al. 2020）与数据库 schema 链接工作。

## 一、背景与挑战

现代数仓常有数百张表、上千字段，全量 schema 直接塞进 prompt 会超出上下文窗口、引入大量噪声，反而降低生成准确率（「大海捞针」问题）。用户一个问题通常只涉及其中几张表、十几个字段。因此必须先做 schema 检索，把相关表/字段精炼成精简上下文。

挑战：(1) 表名/字段名常是缩写，语义稀疏；(2) 问题中的业务词与字段注释需对齐；(3) 关联的字典表/外键必须连同召回，否则模型不会 JOIN；(4) 召回过多或过少都不行；(5) 不同嵌入模型/方言影响召回质量。

## 二、核心原理

把 schema 当作「文档库」做检索增强：

- 建索引：把每张表、每个字段（含注释、类型、示例值、所属表）编码为向量，连同外键/字典映射元数据入库。
- 召回：用问题的 embedding 检索相关表/字段，再按「表」聚合（召回字段所属的整表，避免半张表）。
- 重排：用 cross-encoder 或 LLM 对候选表做精排，控制 top-k。
- 上下文拼装：把选中的表 DDL + 字段注释 + 外键/字典映射组成 prompt 区块。
- 元数据过滤：按权限/业务域先过滤候选表范围，再检索。

## 三、形式化与数学基础

设数据库 schema 拆分为原子单元集合 $\{c_1,\dots,c_M\}$（表或字段）。问题 $q$ 的 embedding 为 $\mathbf{e}_q$，单元 $c_i$ 为 $\mathbf{e}_i$，检索取相似度最高的 $k$ 个：

$$\mathcal{C}_q = \text{TopK}_i\, \text{sim}(\mathbf{e}_q, \mathbf{e}_i)$$

其中 $\text{sim}$ 常用余弦相似度。最终上下文为聚合后的表集合：

$$\mathcal{R}(S,q) = \text{aggregate\_by\_table}(\mathcal{C}_q)$$

目标使 $\mathcal{R}(S,q)$ 包含生成正确 SQL 所需的全部表/字段，同时 $|\mathcal{R}|$ 足够小以控制噪声与长度。

## 四、代码实现

用向量库召回相关表并拼装上下文（示意）：

```python
from sentence_transformers import SentenceTransformer
import faiss

emb = SentenceTransformer("BAAI/bge-large-zh")
index = faiss.read_index("schema.index")     # 字段/表注释建好的索引
q = emb.encode([question])
_, ids = index.search(q, k=20)               # 召回候选字段
tables = aggregate_by_table(ids)             # 聚合到所属表
ctx = build_ddl(tables) + build_fk_mapping(tables)
sql = llm.generate(question + ctx)
```

进阶可加 cross-encoder 重排：`rerank(query, [build_ddl(t) for t in tables])[:top_k]`。

## 五、与其他技术对比

| 策略 | 优点 | 缺点 |
|------|------|------|
| 全量 schema | 不漏 | 超长、噪声大 |
| 向量检索 | 精准、短 | 依赖注释质量 |
| 规则/关键词匹配 | 可解释 | 同义词弱 |
| LLM 直接选表 | 语义强 | 大库成本高 |

实务用「向量检索 + 重排 + 外键连带召回」。

## 六、常见误区

- 关系表/关联表未映射到 SQL 关键词，模型无从下手 JOIN。
- 只召回字段不召回整表，导致半张表信息缺失。
- 字段注释质量差（如 `col1` 无含义），召回全靠运气。
- 召回 top-k 过大，又回到噪声问题。
- 未把外键关系随表一起召回，模型仍不会正确连接。

## 七、与开源书·权威来源对应

- RAG 范式（Lewis et al. 2020）提供检索增强的理论基础。
- 本知识库「大模型与 NL2SQL / 字典表与关联表映射」「NL2SQL 概述」章节。

## 八、面试题

- 为何 NL2SQL 要先检索相关表而非用全库 schema？
- 召回字段后为什么要按表聚合？
- 字段注释质量如何影响召回效果？
- 向量召回后为什么还要重排？

## 九、演进与趋势

从静态向量检索到「查询感知」：用问题先抽取实体再定向检索；引入数据库值采样让检索理解字段取值分布；外键图遍历做多跳召回；结合执行反馈（缺表报错）触发补充检索，形成检索—生成—校验闭环；以及把召回命中率作为评测指标。

## 十、小结

精简准确的 schema 上下文是生成正确 SQL 的前提。以向量检索为主、外键连带与重排为辅，控制上下文规模，才能在长 schema 上保持高准确率。
