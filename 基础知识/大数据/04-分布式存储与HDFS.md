# 大数据 · 04 分布式存储与 HDFS

> 存储是大数据底座。HDFS 用"分块 + 多副本"把海量文件摊到廉价机器集群上；对象存储（S3/OSS）则把存算彻底解耦，成为湖仓一体的地基。

本篇讲 HDFS 架构与原理，以及对象存储、Kudu 等演进方向。文件/表格式见 [05-列式存储与数据湖格式](05-列式存储与数据湖格式.md)。

## 一、HDFS 架构

HDFS（Hadoop Distributed File System）是 Google GFS 的开源实现，**一次写入、多次读取**，为批处理优化。

```mermaid
flowchart TB
    Client[客户端] --> NN[NameNode 主: 元数据/目录树]
    NN --> DN1[DataNode 工作节点]
    NN --> DN2[DataNode]
    NN --> DN3[DataNode]
    DN1 -.心跳/块汇报.-> NN
    Client -->|读写数据| DN1
```

| 角色 | 职责 | 高可用 |
|------|------|--------|
| NameNode（NN） | 管理命名空间、文件→块映射、块位置 | 主备（ZKFC + JournalNode/QJM） |
| DataNode（DN） | 实际存储数据块（默认 128MB/块） | 多副本，故障自动剔除 |
| Secondary NN | 合并 fsimage 与 edits（旧版） | 非热备，仅 checkpoint |
| Client | 与 NN 拿元数据、与 DN 直连读写 | — |

## 二、核心机制

### 2.1 分块（Block）
- 文件按固定大小切块（Hadoop 2.x 起默认 **128MB**，早期 64MB），每块独立存储。
- 大块减少元数据量、提升顺序读吞吐；太小则 NN 元数据爆炸。

### 2.2 多副本（Replication）
- 默认 3 副本，放置策略：同机架 1 份、同 IDC 另一机架 2 份（机架感知）。
- **作用**：容错（丢节点不丢数据）+ 就近读（本地性 locality）。

### 2.3 写入流程
```mermaid
sequenceDiagram
    participant C as Client
    participant NN as NameNode
    participant DN as DataNode管道
    C->>NN: create + 申请块位置
    NN-->>C: 返回3个DN
    C->>DN: 流水线写(packet) DN1→DN2→DN3
    DN3-->>C: ack 回传
    C->>NN: 关闭并汇报块
```
- 客户端以**管道（pipeline）**方式顺序写入多副本，acked 后再向 NN 汇报。

### 2.4 读取流程
- Client 向 NN 取块位置，优先选**最近副本**直连 DN 流式读，失败换副本。

### 2.5 容错
- DN 心跳/块汇报超时 → NN 标记死亡，触发副本复制补足 3 份。
- NN 单点风险：用 **QJM（Quorum Journal Manager）+ ZKFC** 做 Active/Standby 热备。

> ⚠️ **HDFS 局限**：
> 1. 不适合**小文件**（每个文件占 NN 内存一条元数据，百万小文件拖垮 NN）→ 用 HAR/CombineFileInputFormat/HBase 缓解。
> 2. 不支持随机写/改文件（只能 append），高并发写的实时性弱 → 实时场景转向 Kafka/对象存储+表格式。
> 3. 存算耦合，扩容需加 DataNode。

## 三、对象存储：湖仓一体的地基

| 特性 | HDFS | 对象存储（S3/OSS/COS） |
|------|------|------------------------|
| 接口 | HDFS API | REST（HTTP PUT/GET） |
| 存算 | 耦合 | **分离**，计算弹性 |
| 成本 | 自管机器 | 按量付费、极低 |
| 生态 | Hadoop 系 | 全云原生、Iceberg/Paimon 原生支持 |
| 适合 | 传统 Hadoop 集群 | 湖仓一体、云原生 |

- 2025 主流：**对象存储 + 开放表格式** 取代"HDFS 上裸 Parquet"，实现存算分离与多云互通。
- 性能补丁：本地/集群缓存（Alluxio、SSD cache）、向量化读，抵消网络 IO 损耗。

## 四、Kudu：实时分析型存储

- Cloudera Kudu 弥补 HDFS（慢更新）与 HBase（弱分析）之间空白。
- **列式存储 + 快速 upsert + 低延迟随机读**，适合"既要点查又要分析"的场景（如实时明细）。
- 与 Impala/Spark 配合，做实时数仓明细层。

## 五、存储选型速查

| 需求 | 选 |
|------|----|
| 海量离线批处理、廉价 | HDFS / 对象存储 |
| 湖仓一体、ACID、多引擎 | 对象存储 + Iceberg/Paimon |
| 低延迟随机读写/宽表 | HBase |
| 实时 upsert + 分析 | Kudu / Paimon |
| 高吞吐消息缓冲 | Kafka |

## 六、存储设计 Checklist

- [ ] 块大小按文件特征调（大文件 256MB，小文件合并）。
- [ ] 副本数权衡成本与可靠（跨机架至少 2 副本分布）。
- [ ] NN 用 QJM 高可用，避免单点。
- [ ] 小文件治理：合并、HAR、或用 HBase/对象存储。
- [ ] 新平台优先对象存储 + 表格式，保留 HDFS 兼容旧作业。
- [ ] 监控：容量、副本缺失、NN 延迟、DN 心跳。

> 参考：Apache Hadoop HDFS 架构文档、Google GFS 论文、对象存储（S3/OSS）文档、Apache Kudu 文档。
