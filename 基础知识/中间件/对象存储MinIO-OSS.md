# 对象存储（MinIO / 云 OSS）

> 头像、商品图、合同 PDF、音视频——这些「文件」不适合放 MySQL（慢、占连接），也不适合放本地磁盘（难扩展、难高可用）。本文讲清 **对象存储是什么、S3 协议、MinIO 怎么用**，以及和云厂商 OSS 的选型。
> 开源参考：[minio/minio](https://github.com/minio/minio)（Go，AGPLv3，高性能 S3 兼容对象存储）。**诚实提示：MinIO 官方仓库已声明「不再维护（NO LONGER MAINTAINED）」，转向商业版 AIStor；社区版仍以源码形式分发。生产选型需知悉此风险，下文给出替代方案。**

---

## 一、什么是对象存储

对象存储（Object Storage）以 **「对象 = 数据 + 元数据 + 唯一 Key」** 方式存文件，通过 HTTP API 访问，无限水平扩展，适合非结构化数据（图片 / 视频 / 文档 / 备份）。

```mermaid
flowchart LR
    A[应用] -->|PUT/GET/DELETE| S[对象存储]
    subgraph S
        B[Bucket 存储桶]
        B --> O1[object: avatar/1.png]
        B --> O2[object: doc/contract.pdf]
        B --> O3[object: video/intro.mp4]
    end
```

对比：

| 存储类型 | 适合 | 例子 |
|----------|------|------|
| 块存储 | 操作系统盘、数据库卷 | 云硬盘 EBS |
| 文件存储 | 共享目录、NAS | NFS |
| **对象存储** | 图片 / 视频 / 文档 / 备份 | **S3 / MinIO / OSS** |

---

## 二、S3 协议：事实标准

AWS S3 的 API 已成对象存储**事实标准**。只要兼容 S3，就能用同一套 SDK / 工具（`aws-cli`、`s3cmd`、`mc`）操作任意实现。

核心概念：

- **Bucket（桶）**：顶层命名空间，全局唯一。
- **Object（对象）**：`bucket/key`，key 即路径（如 `avatar/1.png`）。
- **Region（区域）**：数据物理位置。
- **ACL / Policy**：访问控制。
- **Multipart Upload**：大文件分片上传。

---

## 三、MinIO 详解

### 3.1 定位与特点

- 高性能、**S3 兼容**的对象存储，Go 编写。
- 部署灵活：裸机 `go install`、Docker、Kubernetes（Operator / Helm）。
- 内置 Web 控制台（MinIO Console）、`mc` 客户端。
- 适合 AI / 分析 / 大规模数据管道。

### 3.2 部署（Docker 一行起）

```bash
docker run -d -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio server /data --console-address ":9001"
```

- `9000`：S3 API 端口；`9001`：Console 端口。
- 默认凭据 `minioadmin`（生产务必改）。

### 3.3 客户端操作（mc）

```bash
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/avatars          # 建桶
mc cp ./1.png local/avatars/1.png
mc ls local/avatars
```

### 3.4 Java SDK（兼容 S3）

```java
S3Client s3 = S3Client.builder()
    .endpointOverride(URI.create("http://localhost:9000"))
    .credentialsProvider(StaticCredentialsProvider.create(
        AwsBasicCredentials.create("minioadmin", "minioadmin")))
    .region(Region.US_EAST_1)
    .build();
s3.putObject(PutObjectRequest.builder().bucket("avatars").key("1.png").build(),
             RequestBody.fromFile(Paths.get("1.png")));
```

### 3.5 生产要点

- **分布式模式（Erasure Code）**：多节点部署，数据分片 + 校验，容忍多盘 / 节点故障。
- **高可用**：MinIO 本身无单点，靠多节点 + 负载均衡（前面挂 Nginx / SLB）。
- **生命周期**：配置过期删除 / 转冷存储，控成本。
- **安全**：桶策略最小权限；HTTPS；服务端加密（SSE）。

> ⚠️ **维护风险提示**：MinIO 官方仓库已声明停止维护、转向 AIStor 商业发行版，社区版仅源码分发。新项目若需长期支持，建议评估替代（见下文）。

### 3.6 替代 / 同类方案

| 方案 | 说明 |
|------|------|
| **云厂商 OSS**（阿里 OSS / 腾讯 COS / AWS S3 / 华为 OBS） | 全托管、SLA 高、免运维，按量付费，**生产首选** |
| **Ceph RGW** | 自建统一存储（块/文件/对象），重但能力强 |
| **SeaweedFS** | 轻量、高性能、易部署的自建对象存储 |
| **Garage** | Rust 写的轻量 S3 兼容分布式存储 |
| **JuiceFS** | 文件系统语义对象存储（底层用 S3） |

---

## 四、MinIO 自建 vs 云 OSS 选型

| 维度 | MinIO 自建 | 云 OSS（阿里/腾讯/AWS） |
|------|-----------|--------------------------|
| 运维成本 | 高（自己管集群/监控/扩容） | 低（全托管） |
| 可用性 SLA | 自己保障 | 99.9%+ 官方保障 |
| 成本模型 | 硬件 + 人力 | 按量付费（存储 + 流量） |
| 合规 / 数据不出境 | ✅ 数据完全自持 | 需确认区域 |
| 扩展性 | 手动扩容 | 近乎无限 |
| 适用 | 私有云 / 数据敏感 / 内网 | 公网业务 / 快速上线 |

**结论**：公网业务、要省心 → 直接上云 OSS；内网 / 数据不出境 / 成本敏感且有运维能力 → MinIO 或同类自建。无论哪种，**都走 S3 协议**，未来迁移成本低。

---

## 五、常见坑

1. **直接把文件存 MySQL / 本地磁盘**：大文件拖慢 DB、本地盘难扩展 → 用对象存储 + DB 只存 URL。
2. **URL 直接暴露**：公开读风险 → 用**预签名 URL（Presigned URL）**临时授权下载 / 上传。
3. **大文件不分片**：超过限制上传失败 → 用 Multipart Upload。
4. **桶公开写**：被恶意刷文件 → 桶策略最小权限 + 服务端校验文件类型。
5. **没做 CDN**：对象存储公网带宽贵且慢 → 前面挂 CDN 加速静态资源。
6. **忽略维护风险**：MinIO 已停维护，新项目评估替代或商业支持。

---

## 六、面试高频速查

- **对象存储 vs 文件存储？** 对象存储 HTTP API + 扁平 Key + 无限扩展，适合非结构化；文件存储是目录树，适合共享文件系统。
- **S3 协议为什么重要？** 事实标准，兼容即可用同一套 SDK 操作任意实现，迁移成本低。
- **MinIO 是什么？** Go 写的 S3 兼容高性能对象存储，可自建；但官方已停止维护，需评估替代。
- **大文件怎么传？** Multipart 分片上传。
- **怎么安全分享文件？** 预签名 URL（限时授权）。
- **自建 vs 云 OSS？** 公网业务用云 OSS 省心；私有 / 敏感数据自建 MinIO 类。

---

## 七、与其他板块的关系

- 和「**基础知识/ES 体系**」：对象存储存原文件，ES 存元数据做检索。
- 和「**架构/企业架构**」：对象存储是「数据中台」非结构化数据底座之一。
- 和「**基础知识/API 网关**」：文件上传常经网关，注意大文件超时 / 限流。
