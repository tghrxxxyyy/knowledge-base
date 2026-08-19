# K8s 存储深挖（CSI 开发 / StorageClass 调优 / 动态供给 / 快照恢复 / 迁移路径）

> K8s 存储 = 「**有状态应用的生命线**」。本篇深入拆解：CSI 驱动开发、StorageClass 调优参数、动态供给流程、VolumeSnapshot 恢复、存储迁移路径。

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

## 二、存储模型

### 2.1 核心流程

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
| RWO（ReadWriteOnce） | 单节点读写 | 数据库、有状态应用 |
| ROX（ReadOnlyMany） | 多节点只读 | 静态资源、配置共享 |
| RWX（ReadWriteMany） | 多节点读写 | 共享文件系统（NFS/CephFS） |
| RWOP（ReadWriteOncePod） | 单 Pod 读写 | 严格单 Pod 访问 |

### 2.3 Reclaim Policies（回收策略）

| 策略 | 说明 |
|------|------|
| Retain | PVC 删除后 PV 保留（数据安全） |
| Delete | PVC 删除后自动删除 PV 和底层存储 |
| Recycle（已废弃） | 清空数据后可重用 |

---

## 三、CSI 驱动开发

### 3.1 CSI 架构

```
CSI（Container Storage Interface）标准化了 K8s 与存储系统的对接：

  CSI Controller（中心）：处理 Create/Delete/Mount/Attach
  CSI Node（每节点）：处理 Pod 级别的 Mount/Unmount
  存储系统：NFS/云盘/Ceph/本地盘...

gRPC 接口：
  Identity Service：身份信息（GetPluginInfo/GetCapabilities）
  Controller Service：控制操作（CreateVolume/DeleteVolume/ControllerPublishVolume）
  Node Service：节点操作（NodeStageVolume/NodePublishVolume/NodeUnpublishVolume）
```

### 3.2 开发流程

```
1. 实现 gRPC 接口
   - Identity Service：返回驱动信息
   - Controller Service：实现 CreateVolume/DeleteVolume
   - Node Service：实现 NodeStageVolume/NodePublishVolume

2. 编写部署 YAML
   - CSI Driver（Deployment/StatefulSet）
   - CSIDriver（K8s 资源对象）
   - StorageClass（配置）

3. 测试
   - 创建 PVC
   - 创建 Pod 使用 PVC
   - 验证数据持久化
```

### 3.3 部署示例

```yaml
# CSIDriver
apiVersion: storage.k8s.io/v1
kind: CSIDriver
metadata:
  name: my-csi-driver
spec:
  attachRequired: false  # 无需 Attach（如 NFS）
  podInfoOnMount: true   # 挂载时传递 Pod 信息

# StorageClass
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: my-storage-class
provisioner: my-csi-driver
parameters:
  type: ssd
  sizeGiB: "100"
reclaimPolicy: Retain
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
```

---

## 四、StorageClass 调优参数

### 4.1 云盘参数（AWS EBS）

| 参数 | 说明 | 建议 |
|------|------|------|
| type | 卷类型 | gp3（通用）/io2（高 IOPS） |
| iopsPerGB | 每 GB IOPS | 50（gp3）/100（io2） |
| throughput | 吞吐量 MB/s | 125（gp3）/250（io2） |
| encrypted | 加密 | true |
| fsType | 文件系统 | ext4（通用）/xfs（大数据） |

### 4.2 本地存储参数

```yaml
# 本地路径 provisioner
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: local-path
provisioner: rancher.io/local-path
parameters:
  path: /mnt/disks  # 本地路径
reclaimPolicy: Retain
volumeBindingMode: WaitForFirstConsumer
```

---

## 五、VolumeSnapshot（快照恢复）

### 5.1 快照创建

```yaml
# VolumeSnapshotClass
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshotClass
metadata:
  name: my-snapshot-class
driver: ebs.csi.aws.com
deletionPolicy: Retain

# VolumeSnapshot
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: my-snapshot
spec:
  volumeSnapshotClassName: my-snapshot-class
  source:
    persistentVolumeClaimName: my-pvc
```

### 5.2 从快照恢复

```yaml
# 新 PVC 从快照创建
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-pvc-restored
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 100Gi
  dataSource:
    name: my-snapshot
    kind: VolumeSnapshot
    apiGroup: snapshot.storage.k8s.io
```

### 5.3 快照最佳实践

| 实践 | 说明 |
|------|------|
| 定期快照 | CronJob 每小时/每天自动创建 |
| 保留策略 | Retain（数据安全）/Delete（释放空间） |
| 跨地域复制 | 快照跨地域复制（灾难恢复） |
| 验证恢复 | 定期测试从快照恢复（验证完整性） |

---

## 六、存储迁移路径

### 6.1 评估阶段

```
1. 梳理现有存储（PV/PVC 清单）
2. 评估各存储的迁移复杂度
3. 确定迁移优先级（低风险→高风险）
```

### 6.2 迁移方案

| 方案 | 适用 | 步骤 |
|------|------|------|
| Velero | 跨集群迁移 | 备份旧集群→恢复到新集群 |
| CSI 迁移 | 云盘类型切换 | 确保 CSI 支持→更新 StorageClass |
| 手动迁移 | 复杂场景 | 读数据→创建新 PVC→写数据→切换 |

### 6.3 迁移注意事项

```
备份：迁移前必须备份数据
双跑：新旧存储并行运行一段时间
验证：迁移后验证数据完整性
切换：灰度切换流量，逐步切换
清理：旧存储数据保留 N 天后清理
```

---

## 七、常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| PVC Pending | StorageClass 不存在/配额不足/zone 不匹配 | 检查 `kubectl describe pvc` |
| Pod 挂载失败 | CSI 驱动未安装/权限不足/节点存储不可用 | 检查 CSI Pod 状态 |
| 扩容失败 | 底层不支持在线扩容 | 离线扩容或重建 Pod |
| 数据丢失 | 回收策略 Delete + PVC 误删 | 生产必须 Retain + 快照备份 |
| 性能问题 | 云盘 IOPS 不足 | 选型时预估 IOPS 需求 |

---

## 八、与其他板块的关系

- Kubernetes 核心见「[Kubernetes 核心](./Kubernetes核心.md)」；
- K8s 网络见「[K8s 网络深挖](./K8s网络深挖.md)」；
- 分布式存储见「[Ceph](../基础知识/中间件/Ceph.md)」；
- 对象存储见「[MinIO/OSS](../基础知识/中间件/对象存储MinIO-OSS.md)」；
- 数据库存储见「[PostgreSQL](../基础知识/中间件/PostgreSQL深度篇.md)」「[TiDB](../基础知识/中间件/TiDB与NewSQL.md)」。

> 一句话：**K8s 存储 = PV（资源）+ PVC（声明）+ StorageClass（动态供给）+ CSI（对接底层）——生产选 Retain 回收 + WaitForFirstConsumer 绑定 + 快照备份 + 监控使用率**。
