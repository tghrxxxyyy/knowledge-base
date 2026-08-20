# Ceph 深入（CRUSH 算法 / PG 规划 / RBD 实践 / 故障恢复 / 性能调优）

> Ceph 是**开源的分布式统一存储**，一套集群提供对象（S3）、块（RBD）、文件（CephFS）三种接口。本篇深入拆解：CRUSH 数据分布算法、PG 数量规划、RBD 生产实践、故障恢复流程、性能调优。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 存储种类割裂 | 对象/块/文件三套系统分别建设，管理成本高 |
| 硬件绑定 | 商业存储（EMC/NetApp）贵且绑定硬件 |
| 扩容困难 | 存储扩容要停机/换柜，规模受限 |
| 单点风险 | 集中存储控制器故障 = 数据不可用 |
| 数据可靠性 | 磁盘损坏需要自动修复（自愈） |

> 核心认知：**Ceph = 「软件定义的统一存储」**——普通 x86 服务器 + 千兆网络就能组成一个自我修复的存储集群，一套底座出三种接口（S3/RBD/CephFS）。

---

## 二、架构

```
应用层：S3/OSS（RGW 对象）/ 虚拟机磁盘（RBD 块）/ 文件（CephFS）

服务层：
  ├── RADOS Gateway（RGW）：S3/Swift 兼容对象存储网关
  ├── RBD：块设备（KVM/CephFS 虚拟机磁盘、K8s PVC）
  ├── CephFS：POSIX 文件系统（多活元数据服务器）

核心层（RADOS）：
  ├── OSD（Object Storage Daemon）：每磁盘一个，存数据 + 复制 + 自愈
  ├── MON（Monitor）：维护集群地图（Cluster Map），选举/一致性（Paxos）
  ├── MGR（Manager）：监控/调度/均衡（Prometheus 指标、Balancer）
  └── CRUSH 算法：数据分布（无需查表，确定性计算）
```

---

## 三、CRUSH 算法（深入）

### 3.1 核心思想

```
CRUSH = Controlled Replication Under Scalable Hashing

数据分布过程：
  对象 ID → hash → PG（Placement Group）→ CRUSH 映射（按集群地图确定性计算）
  → 选定 OSD 组合（如 3 副本）

确定性：
  同一对象在任何时刻任何节点计算 → 结果一致
  无需查表（无中心查询）→ 客户端直接定位数据
```

### 3.2 与一致性哈希/HDFS 对比

| 维度 | CRUSH | 一致性哈希 | HDFS |
|------|-------|-----------|------|
| 中心查询 | 无（客户端计算） | 无 | NameNode 集中记录 |
| 扩容迁移 | 只迁移受影响 PG | 只迁移受影响桶 | 需 rebalance |
| 故障域感知 | 原生（机架/机房） | 需扩展 | 需配置 |
| 权重 | 原生（按容量） | 需扩展 | 需配置 |

### 3.3 CRUSH Map 结构

```
CRUSH Map 组成：
  OSD 列表（每个 OSD 的权重/状态）
  故障域层级（host → rack → datacenter → root）
  规则（rule）：副本数 + 故障域约束

示例规则：
  rule replicated_ruleset {
    ruleset 0
    type replicated
    min_size 1
    max_size 10
    step take root        # 从根开始
    step chooseleaf firstn 3 type host  # 选 3 个不同 host
  }
```

### 3.4 权重与重均衡

```
权重 = 相对容量（如 2TB 磁盘权重 = 2.0）

Balancer（MGR 组件）：
  自动检测 PG 分布不均衡
  迁移 PG 到低负载 OSD（后台慢速）
  目标：PG 数按权重比例分布

手动重均衡（旧方式）：
  ceph osd reweight / reweight-by-utilization
```

---

## 四、PG 数量规划（关键实践）

### 4.1 PG 是什么

```
PG（Placement Group）= 对象的逻辑分组
  一个 PG 包含一组对象（默认每个 PG 数千~数万对象）
  PG 是复制/迁移/故障恢复的最小单位

规划原则：
  PG 总数 ≈ OSD 数 × 100（推荐范围 50~200/OSD）

公式：
  总 PG = OSD 数 × 100（每个 OSD 100 个 PG）

示例：
  10 个 OSD → 1000 个 PG
  100 个 OSD → 10000 个 PG
```

### 4.2 PG 数不当的后果

| 问题 | 原因 | 后果 |
|------|------|------|
| PG 太少 | 每个 PG 太大 | 数据分布不均、恢复慢 |
| PG 太多 | 每个 PG 元数据开销 | 内存/CPU 浪费、心跳开销大 |
| PG 数不可改 | 创建 pool 时定死 | 后续只能重建 pool |

### 4.3 PG 幂等法则

```
PG 数量固定后不能改变（pool 创建时决定）
  → 提前规划（考虑 3~5 年扩容）

Pool 相关配置：
  size（副本数）：默认 3
  min_size：最小可用副本（如 2，允许降级运行）
  pg_num：PG 数
  crush_rule：数据分布规则
```

---

## 五、数据可靠性机制

### 5.1 副本 vs 纠删码（EC）

| 方案 | 空间效率 | 计算开销 | 适用 |
|------|----------|----------|------|
| 3 副本 | 33% | 低 | 默认（可靠优先） |
| EC 2+1 | 66% | 中 | 容量敏感 |
| EC 8+3 | 73% | 高 | 大容量归档 |

```
EC（Erasure Coding）：
  数据切成 K 份 + M 份校验 = K+M 份
  任意 M 份丢失可恢复
  8+3 = 11 份，最多容忍 3 份丢失

对比副本：
  同样 3 份冗余 → EC 有效空间 73% vs 副本 33%
  EC 写开销大（计算校验）→ 归档/冷数据用
```

### 5.2 自愈（Self-healing）

```
OSD 故障检测：
  心跳（MON ↔ OSD 每秒）
  超时（默认 60s）→ 标记 down

恢复流程：
  1. OSD down → PG 进入 degraded（降级）状态
  2. 其他副本继续服务（min_size 满足则可写）
  3. 集群调度 → 在健康 OSD 重建缺失副本
  4. 恢复完成 → PG 回到 active+clean
```

### 5.3 Scrub（数据校验）

```
Scrub = 定期对比副本数据（防静默损坏）

类型：
  常规 Scrub：对比对象元数据 + 部分数据
  深度 Scrub：全量数据对比（耗时）

调度：
  默认每天轻量、每周深度
  低峰时段执行（IO 开销大）

发现不一致 → 标记错误 → 用健康副本修复
```

---

## 六、RBD 生产实践

### 6.1 创建与使用

```bash
# 创建 pool
ceph osd pool create rbd 512 512 replicated

# 创建 RBD 镜像
rbd create myvm --size 100G --pool rbd

# 映射到主机（KVM/裸机）
rbd map rbd/myvm

# K8s CSI：创建 StorageClass + PVC 自动创建
```

### 6.2 RBD 快照与克隆

```bash
# 快照
rbd snap create rbd/myvm@backup-20260819

# 克隆（写时复制，秒级创建新镜像）
rbd clone rbd/myvm@backup-20260819 rbd/myvm-clone

# 扁平化（解除父子关系）
rbd flatten rbd/myvm-clone
```

```
快照用途：
  虚拟机备份（定期快照 + 导出）
  灾难恢复（跨集群导出）
  开发环境克隆（秒级创建）

生产建议：
  快照定期清理（防空间膨胀）
  关键数据快照导出到对象存储
```

### 6.3 RBD 性能优化

| 优化 | 说明 |
|------|------|
| 客户端缓存 | librbd 缓存（rbd cache） |
| IO 队列 | rbd queue depth（默认 128） |
| 条带化 | 大块连续写调大条带 |
| 网络 | 集群网络万兆分离 |
| OSD 配置 | osd journal 放 SSD |

---

## 七、故障恢复与运维

### 7.1 集群健康检查

```bash
ceph status              # 集群状态
ceph health detail       # 详细健康信息
ceph osd tree            # OSD 拓扑
ceph pg stat             # PG 状态
ceph osd df              # 容量分布
```

### 7.2 常见故障处理

| 故障 | 现象 | 处理 |
|------|------|------|
| OSD down | 单 OSD 红 | 检查磁盘 → 重启 OSD → 确认恢复 |
| OSD 数据损坏 | PG inconsistent | 深度 Scrub → 标记错误 → 重建 |
| MON 失联 | 多数 MON 不可用 | 恢复 MON（先恢复多数） |
| 网络分区 | 大量 OSD 标记 down | 检查网络 → 恢复 → 等重均衡 |
| 磁盘写满 | OSD 近满告警 | 扩容/清理/权重调整 |

### 7.3 重要运维原则

```
1. 集群不健康时别操作（扩容/删池都受影响）
2. 升级按官方顺序（跨大版本先停）
3. 备份 MON 数据（集群地图）
4. 监控指标：OSD 健康/延迟/PG 状态/容量水位
5. 故障演练（定期模拟 OSD/节点故障）
```

---

## 八、性能调优

### 8.1 硬件配置

| 组件 | 建议 |
|------|------|
| OSD 磁盘 | SSD（热）/ HDD（温） |
| journal/WAL | NVMe（独立于数据盘） |
| 网络 | 万兆起步，集群/公网分离 |
| 内存 | 每 OSD 2~4GB（缓存） |

### 8.2 关键参数

| 参数 | 建议 |
|------|------|
| osd_max_backfills | 1~2（恢复限速防影响业务） |
| osd_recovery_max_active | 3~5 |
| osd_op_threads | 按 CPU 核数 |
| osd_journal_size | 10GB+（SSD） |
| mon_osd_down_out_interval | 600（延迟标记 out，防抖动） |
| Balancer | 开启自动均衡 |

### 8.3 性能瓶颈识别

```
监控指标：
  客户端 IOPS/带宽（per pool）
  OSD 延迟（commit/apply）
  PG 恢复速率
  网络吞吐（集群网络）

常见瓶颈：
  网络（复制流量 2~3 倍于写入）
  小文件随机写（Ceph 弱项）
  journal 磁盘（写路径瓶颈）
```

---

## 九、Ceph vs MinIO vs HDFS vs GlusterFS

| 维度 | Ceph | MinIO | HDFS | GlusterFS |
|------|------|-------|------|-----------|
| 类型 | 统一（对象+块+文件） | 对象 | 文件（大数据） | 文件 |
| 一致性 | 强（CRUSH 副本） | 强 | 强 | 强 |
| 去中心化 | 强（CRUSH） | 中（需控制面） | 弱（NameNode） | 中 |
| 自愈 | 强（自动重建） | 有（纠删码） | 有（副本恢复） | 弱 |
| 性能 | 中（元数据开销） | 高（小规模） | 高吞吐 | 中 |
| 部署复杂度 | 高 | 低 | 中 | 低 |
| 适用 | 私有云存储底座 | 轻量对象存储 | 大数据批处理 | 文件共享 |

**选型关注点**：
- 私有云/统一存储/生产底座 → **Ceph**；
- 轻量对象存储/快速落地 → **MinIO**；
- 大数据计算存储 → **HDFS**；
- 简单文件共享 → **GlusterFS/NFS**。

---

## 十、选型速查

| 需求 | 首选 | 备选 |
|------|------|------|
| 私有云统一存储 | Ceph | — |
| 轻量对象存储 | MinIO | Ceph RGW |
| K8s 持久化存储 | Ceph RBD/CSI | Longhorn |
| OpenStack 存储 | Ceph | — |
| 大数据批处理 | HDFS | CephFS |
| 备份归档 | S3 兼容（MinIO/Ceph） | 云 OSS |

---

## 十一、与其他板块的关系

- 对象存储对比见「[对象存储 MinIO/OSS](./对象存储MinIO-OSS.md)」；
- 大数据存储（HDFS）见「[大数据/04-分布式存储与HDFS](../大数据/04-分布式存储与HDFS.md)」；
- K8s 持久化（CSI）见「[云原生/Kubernetes 核心](../../云原生/Kubernetes核心.md)」；
- 云上存储生态见「[云上数据库与缓存生态](./云上数据库与缓存生态.md)」。

> 一句话：**Ceph = RADOS（去中心化）+ CRUSH（确定性分布/故障域感知）+ 三接口（RGW/RBD/CephFS）+ 自愈（副本重建/Scrub）——生产关键：PG 规划（OSD×100）+ 万兆分离网络 + 副本/EC 策略 + Balancer 均衡 + 故障演练**。