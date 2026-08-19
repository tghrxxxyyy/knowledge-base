# 分布式 ID 生成器深入（Leaf 源码 / 时钟回拨方案 / UUID v7 / 花名册 / 双 Buffer）

> 分布式 ID 生成是**分布式系统的地基**。本篇深入拆解：Leaf-snowflake 源码、时钟回拨防护、UUID v7 实践、花名册（机器 ID 动态分配）、双 Buffer 预取。

---

## 一、要解决的问题

| 痛点 | 说明 |
|------|------|
| 全局唯一 | 多实例/多库并发生成 ID 不能重复（合并分表关键） |
| 性能 | 订单/日志高频场景需要 10 万+/s 生成能力 |
| 趋势递增 | 数据库索引友好（B+Tree 顺序写） |
| 可解析 | ID 能反解出生成时间/机器（排查/路由） |
| 可排序 | 时间有序便于按时间维度分页/分区 |

> 核心认知：**分布式 ID = 唯一（全局）+ 有序（趋势）+ 高性能（本地生成）+ 可解析**——本地生成是性能关键。

---

## 二、雪花算法与变体

### 2.1 标准雪花

```
 63位 long：0 | 41位时间戳(ms) | 10位机器ID | 12位序列号
               ↑               ↑           ↑
          自定义纪元起毫秒    数据中心5位+机器5位   同一毫秒内自增(4096个/ms)

每秒理论 409.6 万 ID；时钟回拨是最大风险
```

### 2.2 Leaf-snowflake 源码分析

```
源码路径：
  leaf-server/src/main/java/com/meituan/leaf/snowflake/SnowflakeIDGenImpl.java

核心流程：
  1. 启动时从 ZK 获取 workerId（机器 ID）
  2. 检查时钟回拨（最大容忍 5ms）
  3. 生成 ID：时间戳 | 机器ID | 序列号

关键源码：
  public long getId() {
      // 时钟回拨检查
      long currentMs = System.currentTimeMillis();
      if (currentMs < lastMs) {
          long offset = lastMs - currentMs;
          if (offset <= 5) {
              // 回拨 < 5ms，自旋等待
              while (currentMs < lastMs) {
                  currentMs = System.currentTimeMillis();
              }
          } else {
              // 回拨 > 5ms，降级到 DB 取号
              return dbWorker.get剑法();
          }
      }
      
      // 序列号处理
      if (currentMs == lastMs) {
          // 同一毫秒内，序列号递增
          sequence = (sequence + 1) & 0xFFF;  // 12位，4096
          if (sequence == 0) {
              // 序列号溢出，等待下一毫秒
              currentMs = waitNextMs(lastMs);
          }
      } else {
          // 新毫秒，序列号重置
          sequence = 0;
      }
      
      lastMs = currentMs;
      return ((currentMs - EPOCH) << 22) | (workerId << 12) | sequence;
  }
```

### 2.3 Leaf-segment 源码分析

```
源码路径：
  leaf-server/src/main/java/com/meituan/leaf/segment/SegmentIDGenImpl.java

核心流程：
  1. 启动时从 DB 加载一段号段到内存
  2. 发号时从内存分配
  3. 用到一定比例（如 80%）时异步加载下一段号段（双 Buffer）

关键数据结构：
  class Segment {
      long max;       // 当前号段上限
      long value;     // 当前分配值
      long nextMax;   // 下一段号段上限
  }

双 Buffer 机制：
  Segment A 用到 80% → 异步加载 Segment B
  Segment A 用完 → 切换到 Segment B → 异步加载 Segment C
  好处：避免号段用完时的 DB 读取延迟
```

---

## 三、机器 ID 分配（花名册）

### 3.1 方案对比

| 方案 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| 配置文件 | 写死 workerId | 简单 | 扩容需手动改 |
| ZK 分配 | 启动时 ZK 创建临时节点 | 动态 | 依赖 ZK |
| DB 分配 | 表中分配 workerId | 简单 | 性能低 |
| 云端元数据 | 云厂商 API 获取 | 可靠 | 依赖云 API |
| Redis INCR | Redis 自增 | 简单 | 依赖 Redis |

### 3.2 花名册（推荐）

```
原理：
  维护一个"花名册"（如 ZK 节点 /etcd/leaf/workers）
  服务启动时：
    1. 查看花名册中已占用的 workerId
    2. 选择最小的未占用 workerId
    3. 注册到花名册（临时节点）
  服务下线：
    临时节点自动删除，workerId 回收

优势：
  - workerId 自动分配，无需配置
  - 扩容自动分配，无需重启
  - 机器下线后 workerId 自动回收
```

---

## 四、UUID v7

### 4.1 与 v4 对比

| 维度 | UUID v4 | UUID v7 |
|------|---------|---------|
| 生成方式 | 随机 122 位 | 时间戳 48 位 + 随机 74 位 |
| 有序性 | 无序 | 有序（时间前缀） |
| 索引碎片 | 严重 | 无 |
| 可排序 | 不可 | 可（时间排序） |
| 推荐 | 不推荐 | **推荐替代 v4** |

### 4.2 格式

```
v7 格式：时间戳(48位) + 版本(4位) + 变体(2位) + 随机(62位)

示例：
  01890a5d-e49c-7d8e-9b2a-1f3c5e7d9a4b
  ^^^^^^^^^^^^^^
  时间戳(毫秒)

Go 实现：
  import "github.com/google/uuid"
  id, err := uuid.NewRandom()  // UUID v4
  // 或使用 v7 库
```

### 4.3 适用场景

| 场景 | 推荐 |
|------|------|
| 客户端生成（无中心依赖） | UUID v7 |
| 数据库主键（有序） | 雪花 或 UUID v7 |
| 对外 API（需可读） | UUID v7 |
| 分布式消息 ID | 雪花 |

---

## 五、选型速查

| 场景 | 首选 | 备选 |
|------|------|------|
| 订单/消息主键 | 雪花 | 号段 |
| 严格递增流水号 | 号段（Leaf-segment） | Redis INCR |
| 客户端生成/无顺序 | UUID v7 | UUID v4 |
| 日志 ID | 雪花（时间解析） | UUID |
| 短 ID/邀请码 | Redis INCR + 混淆 | 号段 + 进制转换 |
| 低频全局唯一 | ZK/etcd 原子 | DB 自增 |

---

## 六、生产实践

### 6.1 关键实践

| 实践 | 说明 |
|------|------|
| 机器 ID | 花名册动态分配，禁止硬编码 |
| 时钟回拨 | 回拨 <5ms 等追平；>5ms 熔断降级（DB 取号） |
| 纪元 | 自定义纪元（不要从 1970 开始，延长可用年限） |
| 序列溢出 | 同一毫秒序列满 → 自旋等待下一毫秒 |
| 异常兜底 | 生成失败降级到号段/UUID（保证可用性） |
| 前端精度 | 64 位 ID 传前端 JS 丢精度 → 转字符串 |

### 6.2 常见坑

| 问题 | 原因 | 解决 |
|------|------|------|
| 机器 ID 冲突 | 多环境/多机房共用 ID | 花名册 + 位段隔离 |
| 时钟回拨未处理 | NTP 校正导致 ID 回退 | Leaf 熔断 + DB 降级 |
| 分表路由不均 | 雪花 ID 按时间位路由 | 用 hash 路由 |
| 前端精度丢失 | JS Number.MAX_SAFE_INTEGER | 转字符串 |

---

## 七、与其他板块的关系

- 分库分表见「[分库分表 ShardingSphere](../基础知识/中间件/分库分表ShardingSphere.md)」；
- Redis INCR 见「[Redis 深度篇](../基础知识/中间件/Redis深度篇.md)」；
- 花名册见「[ZooKeeper](../基础知识/中间件/ZooKeeper.md)」「[etcd](../基础知识/中间件/etcd.md)」；
- 消息 ID 见「[Kafka](../基础知识/中间件/Kafka.md)」「[RocketMQ](../基础知识/中间件/RocketMQ.md)」。

> 一句话：**分布式 ID = 唯一 + 趋势有序 + 本地生成高性能——选型先看「顺序要求（趋势有序→雪花，严格递增→号段）」，再防「雪花三大坑（机器位冲突/时钟回拨/前端精度）」，最后配「降级方案（DB 号段/UUID 兜底）」**。
