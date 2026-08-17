# K8s 存储深挖（PV / PVC / StorageClass / CSI 驱动）

> K8s 存储 = 「**有状态应用的生命线**」。核心模型：**PersistentVolume（PV，集群存储资源）→ PersistentVolumeClaim（PVC，Pod 声明使用）→ StorageClass（动态供给）→ CSI 驱动（底层存储对接）**。本篇按「解决的问题 → 原理 → 选型关注点」拆解。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| Pod 重启丢数据 | 容器存储是临时的，重启即丢失 |
| 存储供给 | 管理员手动创建 PV 太慢，需要自动按需创建 |
| 多类型存储 | 本地盘/NFS/云盘/SSD/HDD 需要统一管理 |
| 快照与恢复 | 数据备份/恢复需要存储层能力 |
| 跨节点迁移 | Pod 调度到其他节点后存储要能跟随 |

---

## 二、核心原理

### 2.1 存储模型

```
Pod（声明 PVC）→ PVC（声明大小/类型）→ PV（实际存储资源）→ StorageClass（动态供给规则）
  → CSI 驱动（调用底层存储 API）

三种供给模式：
  手动：管理员预创建 PV → PVC 绑定
  动态：PVC 触发 StorageClass → CSI 自动创建 PV（推荐）
  静态预配置：StorageClass 指定已有存储池
```

### 2.2 Access Modes（访问模式）

| 模式 | 说明 | 适用 |
|------|------|------|
| RWO（ReadWriteOnce） | 单节点读写 | 数据库、有状态应用（最常用） |
| ROX（ReadOnlyMany） | 多节点只读 | 静态资源、配置共享 |
| RWX（ReadWriteMany） | 多节点读写 | 共享文件系统（NFS/CephFS） |
| RWOP（ReadWriteOncePod） | 单 Pod 读写 | 严格单 Pod 访问 |

### 2.3 Reclaim Policies（回收策略）

| 策略 | 说明 |
|------|------|
| Retain | PVC 删除后 PV 保留（数据安全） |
| Delete | PVC 删除后自动删除 PV 和底层存储 |
| Recycle（已废弃） | 清空数据后可重用 |

### 2.4 CSI 驱动架构

```
CSI（Container Storage Interface）标准化了 K8s 与存储系统的对接：

  CSI Controller（中心）：处理 Create/Delete/Mount/Attach
  CSI Node（每节点）：处理 Pod 级别的 Mount/Unmount
  存储系统：NFS/云盘/Ceph/本地盘...

常用 CSI 驱动：
  aws-ebs-csi-driver（AWS EBS）
  azure-disk-csi-driver（Azure Disk）
  gcp-pd-csi-driver（GCP PD）
  nfs-subdir-external-provisioner（NFS）
  local-path-provisioner（本地路径）
  ceph-csi（Ceph RBD/CephFS）
```

### 2.5 Volume Types 常用对比

| 类型 | 特点 | 适用 |
|------|------|------|
| emptyDir | Pod 内临时存储 | 缓存/临时数据 |
| hostPath | 宿主机路径 | 节点级数据（慎用） |
| nfs | 网络文件系统 | 共享存储（RWX） |
| awsElasticBlockStore | AWS EBS 块存储 | 云上有状态 |
| persistentVolumeClaim | 声明式存储 | 通用推荐 |
| configMap/secret | 配置挂载 | 配置文件 |

---

## 三、StatefulSet 与存储

```
StatefulSet（有状态应用）= 稳定的网络标识 + 稳定的存储

每个 Pod 有独立的 PVC（按序号命名）：
  web-0 → data-web-0
  web-1 → data-web-1
  ...
Pod 重启/重调度时 PVC 跟随 Pod（存储不丢）
```

**选型关注点**：有状态应用（数据库/MQ/缓存）必须用 StatefulSet + PVC，不能用 Deployment。

---

## 四、生产实践

### 4.1 StorageClass 配置

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iopsPerGB: "50"
reclaimPolicy: Retain
volumeBindingMode: WaitForFirstConsumer  # 延迟绑定（调度后创建）
allowVolumeExpansion: true                # 允许扩容
```

### 4.2 关键实践

| 实践 | 说明 |
|------|------|
| 延迟绑定 | `WaitForFirstConsumer`（避免调度到无可用 zone 的节点） |
| 回收策略 | 生产用 Retain（防误删丢数据） |
| 快照 | VolumeSnapshot 定期备份（数据库必备） |
| 扩容 | `allowVolumeExpansion: true`（在线扩容） |
| 本地存储 | 本地 SSD 用 `hostPath` + nodeAffinity（性能好但不能迁移） |
| 监控 | PV 使用率告警（`kubelet_volume_stats_used_bytes`） |

### 4.3 常见坑

- **PVC Pending**：StorageClass 不存在 / 配额不足 / zone 不匹配 → 检查 `kubectl describe pvc`
- **Pod 挂载失败**：CSI 驱动未安装 / 权限不足 / 节点存储不可用
- **扩容失败**：底层不支持在线扩容 → 需要离线扩容或重建 Pod
- **数据丢失**：回收策略 Delete + PVC 误删 → 生产必须 Retain + 定期快照
- **性能问题**：云盘 IOPS 不足 → 选型时预估 IOPS 需求（gp3/io2）

---

## 五、与其他板块的关系

- Kubernetes 核心见「[Kubernetes 核心](./Kubernetes核心.md)」；
- K8s 网络见「[K8s 网络深挖](./K8s网络深挖.md)」；
- 分布式存储 Ceph 见「[Ceph](../基础知识/中间件/Ceph.md)」；
- 对象存储 MinIO 见「[对象存储 MinIO/OSS](../基础知识/中间件/对象存储MinIO-OSS.md)」；
- 数据库存储见「[PostgreSQL 深度篇](../基础知识/中间件/PostgreSQL深度篇.md)」「[TiDB](../基础知识/中间件/TiDB与NewSQL.md)」。

> 一句话：**K8s 存储 = PV（资源）+ PVC（声明）+ StorageClass（动态供给）+ CSI（对接底层）——生产选 Retain 回收 + WaitForFirstConsumer 绑定 + 快照备份 + 监控使用率**。
