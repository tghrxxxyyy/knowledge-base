# 大数据 · 04 分布式存储与 HDFS（架构原理 / 数据管理机制 / 对象存储演进 / 选型决策）

> 存储是大数据底座。HDFS 用"分块 + 多副本"把海量文件摊到廉价机器集群上；对象存储（S3/OSS）则把存算彻底解耦，成为湖仓一体的地基。本篇深入拆解 HDFS 架构、核心机制、容错、元数据管理、对象存储演进与存储选型决策。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 单机容量有限 | PB 级数据单机磁盘放不下 |
| 数据可靠性 | 磁盘/节点故障需自动恢复 |
| 存算一体成本高 | 计算和存储绑定，扩容浪费 |
| 海量小文件 | 元数据膨胀拖垮集群 |
| 随机写难 | 传统文件系统不适合流式分析 |

> 核心认知：**HDFS = 「分块 + 多副本 + 中心元数据」的分布式文件系统**，面向"一次写入、多次读取"的批处理；对象存储进一步**存算分离**，成为现代湖仓一体底座。

---

## 二、HDFS 架构

### 2.1 角色与职责

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

### 2.2 分块（Block）

- 文件按固定大小切块（Hadoop 2.x 起默认 **128MB**，早期 64MB），每块独立存储。
- **大块好处**：减少元数据量（NN 内存）、提升顺序读吞吐；太大则并行度不足、文件尾部浪费。
- **块与文件关系**：文件 = 块列表（元数据）+ 块数据（DataNode）。

### 2.3 副本放置策略（机架感知）

```
默认 3 副本放置：
  第 1 份：本地节点
  第 2 份：同机架另一节点
  第 3 份：跨机架节点

目的：
  本地读快（前两份常能本地/近地）
  跨机架容灾（丢一机架不丢数据）

配置：net.topology.script.file.name 定义机架映射
云上：可用区（AZ）替代机架
```

---

## 三、核心机制（深入）

### 3.1 写入流程（源码级）

```mermaid
sequenceDiagram
    participant C as DFSClient
    participant NN as NameNode
    participant DN as DataNode管道
    C->>NN: create + addBlock(申请租约/位置)
    NN-->>C: Lease + [DN1,DN2,DN3]
    C->>DN: packet 流水线写(64KB)
    DN-->>C: ack 逐跳回传
    C->>NN: close → complete(提交块)
    NN-->>C: 成功
```

```
1. DFSClient.create() 向 NN 申请租约（Lease）与块位置，NN 按机架感知返回 3 个 DN。
2. 客户端把数据切为 64KB packet，经 DataStreamer 以管道写 DN1→DN2→DN3，每跳确认（ack queue）。
3. 块写满或关闭时，Complete 上报 NN，NN 提交块、释放租约。
4. 容错：ResponseProcessor 收到异常则从 ack queue 重发；DN 故障换管，NN 后续补副本。
```

### 3.2 读取流程

- Client 向 NN 取块位置，优先选**最近副本**直连 DN 流式读，失败换副本。

### 3.3 容错

```
DataNode 容错：
  DN 心跳/块汇报超时（默认 10 分钟未心跳）→ NN 标记死亡
  → 触发副本复制补足 3 份（后台，限速）

NameNode 高可用：
  Active/Standby 两 NN
  QJM（Quorum Journal Manager）共享 editlog（多数派写入）
  ZKFC 监听健康、抢锁做故障转移
  联邦（Federation）：多 NameService 横向扩展元数据
```

---

## 四、NameNode 元数据（深入）

### 4.1 元数据构成

```
fsimage：命名空间快照（文件/目录/权限/块映射）
editlog：增量操作日志（append 每条变更）

加载流程：
  启动：加载 fsimage → 重放 editlog → 服务
  合并：Standby/Secondary NN 定期 checkpoint（合并 fsimage+editlog）

内存估算：
  每个文件约占用 NN 150~250 字节内存
  10 亿文件 ≈ 150~250GB 堆内存 → 小文件是 NN 杀手
```

### 4.2 联邦（Federation）

```
多 NameService（NS）：
  每个 NS 管理一部分目录（/data/a、/data/b）
  共享底层 DataNode 存储池

解决：单 NN 内存/吞吐瓶颈
适用：超大集群（万级节点）元数据横向扩展
```

### 4.3 快照（Snapshot）

```
功能：文件系统只读快照（灾难恢复/误删回滚）
用法：hdfs dfsadmin -allowSnapshot /data
      hdfs dfs -createSnapshot /data snap1
原理：基于 inode 复制（diff 记录），不复制数据块
```

---

## 五、小文件治理

| 手段 | 做法 |
|------|------|
| 合并写 | Hive `INSERT OVERWRITE` 合并、Spark `coalesce` |
| HAR 归档 | `hadoop archive` 把小文件打包为 har |
| CombineInputFormat | 合并输入分片，减少 map 数 |
| 对象存储+表格式 | 用 Iceberg 大文件 + compaction |
| 避源头 | 控制分区粒度，避免按分钟分区 |

```
经验法则：
  单文件 ≥ 128MB（与块对齐）
  分区不宜过细（日优于小时）
  目标：每文件 ≥ 块大小，减少 NN 元数据
```

---

## 六、纠删码（Erasure Coding）

```
副本 3 份存储放大 3×；EC（如 RS-6-3）用校验块替代副本：
  6 数据块 + 3 校验块 = 9 块，冗余 1.5×
  任意 3 块丢失可恢复

代价：重建需网络读多块、计算开销高
适用：冷数据目录（xor/rs 策略）

配置示例：
  hdfs ec -enablePolicy -policy RS-6-3-1024k /cold_data
  hdfs ec -setPolicy -path /cold_data -policy RS-6-3-1024k

说明：EC 对追加写友好，随机写差 → 适合归档/日志/冷数据
```

---

## 七、HDFS vs 对象存储（工程对比）

| 维度 | HDFS | 对象存储（S3/OSS） |
|------|------|-------------------|
| 接口 | HDFS API | REST（HTTP PUT/GET） |
| 一致性 | 强（NN 中心） | 最终/强（取决于实现） |
| 小文件 | 极差（NN 元数据） | 好（无 NN 瓶颈） |
| 存算 | 耦合 | **分离**，计算弹性 |
| 成本 | 自管机器 | 按量付费、极低 |
| 生态 | Hadoop 系 | 全云原生、Iceberg/Paimon 原生 |
| 运维 | 重（NN/DN 管理） | 托管免运维 |
| 适合 | 传统 Hadoop 集群 | 湖仓一体、云原生 |

### 7.1 对象存储性能补丁

```
问题：网络 IO 延迟高于本地磁盘
解决：
  本地/集群缓存（Alluxio、SSD cache）
  向量化读、Parquet/ORC 列式下推
  大文件顺序读（避免小对象）

2025 主流：
  对象存储 + 开放表格式 取代"HDFS 上裸 Parquet"
  实现存算分离与多云互通
```

---

## 八、Kudu：实时分析型存储

```
定位：Cloudera Kudu 弥补 HDFS（慢更新）与 HBase（弱分析）之间空白
特性：列式存储 + 快速 upsert + 低延迟随机读
适用：既要点查又要分析（实时明细层）

架构：
  Tablet（类似 HBase Region，Raft 复制）
  列式 + 主键唯一 + 快速更新

与 Impala/Spark 配合：做实时数仓明细层
```

---

## 九、存储选型决策树

```mermaid
flowchart TD
    A{数据规模?} -->|小| M[单机/MySQL/文件]
    A -->|大| B{访问模式?}
    B -->|批处理/海量| C{云原生?}
    C -->|是| OS[对象存储 + Iceberg/Paimon]
    C -->|否| HDFS[HDFS]
    B -->|低延迟随机读写| HB[HBase/Cassandra]
    B -->|实时upsert+分析| KD[Kudu/Paimon]
    B -->|高吞吐消息| K[Kafka]
```

| 需求 | 选 |
|------|----|
| 海量离线批处理、廉价 | HDFS / 对象存储 |
| 湖仓一体、ACID、多引擎 | 对象存储 + Iceberg/Paimon |
| 低延迟随机读写/宽表 | HBase |
| 实时 upsert + 分析 | Kudu / Paimon |
| 高吞吐消息缓冲 | Kafka |

---

## 十、存储设计 Checklist

- [ ] 块大小按文件特征调（大文件 256MB，小文件合并）。
- [ ] 副本数权衡成本与可靠（跨机架至少 2 副本分布）。
- [ ] NN 用 QJM 高可用，避免单点。
- [ ] 小文件治理：合并、HAR、或用 HBase/对象存储。
- [ ] 冷数据用 EC 降本，热数据用副本保性能。
- [ ] 新平台优先对象存储 + 表格式，保留 HDFS 兼容旧作业。
- [ ] 监控：容量、副本缺失、NN 延迟、DN 心跳。

---

## HDFS Federation 与 Erasure Coding

### HDFS Federation（联邦）

```
单NameNode瓶颈：
  元数据内存受限 → 10亿文件需150GB+堆内存
  吞吐受限 → 所有请求经单NN

Federation解决：
  多NameService（NN1、NN2...）横向扩展
  每个NN管理独立命名空间（/data/a、/data/b）
  共享底层DataNode存储池
  客户端挂载表（Mount Table）统一入口

架构：
  NN1 → /data/a/*（DN1,DN2,DN3）
  NN2 → /data/b/*（DN1,DN2,DN3）
  DN同时注册到多个NN
  Client通过挂载表路由到对应NN

适用：超大集群（万级节点）、多租户隔离
```

### HDFS Erasure Coding（纠删码）

```
副本次本 vs EC：
  3副本：3×存储开销，任2块丢失可恢复
  RS-6-3：1.5×开销，6数据+3校验，任3块丢失可恢复
  RS-10-4：1.4×开销，10数据+4校验

EC原理：
  数据块切分为6个单元
  生成3个校验块（XOR/Reed-Solomon）
  存储9个块到不同节点
  恢复时读取剩余块，数学计算恢复丢失块

代价：
  写入需计算校验（CPU开销）
  恢复需网络读多个块（重建慢）
  不适合频繁写入场景

适用：
  冷数据目录（归档/日志）
  WORM数据（Write Once Read Many）
  存储成本敏感场景

配置：
  hdfs ec -enablePolicy -policy RS-6-3-1024k /cold_data
  hdfs ec -setPolicy -path /cold_data -policy RS-6-3-1024k
```

### HDFS 存储策略

| 策略 | 副本/EC | 适用数据 | 存储介质 |
|------|--------|---------|---------|
| HOT | 3副本 | 频繁访问 | 高性能磁盘 |
| WARM | 1副本+EC | 低频访问 | 标准磁盘 |
| COLD | EC-6-3 | 极少访问 | 低频存储 |
| ALL_SSD | 3副本(SSD) | 实时分析 | SSD |
| ONE_SSD | 1副本(SSD)+2副本磁盘 | 混合 | SSD+磁盘 |
| LAZY_PERSIST | 内存→异步落盘 | 临时数据 | 内存+磁盘 |

```
策略切换：
  hdfs storagepolicies -setStoragePolicy -path /data -policy WARM
  hdfs mover -p /data（触发数据迁移）

自动分层：
  结合访问热度（块访问统计）
  定期执行mover迁移数据
  与对象存储Lifecycle类似
```

### HDFS Balancer

```
问题：新节点加入后数据不均衡，老节点过载
解决：HDFS Balancer在节点间迁移数据块

执行：
  hdfs balancer -threshold 10（允许10%偏差）
  按带宽限制：dfs.datanode.balance.bandwidthPerSec

自动平衡：
  定时调度（如每周一次）
  阈值设为5%~10%
  注意：迁移时占用网络带宽，避峰执行

云上替代：
  对象存储自动均衡（无需手动balancer）
  HDFS → 对象存储迁移替代balancer
```

### DataNode Decommissioning（退役）

```
退役流程：
  1. 配置退役节点名单（dfs.hosts.exclude）
  2. NameNode检测到退役节点
  3. 后台复制该节点所有块到其他节点
  4. 副本数恢复后，节点进入退役完成状态
  5. 物理下线节点

注意：
  退役期间占网络带宽（副本复制）
  同时退役多节点可能导致副本不足
  监控：副本不足告警、退役进度
```

### 云存储对比：S3 vs HDFS vs GCS vs ADLS

| 维度 | S3 | HDFS | GCS | ADLS |
|------|-----|------|-----|------|
| 类型 | 对象存储 | 分布式文件系统 | 对象存储 | 对象存储 |
| 接口 | REST API | HDFS API | REST API | REST API |
| 一致性 | 最终一致 | 强一致 | 最终一致 | 最终一致 |
| 定价 | $0.023/GB/月 | 自管硬件 | $0.020/GB/月 | $0.018/GB/月 |
| 小文件 | 无限制 | 受NN限制 | 无限制 | 无限制 |
| 生态 | AWS全栈+Iceberg | Hadoop全栈 | GCP BigQuery | Azure Synapse |
| 加密 | SSE/SSE-KMS | 传输+静态 | CMEK | SSE |
| 生命周期 | 自动分层 | 手动策略 | 自动分层 | 自动分层 |

```
选型建议：
  云原生 → S3/GCS/ADLS（免运维、按量付费）
  混合云 → HDFS（本地）+ S3（云端）用DistCp同步
  湖仓底座 → 对象存储 + Iceberg（最通用）
  传统Hadoop → HDFS（兼容性最好）
```

### MinIO 作为 HDFS 替代

```
MinIO定位：高性能对象存储（S3兼容API）

优势：
  100% S3 API兼容，HDFS数据可无缝迁移
  部署简单：单二进制、K8s原生
  性能：NVMe SSD，单对象读写极快
  扩展：线性扩展，PB级
  开源：AGPLv3许可

与HDFS对比：
  MinIO：REST API、无元数据单点、云原生
  HDFS：HDFS API、NameNode单点、Hadoop生态

适用场景：
  替代小规模HDFS集群
  湖仓底座（+Iceberg/Hudi）
  K8s原生数据平台
  多云/混合云存储统一

迁移路径：
  HDFS → DistCp → S3A → MinIO
  Iceberg表：直接修改catalog指向MinIO
```

### 数据湖存储格式深度对比

| 维度 | Delta Lake | Apache Iceberg | Apache Hudi |
|------|-----------|---------------|-------------|
| ACID事务 | ✅ | ✅ | ✅ |
| 时间旅行 | ✅ | ✅ | ✅ |
| Schema演进 | ✅ | ✅ | ✅ |
| 分区演进 | 有限 | ✅ 隐藏分区 | ✅ |
| 流式写入 | 有限 | 增强中 | ✅ Flink集成 |
| 流式读取 | 有限 | 增量读 | ✅ |
| 引擎支持 | Spark为主 | 全引擎 | Spark/Flink |
| 开放程度 | 半开放 | Apache顶级 | Apache顶级 |
| 社区 | Databricks主导 | 社区驱动 | Uber发起 |

```
选型决策：
  Databricks生态 → Delta Lake
  通用互操作+多引擎 → Iceberg（推荐）
  Flink实时链路 → Paimon（Apache孵化）
  传统Hive+Hudi → Hudi

2025趋势：
  Iceberg成为事实标准（Snowflake/Databricks/AWS共支持）
  Paimon在Flink生态崛起
  DuckLake探索元数据简化
```

### 存储分层策略

```mermaid
flowchart TD
    A[数据写入] --> B{访问频率?}
    B -->|日/小时| C[热层: SSD/高性能]
    B -->|周/月| D[温层: 标准存储]
    B -->|季度/年| E[冷层: 低频存储]
    B -->|极少| F[冰层: 归档]
    C -->|30天未访问| D
    D -->|90天未访问| E
    E -->|1年未访问| F
    F -->|合规到期| G[删除]
```

| 层级 | 媒介 | $/GB/月 | 访问延迟 | 适用 |
|------|------|---------|---------|------|
| Hot | SSD | $0.10 | ms级 | 实时分析 |
| Warm | 标准S3 | $0.023 | 100ms | 日常查询 |
| Cold | S3 IA | $0.0125 | 分钟级 | 季度报表 |
| Archive | Glacier | $0.004 | 小时级 | 合规归档 |

```
成本收益：
  Hot→Warm：降成本75%
  Warm→Cold：降成本50%
  Cold→Archive：降成本70%
  合理分层可降存储总成本40%~60%

执行方式：
  对象存储：Lifecycle Policy自动迁移
  Iceberg：按分区时间戳归档到低频
  HDFS：Storage Policy + HDFS Mover
```

---

## 十一、HDFS NameNode HA（QJM）

### QJM 架构

```
QJM（Quorum Journal Manager）架构：
  Active NN：处理所有客户端请求
  Standby NN：热备，同步元数据
  JournalNode（JN）：共享editlog，多数派写入
  ZKFC：ZK故障检测，自动切换

工作流程：
  1. Active NN写editlog到JN（多数派写入成功才返回）
  2. Standby NN从JN读取editlog同步
  3. ZKFC监控NN健康状态
  4. Active NN故障时，ZKFC触发故障转移
  5. Standby NN提升为Active

配置示例：
  dfs.namenode.name.dir：元数据存储目录
  dfs.namenode.shared.edits.dir：JN地址列表
  dfs.ha.fencing.methods：隔离方法
  dfs.ha.automatic-failover.enabled：自动故障转移
```

### QJM 配置要点

| 配置项 | 说明 | 推荐值 |
|--------|------|--------|
| dfs.ha.journalnode.rpc-address | JN RPC地址 | 0.0.0.0:8485 |
| dfs.ha.journalnode.http-address | JN HTTP地址 | 0.0.0.0:8480 |
| dfs.namenode.shared.edits.dir | JN存储目录 | qjournal://jn1:8485;jn2:8485;jn3:8485/ns1 |
| dfs.ha.fencing.methods | 隔离方法 | sshfence(hdfs:22) |
| dfs.ha.automatic-failover.enabled | 自动故障转移 | true |

### Federation + HA

```
Federation + HA架构：
  NS1：Active NN1 + Standby NN1
  NS2：Active NN2 + Standby NN2
  共享DataNode存储池
  客户端挂载表路由

优势：
  元数据横向扩展（多NS）
  高可用（每个NS有HA）
  多租户隔离（不同NS管理不同目录）
```

## HDFS 分层存储（HOT/WARM/COLD/ALL_SSD）

### 存储策略详解

| 策略 | 副本/EC | 介质 | 访问延迟 | 成本 | 适用数据 |
|------|--------|------|----------|------|----------|
| HOT | 3副本 | 高性能磁盘 | ms级 | 高 | 频繁访问 |
| WARM | 1副本+EC | 标准磁盘 | 100ms | 中 | 低频访问 |
| COLD | EC-6-3 | 低频存储 | 分钟级 | 低 | 极少访问 |
| ALL_SSD | 3副本(SSD) | SSD | ms级 | 最高 | 实时分析 |
| ONE_SSD | 1副本(SSD)+2磁盘 | SSD+磁盘 | ms级 | 中高 | 混合 |
| LAZY_PERSIST | 内存→异步落盘 | 内存+磁盘 | ms级 | 中 | 临时数据 |

### 自动分层策略

```mermaid
flowchart TD
    A[数据写入] --> B{访问频率?}
    B -->|日/小时| C[HOT: SSD/高性能]
    B -->|周/月| D[WARM: 标准存储]
    B -->|季度/年| E[COLD: 低频存储]
    B -->|极少| F[ALL_SSD: 归档]
    C -->|30天未访问| D
    D -->|90天未访问| E
    E -->|1年未访问| F
    F -->|合规到期| G[删除]
```

### 配置命令

```bash
# 设置存储策略
hdfs storagepolicies -setStoragePolicy -path /data -policy WARM

# 触发数据迁移
hdfs mover -p /data

# 查看存储策略
hdfs storagepolicies -getStoragePolicy -path /data

# 自动分层脚本
#!/bin/bash
# HOT → WARM（30天未访问）
find /data -type f -atime +30 -exec hdfs dfs -setStoragePolicy -path {} -policy WARM \;

# WARM → COLD（90天未访问）
find /data -type f -atime +90 -exec hdfs dfs -setStoragePolicy -path {} -policy COLD \;
```

## HDFS 纠删码（EC）开销分析

### EC vs 副本对比

| 指标 | 3副本 | RS-6-3 | RS-10-4 |
|------|-------|--------|---------|
| 存储开销 | 3× | 1.5× | 1.4× |
| 冗余能力 | 丢2块可恢复 | 丢3块可恢复 | 丢4块可恢复 |
| 写入开销 | 低 | 中(计算校验) | 中高 |
| 读取开销 | 低 | 中(可能需恢复) | 中高 |
| 恢复开销 | 低(直接复制) | 高(读多块+计算) | 高 |
| 适用场景 | 热数据 | 温/冷数据 | 冷数据 |

### EC 开销计算

```
EC写入开销：
  数据块：6块 × 128MB = 768MB
  校验块：3块 × 128MB = 384MB
  总写入：1152MB（1.5×原始数据）
  计算开销：RS编码计算（CPU密集）

EC读取开销：
  正常读：6块 × 128MB = 768MB
  恢复读：读剩余块 + 计算恢复（网络+CPU）
  延迟：比副本读高2-5倍

EC恢复开销：
  丢失1块：读5块 + 计算恢复（最常见）
  丢失2块：读4块 + 计算恢复
  丢失3块：读3块 + 计算恢复（极限）
  恢复时间：取决于网络带宽和CPU
```

### EC 最佳实践

```
EC适用场景：
  冷数据目录（归档/日志）
  WORM数据（Write Once Read Many）
  存储成本敏感场景
  数据量大但访问少

EC不适用场景：
  频繁写入（CPU开销大）
  低延迟读取（恢复慢）
  小文件（EC块对齐问题）
  高IOPS场景（网络开销）

配置建议：
  策略选择：RS-6-3（平衡性能和冗余）
  块大小：1024KB（默认）
  目录规划：冷数据单独目录
  监控：EC块健康状态、恢复进度
```

## 云对象存储作为 HDFS 替代（S3A）

### S3A 客户端配置

```xml
<!-- core-site.xml -->
<property>
  <name>fs.s3a.impl</name>
  <value>org.apache.hadoop.fs.s3a.S3AFileSystem</value>
</property>
<property>
  <name>fs.s3a.endpoint</name>
  <value>s3.amazonaws.com</value>
</property>
<property>
  <name>fs.s3a.access.key</name>
  <value>YOUR_ACCESS_KEY</value>
</property>
<property>
  <name>fs.s3a.secret.key</name>
  <value>YOUR_SECRET_KEY</value>
</property>
<property>
  <name>fs.s3a.path.style.access</name>
  <value>false</value>
</property>
<property>
  <name>fs.s3a.connection.maximum</name>
  <value>200</value>
</property>
<property>
  <name>fs.s3a.fast.upload</name>
  <value>true</value>
</property>
```

### HDFS vs S3A 性能对比

| 维度 | HDFS | S3A |
|------|------|-----|
| 顺序读 | 高(本地磁盘) | 中(网络IO) |
| 顺序写 | 高(本地磁盘) | 中(网络IO) |
| 随机读 | 低(不支持) | 低(不支持) |
| 小文件 | 差(NN瓶颈) | 好(无NN) |
| 并发 | 中(NN瓶颈) | 高(REST API) |
| 成本 | 高(自管硬件) | 低(按量付费) |

```
性能优化：
  1. 大文件顺序读（避免小对象）
  2. 列式存储（Parquet/ORC）下推
  3. 本地缓存（Alluxio/SSD cache）
  4. 向量化读（Arrow格式）
  5. 多线程并发读
```

## 数据湖文件格式对比

### Parquet/ORC/Avro 对比

| 维度 | Parquet | ORC | Avro |
|------|---------|-----|------|
| 存储方式 | 列式 | 列式 | 行式 |
| 压缩率 | 高 | 最高 | 中 |
| Schema演进 | Footer嵌入 | Stripe元数据 | Schema嵌入 |
| 查询性能 | 高 | 最高 | 低 |
| 写入性能 | 中 | 中 | 高 |
| 生态支持 | 最广 | Hive为主 | Kafka/Hive |
| 适用场景 | OLAP分析 | Hive/Trino | 消息传输 |

### 格式选择决策

```
选择建议：
  OLAP分析 → Parquet（Spark/Trino全支持）
  Hive查询 → ORC（压缩率最高）
  消息传输 → Avro（Schema演进友好）
  数据湖底座 → Parquet（通用性最强）

组合使用：
  Kafka消息 → Avro（Schema演进）
  数据湖存储 → Parquet（列式压缩）
  Hive查询 → ORC（Hive原生支持）
```

## 数据湖 Compaction 策略

### 小文件问题

```
小文件成因：
  1. 流式写入（每条记录一个文件）
  2. 分区过细（按小时/分钟分区）
  3. 频繁更新（每次更新生成新文件）
  4. 并发写入（多个writer同时写入）

影响：
  1. NameNode/S3元数据膨胀
  2. 查询性能下降（读取大量小文件）
  3. 存储效率低（文件头尾浪费）
  4. Compaction成本高
```

### Compaction 策略

| 策略 | 说明 | 适用 | 工具 |
|------|------|------|------|
| 大文件合并 | 合并小文件为大文件 | 冷数据 | Spark/Flink |
| 增量合并 | 只合并新增小文件 | 实时写入 | Iceberg/Hudi |
| 时间窗口合并 | 按时间窗口合并 | 定时任务 | Airflow/DolphinScheduler |
| 访问热度合并 | 热数据优先合并 | 混合负载 | 自定义脚本 |

### Iceberg Compaction

```sql
-- Iceberg compaction
-- 手动触发
CALL catalog.system.rewrite_data_files(
  table => 'db.orders',
  strategy => 'sort',
  sort_order => 'ts DESC',
  options => map('target-file-size-bytes', '134217728')
);

-- 自动compaction配置
-- spark.sql/catalog/iceberg.properties
spark.sql.catalog.prod.catalog-impl=org.apache.iceberg.aws.glue.GlueCatalog
spark.sql.catalog.prod.io-impl=org.apache.iceberg.aws.s3.S3FileIO
```

## 数据湖文件格式深度对比

### Parquet vs ORC vs Avro

| 维度 | Parquet | ORC | Avro |
|------|---------|-----|------|
| 列式存储 | 是 | 是 | 否（行式） |
| 压缩比 | 高 | 最高 | 中 |
| 读取性能 | 高 | 高 | 中 |
| Schema 演进 | 有限 | 有限 | 好 |
| 生态支持 | 最广（Spark/Hive/Presto） | Hive 优先 | Kafka/Hadoop |
| 适用 | OLAP/数据湖 | Hive 数仓 | 流式/CDC |

### 数据湖 Compaction 策略

```
Compaction = 合并小文件 + 清理删除标记

触发条件：
  1. 小文件数量 > 100/分区
  2. 文件大小 < 128MB
  3. 删除标记占比 > 10%

策略选择：
  Snapshot Compaction：合并同一快照的文件
  Incremental Compaction：只合并新增文件
  Full Compaction：全量合并（最彻底）

Spark 配置：
  spark.sql.files.maxRecordsPerFile=1000000
  spark.sql.shuffle.partitions=200
  spark.sql.compaction.actor.enabled=true
```

### 数据湖治理 Checklist

| 治理项 | 做法 | 频率 |
|--------|------|------|
| 存储成本 | 监控存储量/增长率 | 每周 |
| 数据质量 | Schema 检查/空值率/一致性 | 每日 |
| 生命周期 | 冷热分层/过期数据清理 | 每月 |
| 权限管理 | RBAC/ABAC 权限审计 | 每月 |
| 元数据 | 表/列/血缘信息维护 | 持续 |
| 合规审计 | 数据访问日志/脱敏 | 每月 |
| 版本管理 | Iceberg/Delta 快照保留策略 | 每周 |
| Compaction | 小文件合并/孤儿文件清理 | 每日 |

### HDFS 分层存储策略

```
存储分层 = 不同数据用不同存储介质

热数据（最近 7 天）：
  SSD 存储（高性能）
  副本数 3
  适用：实时查询/OLAP

温数据（7 天 ~ 3 个月）：
  普通磁盘（HDD）
  副本数 3
  适用：近线分析

冷数据（3 个月 ~ 1 年）：
  低频存储（Infrequent Access）
  副本数 2 或 EC 编码
  适用：归档/合规

归档数据（1 年以上）：
  归档存储（Glacier/OSS Archive）
  EC 编码（最小冗余）
  适用：合规保留/极少访问

HDFS 策略配置：
  存储策略：HOT/COLD/WARM/ALL_SSD/ONE_SSD/ Lazy_Persist
  设置：hdfs storagepolicies -setStoragePolicy -path /data -policy COLD
  迁移：hdfs mover -p /data
```

### HDFS NameNode 调优

```
NameNode 内存估算：
  每个文件/目录/块 ≈ 150 字节（元数据）
  1 亿文件 ≈ 15GB 内存
  建议：NameNode 内存 = 文件数 × 150B × 1.5（预留）

NameNode 调优参数：
  dfs.namenode.handler.count=200（RPC 处理线程数）
  dfs.namenode.service.handler.count=100（服务 RPC 线程数）
  dfs.namenode.max伴随对象=200000（最大伴随对象数）
  dfs.namenode.fs-limits.min-block-size=1048576（最小块大小）

NameNode HA 配置：
  dfs.ha.namenodes.myns=nn1,nn2
  dfs.namenode.rpc-address.myns.nn1=host1:8020
  dfs.namenode.rpc-address.myns.nn2=host2:8020
  dfs.namenode.shared.edits.dir=qjournal://host1:8485;host2:8485;host3:8485/myns
  
JournalNode 部署：
  至少 3 个（奇数个，多数派写入成功）
  独立部署（不与 NameNode/DataNode 同机）
```

### 云对象存储作为 HDFS 替代

```
S3A / GCS / OSS vs HDFS 对比：

  成本：
    HDFS：自建硬件 + 运维（3 副本 = 3 倍存储成本）
    对象存储：按使用量付费（无运维成本）

  扩展性：
    HDFS：需手动扩容（加 DataNode）
    对象存储：自动无限扩展

  性能：
    HDFS：低延迟（本地磁盘）
    对象存储：高吞吐（并行读取）

  一致性：
    HDFS：强一致
    对象存储：最终一致（S3 严格一致）

  适用：
    HDFS：实时计算（Spark/Flink 本地读取）
    对象存储：数据湖/归档/备份/跨区域

迁移方案：
  1. DistCp：hadoop distcp hdfs://path s3a://path
  2. S3A Connector：Hadoop 原生支持 S3
  3. Alluxio：统一命名空间（HDFS + S3）
```

## 数据湖治理

### 治理维度

### HDFS 运维速查

| 检查项 | 命令 | 说明 |
|--------|------|------|
| 块报告 | `hdfs fsck / -files -blocks` | 查看块分布 |
| 平衡器 | `hdfs balancer -threshold 10` | 块均衡 |
| 安全模式 | `hdfs dfsadmin -safemode get` | 检查安全模式 |
| 配额管理 | `hdfs dfs -setquota N /path` | 目录配额 |
| 快照 | `hdfs dfsadmin -allowSnapshot /path` | 数据快照 |
| KMS 加密 | `hdfs crypto -createZone -keyName key1 -path /zone` | 透明加密 |

### HDFS 故障排查清单

| 故障现象 | 可能原因 | 排查方法 |
|----------|----------|----------|
| 写入失败 | 节点满/副本不足 | `hdfs dfsadmin -report` |
| 读取超时 | 网络/磁盘慢 | `iostat` + `ping` |
| NameNode OOM | 小文件过多 | `hdfs dfs -count` 统计 |
| DataNode 掉线 | 磁盘故障 | `dmesg` + `smartctl` |
| 块丢失 | 磁盘损坏 | `hdfs fsck / -list-corruptfileblocks` |
| 租约超时 | 客户端异常退出 | 检查客户端进程 |

### 数据湖治理 Checklist

| 治理项 | 做法 | 频率 |
|--------|------|------|
| 存储成本 | 监控存储量/增长率 | 每周 |
| 数据质量 | Schema 检查/空值率/一致性 | 每日 |
| 生命周期 | 冷热分层/过期数据清理 | 每月 |
| 权限管理 | RBAC/ABAC 权限审计 | 每月 |
| 元数据 | 表/列/血缘信息维护 | 持续 |
| 合规审计 | 数据访问日志/脱敏 | 每月 |
| 版本管理 | Iceberg/Delta 快照保留策略 | 每周 |
| Compaction | 小文件合并/孤儿文件清理 | 每日 |

## 三十八、HDFS 3.x Erasure Coding vs RAID 深度对比

### EC vs RAID 性能基准

| 维度 | HDFS EC (RS-6-3) | RAID 5 | RAID 6 | 3 副本 |
|------|------------------|--------|--------|--------|
| 存储效率 | 66.7% | 75% | 80% | 33.3% |
| 容错能力 | 3 块丢失 | 1 块丢失 | 2 块丢失 | 2 块丢失 |
| 写放大 | 1.5x + CPU | 1.33x | 1.25x | 3x |
| 恢复时间 | 分钟级（网络读多块） | 秒级（本地重建） | 秒级 | 秒级（直接复制） |
| 扩展性 | 横向无限扩展 | 受限于控制器 | 受限于控制器 | 横向扩展 |
| 适用场景 | 冷数据/归档 | 本地磁盘阵列 | 高可靠本地存储 | 热数据 |

```
EC 重建开销分析：
  丢失 1 块：读 5 块 + RS 计算恢复（CPU 密集）
  丢失 2 块：读 4 块 + RS 计算恢复
  丢失 3 块：读 3 块 + RS 计算恢复（极限）
  恢复带宽占用：n 块并行读取 × 网络传输

EC vs RAID 选型：
  HDFS 集群 → EC（原生支持，横向扩展）
  本地存储 → RAID（低延迟重建）
  冷数据目录 → EC（存储效率高）
  热数据 → 副本（低延迟读取）
```

## 三十九、HDFS 存储策略自动化管理

### 策略生命周期管理

```bash
# 自动分层脚本（基于访问热度）
#!/bin/bash
# HOT → WARM（30 天未访问）
hdfs dfs -ls -R /data | awk '{print $8}' | while read file; do
  atime=$(hdfs dfs -stat "%A" "$file")
  now=$(date +%s)
  days=$(( (now - atime) / 86400 ))
  if [ $days -gt 30 ]; then
    hdfs storagepolicies -setStoragePolicy -path "$file" -policy WARM
  fi
done

# WARM → COLD（90 天未访问）
# 同理替换策略为 COLD

# 触发迁移
hdfs mover -p /data

# 监控迁移进度
hdfs mover -p /data -moveWorkerThreads 4
```

### 存储策略监控

| 监控指标 | 说明 | 告警阈值 |
|----------|------|----------|
| 策略分布 | 各策略下数据量占比 | 异常波动 |
| 迁移积压 | 待迁移数据量 | > 1TB |
| 迁移失败率 | 迁移失败比例 | > 5% |
| 存储成本 | 各策略存储成本 | 超预算 |
| 数据热度 | 访问频率分布 | 热数据占比异常 |

## 四十、NameNode RPC 性能优化深入

### handler.count 调优

```
NameNode RPC 处理瓶颈：
  单线程处理所有元数据请求 → 高并发下延迟飙升
  handler.count 控制 RPC 处理线程数

调优公式：
  handler.count = 预期并发连接数 × 1.5（预留）
  建议范围：100~300（根据集群规模）

  1000 主机集群：handler.count = 150~200
  5000 主机集群：handler.count = 200~300
  10000 主机集群：handler.count = 300~500

监控指标：
  NameNode RPC Queue Length：RPC 队列长度
  NameNode RPC Processing Time：RPC 处理时间
  NameNode GetImage/Txn：fsimage 加载时间

瓶颈排查：
  1. jstack 查看 NameNode 线程状态
  2. 检查 RPC 队列是否积压
  3. 检查 fsimage 合并频率
  4. 检查 block 操作频率
```

### 其他 RPC 优化参数

| 参数 | 默认值 | 说明 | 建议值 |
|------|--------|------|--------|
| dfs.namenode.handler.count | 10 | RPC 处理线程数 | 100~300 |
| dfs.namenode.service.handler.count | 10 | 服务 RPC 线程数 | 100~200 |
| dfs.namenode.max-extra-delay | 2s | 超时延迟 | 2~5s |
| dfs.namenode.fs-limits.min-block-size | 1MB | 最小块大小 | 64MB |
| dfs.namenode.safemode.threshold-pct | 0.999 | 安全模式阈值 | 0.999 |

## 与其他板块的关系

- 对象存储见「[对象存储 MinIO/OSS](../中间件/对象存储MinIO-OSS.md)」；
- 调度系统见「[10-资源调度：YARN与Kubernetes](10-资源调度：YARN与Kubernetes.md)」；
- 数据湖格式见「[05-列式存储与数据湖格式](05-列式存储与数据湖格式.md)」；
- 流处理写入 HDFS 见「[08-流处理计算：Flink](08-流处理计算：Flink.md)」。

| 维度 | 说明 | 工具 |
|------|------|------|
| 表管理 | 表生命周期、权限 | Catalog |
| Schema管理 | 版本演进、兼容性 | Schema Registry |
| 数据质量 | 质量规则、监控 | Great Expectations |
| 安全治理 | 加密、脱敏、审计 | Ranger |
| 成本治理 | 存储分层、清理 | Lifecycle Policy |

### 治理最佳实践

```
表治理：
  1. 表Owner负责制
  2. 表生命周期管理（热→温→冷→归档→删除）
  3. 僵尸表清理（无查询+无引用→标记删除）
  4. 数据血缘（表级+字段级）

Schema治理：
  1. Schema版本管理
  2. 兼容性检查（BACKWARD/FORWARD）
  3. 破坏性变更审批
  4. 代码生成（多语言绑定）

数据质量：
  1. 质量规则定义（非空、范围、一致性）
  2. 质量监控（实时+离线）
  3. 质量告警（P0/P1/P2分级）
  4. 质量修复（自动+人工）
```

> 一句话：**HDFS = 分块（128MB）+ 多副本（机架感知）+ 中心元数据（NN+QJM HA）——理解"小文件是杀手、随机写是弱项、EC 是冷数据降本神器"；新平台转对象存储 + 开放表格式实现存算分离**。

---

## 二十一、HDFS 3.x Erasure Coding 性能与 RAID 对比

### 21.1 Erasure Coding 原理

```text
Erasure Coding（纠删码）：
  将数据编码为 n 个数据块 + m 个校验块
  任意 m 个块丢失可恢复
  存储开销 = (n+m)/n（远低于 3 副本）

HDFS 3.x 默认策略：
  RS-6-3-1024k：6 数据块 + 3 校验块
  存储开销：9/6 = 1.5x（vs 3 副本 3x）
  容错：任意 3 块丢失可恢复
```

### 21.2 EC vs RAID 对比

| 维度 | HDFS EC | RAID 5 | RAID 6 |
|------|---------|--------|--------|
| 存储开销 | 1.5x | 1.33x | 1.25x |
| 容错能力 | 3 块丢失 | 1 块丢失 | 2 块丢失 |
| 扩展性 | 横向扩展 | 受限 | 受限 |
| 适用场景 | 冷数据/归档 | 本地磁盘 | 本地磁盘 |
| HDFS 集成 | 原生支持 | 需要外部存储 | 需要外部存储 |

### 21.3 EC 配置

```bash
# 启用 EC 策略
hdfs ec -setPolicy -path /cold-data -policy RS-6-3-1024k

# 查看 EC 策略
hdfs ec -getPolicy -path /cold-data

# 查看所有 EC 策略
hdfs ec -listPolicies
```

## 二十二、HDFS 存储策略（HOT / WARM / COLD / ALL_SSD）配置

### 22.1 存储策略对比

| 策略 | 副本数 | 介质 | 适用场景 |
|------|--------|------|---------|
| HOT | 3 | 磁盘 | 频繁访问 |
| WARM | 2 | 磁盘+归档 | 偶尔访问 |
| COLD | 1 | 归档/冷存储 | 极少访问 |
| ALL_SSD | 3 | SSD | 高性能需求 |
| ONE_SSD | 2 | SSD+磁盘 | 性能+成本平衡 |
| LAZY_PERSIST | 2 | 内存+磁盘 | 写密集 |

### 22.2 存储策略配置

```bash
# 设置存储策略
hdfs storagepolicies -setStoragePolicy -path /data/hot -policy HOT
hdfs storagepolicies -setStoragePolicy -path /data/warm -policy WARM
hdfs storagepolicies -setStoragePolicy -path /data/cold -policy COLD

# 迁移数据到新策略
hdfs mover -p /data/warm

# 查看存储策略
hdfs storagepolicies -getStoragePolicy -path /data/hot
```

## 二十三、HDFS Balancer 最佳实践（带宽限制 / 阈值设置）

### 23.1 Balancer 配置参数

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| `dfs.datanode.balance.bandwidthPerSec` | 每节点带宽限制 | 100MB/s |
| `dfs.balancer.period` | Balancer 周期 | 300s |
| `dfs.datanode.balance.bandwidthPerSec` | 并发平衡线程数 | 5 |
| 阈值 | 节点利用率差异 | 10% |

### 23.2 Balancer 执行

```bash
# 启动 Balancer（阈值 10%）
hdfs balancer -threshold 10 -policy datanode

# 限制带宽
hdfs balancer -threshold 10 -policy datanode \
  -Ddfs.datanode.balance.bandwidthPerSec=104857600

# 查看 Balancer 状态
hdfs dfsadmin -printTopology
```

## 二十四、HDFS NameNode RPC 处理优化（handler.count）

### 24.1 关键配置参数

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| `dfs.namenode.handler.count` | NameNode RPC 处理线程数 | 100~200 |
| `dfs.namenode.service.handler.count` | 服务 RPC 处理线程数 | 100 |
| `dfs.namenode.max-extra-delay` | 超时延迟 | 2s |
| `dfs.namenode.max-lock-hold-time` | 锁持有时间 | 5s |

### 24.2 优化建议

```xml
<!-- hdfs-site.xml -->
<property>
  <name>dfs.namenode.handler.count</name>
  <value>200</value>
</property>
<property>
  <name>dfs.namenode.service.handler.count</name>
  <value>100</value>
</property>
<property>
  <name>dfs.namenode.safemode.threshold-pct</name>
  <value>0.999</value>
</property>
```

## 二十五、云对象存储替代 HDFS（S3A / GCS 配置对比）

### 25.1 对象存储对比

| 维度 | S3A (AWS) | GCS (GCP) | OSS (阿里云) |
|------|-----------|-----------|-------------|
| 协议 | S3 API | GCS API | S3 兼容 |
| 一致性 | 最终一致 | 强一致 | 最终一致 |
| 延迟 | 10~100ms | 10~100ms | 10~100ms |
| 成本 | 按量计费 | 按量计费 | 按量计费 |
| 适用 | AWS 体系 | GCP 体系 | 阿里云体系 |

### 25.2 S3A 配置示例

```xml
<!-- core-site.xml -->
<property>
  <name>fs.s3a.endpoint</name>
  <value>s3.amazonaws.com</value>
</property>
<property>
  <name>fs.s3a.access.key</name>
  <value>${AWS_ACCESS_KEY}</value>
</property>
<property>
  <name>fs.s3a.path.style.access</name>
  <value>false</value>
</property>
<property>
  <name>fs.s3a.fast.upload</name>
  <value>true</value>
</property>
```

## 二十七、Erasure Coding 纠删码技术

### 27.1 纠删码原理

```text
纠删码（Erasure Coding）原理：
  - 将数据分成 k 个数据块
  - 编码生成 m 个校验块
  - 任意 k 个块可恢复原始数据
  - 存储开销：(k+m)/k 倍（传统副本：3倍）

HDFS 纠删码配置：
  RS-6-3-1024k：6 数据块 + 3 校验块
  存储开销：9/6 = 1.5 倍（vs 副本 3 倍）
  容错能力：任意 3 块丢失可恢复
```

### 27.2 纠删码 vs 副本对比

| 维度 | 3 副本 | RS-6-3 纠删码 |
|------|--------|---------------|
| 存储开销 | 3 倍 | 1.5 倍 |
| 写入性能 | 高 | 中 |
| 读取性能 | 高 | 中 |
| 恢复速度 | 快 | 慢 |
| 容错能力 | 2 节点 | 3 节点 |
| 适用场景 | 热数据 | 冷数据/归档 |

---

## 二十八、HDFS 存储策略与生命周期管理

### 28.1 HDFS 存储策略

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| HOT | 默认策略，3 副本 | 热数据 |
| WARM | 1 副本 + 2 纠删码 | 温数据 |
| COLD | 纠删码存储 | 冷数据 |
| ALL_SSD | 所有副本在 SSD | 低延迟读取 |
| ONE_SSD | 1 副本 SSD + 2 副本 HDD | 成本优化 |
| LAZY_PERSIST | 内存写入后异步落盘 | 临时数据 |

### 28.2 自动数据迁移

```bash
# 设置存储策略
hdfs storagepolicies -setStoragePolicy -path /data/hot -policy HOT
hdfs storagepolicies -setStoragePolicy -path /data/warm -policy WARM
hdfs storagepolicies -setStoragePolicy -path /data/cold -policy COLD

# 执行数据迁移
hdfs mover -p /data

# 配置自动迁移（hdfs-policy.xml）
<property>
  <name>dfs.storagepolicies.move.timeout</name>
  <value>1800000</value> <!-- 30分钟 -->
</property>
```

---

## 二十九、HDFS Balancer 均衡器

### 29.1 Balancer 工作原理

```text
HDFS Balancer 流程：
  1. 扫描所有 DataNode 使用率
  2. 计算集群平均使用率
  3. 找出使用率高于/低于阈值的节点
  4. 从高使用率节点迁移数据到低使用率节点
  5. 重复直到达到阈值范围

关键参数：
  dfs.datanode.balance.bandwidthPerSec：迁移带宽
  dfs.balancer.bandwidthPerSec：默认 10MB/s
  dfs.balancer.max-size-to-move：单次最大迁移量
```

### 29.2 Balancer 调优

| 参数 | 默认值 | 生产建议 | 说明 |
|------|--------|----------|------|
| bandwidthPerSec | 10MB/s | 100MB/s | 迁移带宽 |
| threshold | 10% | 5% | 均衡阈值 |
| max-size-to-move | 2GB | 10GB | 单次迁移量 |
| iterations | 1 | 5 | 执行次数 |

```bash
# 运行 Balancer
hdfs balancer -threshold 5 -policy datanode -D dfs.datanode.balance.bandwidthPerSec=104857600

# 监控 Balancer 状态
hdfs dfsadmin -report | grep "DFS Used%"
```

---

## 三十、HDFS NameNode RPC 性能优化

### 30.1 NameNode RPC 瓶颈

```text
NameNode RPC 瓶颈原因：
  1. 单线程处理所有元数据请求
  2. FSImage 加载/保存阻塞 RPC
  3. 大量小文件导致元数据膨胀
  4. 频繁的 block 操作消耗资源
```

### 30.2 NameNode 优化配置

| 参数 | 默认值 | 生产建议 | 说明 |
|------|--------|----------|------|
| dfs.namenode.handler.count | 10 | 100 | RPC 处理线程数 |
| dfs.namenode.service.handler.count | 10 | 100 | 服务 RPC 线程数 |
| dfs.namenode.fs-limits.min-block-size | 1MB | 64MB | 最小块大小 |
| dfs.namenode.fs-limits.max-blocks-per-file | 1M | 100K | 单文件最大块数 |

### 30.3 NameNode 高可用配置

```xml
<!-- hdfs-site.xml -->
<property>
  <name>dfs.nameservices</name>
  <value>mycluster</value>
</property>
<property>
  <name>dfs.ha.namenodes.mycluster</name>
  <value>nn1,nn2</value>
</property>
<property>
  <name>dfs.namenode.rpc-address.mycluster.nn1</name>
  <value>namenode1:8020</value>
</property>
<property>
  <name>dfs.namenode.rpc-address.mycluster.nn2</name>
  <value>namenode2:8020</value>
</property>
<property>
  <name>dfs.namenode.shared.edits.dir</name>
  <value>qjournal://journalnode1:8485;journalnode2:8485;journalnode3:8485/mycluster</value>
</property>
```

---

## 三十一、云存储替代 HDFS 方案对比

### 31.1 云存储 vs HDFS

| 维度 | HDFS | S3/OSS | 适用场景 |
|------|------|--------|----------|
| 延迟 | 毫秒级 | 十毫秒级 | 热数据用 HDFS |
| 成本 | 高 | 低 | 冷数据用 S3 |
| 扩展性 | 有限 | 无限 | 海量数据用 S3 |
| 一致性 | 强一致 | 最终一致 | 强一致场景用 HDFS |
| 运维 | 复杂 | 托管 | 运维能力弱用 S3 |

### 31.2 混合存储架构

```mermaid
graph LR
    A[应用] --> B[HDFS 热数据]
    A --> C[S3/OSS 冷数据]
    B -->|迁移| C
    C -->|恢复| B
    D[元数据] --> B
    D --> C
```

---

## 三十二、HDFS 数据治理实践

### 32.1 数据治理工具对比

| 工具 | 功能 | 适用场景 |
|------|------|---------|
| Apache Atlas | 元数据管理+血缘+分类 | Hadoop 生态 |
| DataHub | 元数据平台+搜索+血缘 | 现代数据栈 |
| Amundsen | 元数据搜索+数据发现 | 数据发现 |
| OpenMetadata | 元数据标准+治理 | 通用 |

### 32.2 数据治理实践

| 治理维度 | 工具 | 实现方式 |
|----------|------|---------|
| 元数据管理 | Atlas/DataHub | 自动采集 HDFS 表/列元数据 |
| 数据血缘 | Atlas | ETL 任务血缘自动关联 |
| 数据分类 | Atlas | 敏感数据自动分类标签 |
| 数据质量 | Great Expectations | 数据质量规则校验 |
| 生命周期 | HDFS 策略 | HOT/WARM/COLD 自动迁移 |

---

## 三十三、HDFS 小文件治理

### 33.1 小文件问题

```text
小文件问题：
  1. NameNode 内存膨胀：每个文件/块占 150 bytes
  2. MapReduce 性能下降：每个文件一个 MapTask
  3. 磁盘 IO 增加：大量小文件寻址开销
  4. Compaction 开销：小文件合并消耗资源
```

### 33.2 小文件解决方案

| 方案 | 说明 | 适用场景 |
|------|------|----------|
| HAR（Hadoop Archive） | 归档小文件 | 历史数据 |
| SequenceFile | 合并为序列文件 | MapReduce 输入 |
| CombineFileInputFormat | 合并输入分片 | MapReduce |
| 数据库合并 | HBase Compaction | 列式存储 |
| 定期清理 | 删除过期小文件 | 临时数据 |

```bash
# 创建 HAR 归档
hadoop archive -archiveName data.har -p /data/input /data/output

# 查看 HAR 内容
hadoop fs -ls har:///data/output/data.har
```

---

## 三十四、HDFS 快照与备份

### 34.1 HDFS 快照功能

```bash
# 启用快照
hdfs dfsadmin -allowSnapshot /data

# 创建快照
hdfs dfs -createSnapshot /data snapshot-20240101

# 查看快照
hdfs lsSnapshots /data

# 删除快照
hdfs dfs -deleteSnapshot /data snapshot-20240101

# 恢复快照
hdfs dfs -cp har:///data/.snapshot/snapshot-20240101/file /data/file
```

### 34.2 快照应用场景

| 场景 | 说明 | 命令 |
|------|------|------|
| 数据备份 | 定期创建快照 | `hdfs dfs -createSnapshot` |
| 数据恢复 | 从快照恢复文件 | `hdfs dfs -cp` |
| 数据对比 | 对比两个快照差异 | `hdfs dfs -diff` |
| 数据迁移 | 基于快照迁移 | `hdfs distcp` |

---

## 三十五、HDFS 跨集群复制

### 35.1 HDFS DistCp 工具

```bash
# 跨集群复制
hadoop distcp hdfs://cluster1/data hdfs://cluster2/data

# 带宽限制
hadoop distcp -update -bandwidth 100 hdfs://cluster1/data hdfs://cluster2/data

# 断点续传
hadoop distcp -update -skipcrccheck hdfs://cluster1/data hdfs://cluster2/data
```

### 35.2 跨集群复制配置

| 参数 | 说明 | 生产建议 |
|------|------|----------|
| -update | 增量更新 | 启用 |
| -delete | 删除目标多余文件 | 谨慎使用 |
| -bandwidth | 限制带宽 | 按网络能力设置 |
| -m | 并行度 | 10~20 |
| -skipcrccheck | 跳过 CRC 检查 | 跨集群启用 |

---

## 三十六、HDFS 安全配置

### 36.1 Kerberos 认证

```xml
<!-- core-site.xml -->
<property>
  <name>hadoop.security.authentication</name>
  <value>kerberos</value>
</property>
<property>
  <name>hadoop.security.authorization</name>
  <value>true</value>
</property>
```

### 36.2 HDFS ACL 权限

```bash
# 设置 ACL
hdfs dfs -setfacl -m user:hive:rwx /data/hive

# 查看 ACL
hdfs dfs -getfacl /data/hive

# 移除 ACL
hdfs dfs -setfacl -b /data/hive
```

---

## 三十七、HDFS 故障排查指南

### 37.1 常见故障排查

```mermaid
graph TD
    A[故障告警] --> B{检查 NameNode 状态}
    B -->|异常| C[重启 NameNode]
    B -->|正常| D{检查 DataNode 状态}
    D -->|DataNode 挂| E[检查日志 + 重启]
    D -->|读写延迟高| F{检查 IO/网络}
    F -->|磁盘 IO 高| H[检查 Balancer]
    F -->|网络抖动| I[检查网络配置]
    H -->|Balancer 积压| J[调整带宽参数]
```

### 37.2 常用诊断命令

```bash
# 集群状态
hdfs dfsadmin -report

# NameNode 状态
hdfs haadmin -getServiceState nn1

# 检查文件系统
hdfs fsck / -files -blocks -locations

# 查看 DataNode 状态
hdfs dfsadmin -report | grep "Live datanodes"
```

---

## 二十六、数据治理工具（Apache Atlas / DataHub）在 HDFS 中的应用

### 26.1 数据治理工具对比

| 工具 | 功能 | 适用场景 |
|------|------|---------|
| Apache Atlas | 元数据管理+血缘+分类 | Hadoop 生态 |
| DataHub | 元数据平台+搜索+血缘 | 现代数据栈 |
| Amundsen | 元数据搜索+数据发现 | 数据发现 |
| OpenMetadata | 元数据标准+治理 | 通用 |

### 26.2 HDFS 数据治理实践

| 治理维度 | 工具 | 实现方式 |
|----------|------|---------|
| 元数据管理 | Atlas/DataHub | 自动采集 HDFS 表/列元数据 |
| 数据血缘 | Atlas | ETL 任务血缘自动关联 |
| 数据分类 | Atlas | 敏感数据自动分类标签 |
| 数据质量 | Great Expectations | 数据质量规则校验 |
| 生命周期 | HDFS 策略 | HOT/WARM/COLD 自动迁移 |