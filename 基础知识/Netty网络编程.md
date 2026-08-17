# Netty 网络编程深入（Reactor / ByteBuf / Pipeline / 内存池 / 生产调优）

> Netty 是 **Java 网络编程的事实标准**：Dubbo/gRPC/Kafka 客户端/RocketMQ/Redis 客户端（Lettuce）底层全部基于 Netty。核心价值：**Reactor 多线程模型 + 零拷贝 + 内存池 + Pipeline 链式处理**，用极少线程处理海量并发连接。本篇按「架构 → 核心组件 → 关键机制 → 生产调优」拆解。

---

## 一、Netty 整体架构

```
                    ┌─────────────────────────────────┐
                    │         Netty 线程模型           │
                    ├─────────────────────────────────┤
                    │  Boss Group（Accept 线程）        │
                    │    └─ 接受新连接 → 注册到 Worker  │
                    │                                  │
                    │  Worker Group（IO 线程）          │
                    │    └─ 读写数据 → Pipeline 处理    │
                    └─────────────────────────────────┘

应用层：  Bootstrap / ServerBootstrap（启动引导）
通道层：  Channel（连接抽象）+ ChannelPipeline（处理链）
缓冲层：  ByteBuf（零拷贝缓冲区）
协议层：  编解码器（Codec）
```

### 1.1 Reactor 模型

| 模型 | 说明 | Netty 实现 |
|------|------|-----------|
| 单 Reactor 单线程 | 一个线程处理所有 IO | 不推荐（阻塞） |
| **单 Reactor 多线程** | Reactor 线程处理 IO，业务交给线程池 | WorkerGroup |
| **主从 Reactor 多线程** | Boss 处理 Accept，Worker 处理 IO | BossGroup + WorkerGroup |
| Proactor | 异步 IO（AIO） | Linux 下不支持，Netty 未采用 |

**Netty 默认是主从 Reactor 多线程模型**：BossGroup（默认1线程）处理 Accept，WorkerGroup（默认 CPU核数×2 线程）处理 IO 读写。

### 1.2 启动流程

```java
// 服务端启动
ServerBootstrap b = new ServerBootstrap();
b.group(bossGroup, workerGroup)
 .channel(NioServerSocketChannel.class)  // NIO 实现
 .childHandler(new ChannelInitializer<SocketChannel>() {
     @Override
     protected void initChannel(SocketChannel ch) {
         ch.pipeline()
           .addLast(new IdleStateHandler(60, 30, 0))  // 心跳检测
           .addLast(new LengthFieldBasedFrameDecoder(1024, 0, 4))  // 粘包拆包
           .addLast(new ProtobufDecoder(msg))
           .addLast(new BusinessHandler());  // 业务逻辑
     }
 })
 .option(ChannelOption.SO_BACKLOG, 128)
 .childOption(ChannelOption.SO_KEEPALIVE, true);
```

---

## 二、核心组件

### 2.1 Channel（通道）

```
Channel = 网络连接的抽象（Socket 的封装）

核心操作：
  bind()     — 绑定端口
  connect()  — 连接远端
  read()     — 注册读事件
  write()    — 写数据
  flush()    — 刷新写缓冲
  close()    — 关闭连接

常用实现：
  NioServerSocketChannel  — 服务端 NIO
  NioSocketChannel       — 客户端 NIO
  EpollServerSocketChannel — Linux epoll（性能更好）
```

### 2.2 ByteBuf（零拷贝缓冲区）

```
ByteBuf vs Java NIO ByteBuffer：

| 维度 | ByteBuf | ByteBuffer |
|------|---------|-----------|
| 读写指针 | 双指针（readerIndex/writerIndex） | 单指针（flip 切换） |
| 扩容 | 自动扩容 | 固定大小 |
| 零拷贝 | slice/composite/wrap | 无 |
| 内存池 | 支持（PooledByteBufAllocator） | 无 |
| 引用计数 | 支持（ReferenceCounted） | 无 |

内存分配：
  堆内（Heap）：分配 JVM 堆内存，GC 管理，简单但多一次拷贝
  堆外（Direct）：分配 OS 内存，零拷贝，但需要手动释放
  池化（Pooled）：复用内存块，减少 GC 压力（默认）
```

### 2.3 Pipeline 与 ChannelHandler

```
Pipeline = 双向链表，每个节点是一个 ChannelHandler

入站（Inbound）处理链：
  数据读取 → 解码 → 业务逻辑 → 响应

出站（Outbound）处理链：
  业务逻辑 → 编码 → 数据写入

Handler 类型：
  ChannelInboundHandler   — 处理入站事件（读数据/连接建立）
  ChannelOutboundHandler  — 处理出站事件（写数据/连接）
  ChannelDuplexHandler    — 同时处理入站和出站
```

### 2.4 EventLoop（事件循环）

```
EventLoop = 单线程事件循环（一个线程处理一组 Channel 的所有 IO）

一个 Worker EventLoop 绑定多个 Channel：
  EventLoop 线程 → 轮询注册在其上的 Channel 的 IO 事件
  → 一个 Channel 的所有事件都在同一个线程中处理（无需加锁）

任务调度：
  eventLoop.schedule(task, delay, TimeUnit)  — 延迟任务
  eventLoop.execute(task)                     — 立即执行
```

---

## 三、关键机制

### 3.1 粘包与拆包

| 原因 | 说明 |
|------|------|
| TCP 粘包 | 发送方多次 write 合并为一次发送（Nagle 算法） |
| TCP 拆包 | 发送数据大于 MSS 时拆分 |
| 缓冲区 | 应用层多次写入缓冲区，一次读出 |

**解决方案（解码器）**：

| 解码器 | 原理 |
|--------|------|
| FixedLengthFrameDecoder | 固定长度 |
| LineBasedFrameDecoder | 换行分隔 |
| LengthFieldBasedFrameDecoder | 长度字段（最常用） |
| DelimiterBasedFrameDecoder | 自定义分隔符 |
| ProtobufDecoder | Protobuf 协议（自带长度） |

### 3.2 零拷贝

```
Netty 零拷贝的三种实现：

1. compositeByteBuf：合并多个 ByteBuf（逻辑合并，不拷贝数据）
2. slice：ByteBuf 切片（共享底层内存）
3. FileRegion + transferTo：文件传输（绕过用户态，直接 DMA 拷贝）

传统文件传输（4次拷贝）：
  磁盘 → 内核缓冲区 → 用户缓冲区 → Socket 缓冲区 → 网卡
  
Netty FileRegion（3次拷贝）：
  磁盘 → 内核缓冲区 → Socket 缓冲区 → 网卡（绕过用户态）
```

### 3.3 内存池（PooledByteBufAllocator）

```
Netty 内存池 = Arena + Chunk + Page + Subpage

Arena（区）：每个线程一个本地 Arena（减少锁竞争）
  → 线程先从本地 Arena 分配，本地不够从全局 Arena 偷取

Chunk（块）：一大块连续内存（如 16MB）
  → 按 Page 切分（默认 8KB/页）
  → 小对象按 Subpage 切分（如 8B/16B/32B...）

分配策略：
  小对象（< 页大小）：从 Subpage 分配（精确匹配，减少碎片）
  大对象（≥ 页大小）：从 Page 分配（按需分配）
  超大对象（> 16MB）：直接分配堆外内存（不池化）

效果：减少 90%+ 的内存分配与 GC 压力
```

### 3.4 心跳与空闲检测

```
IdleStateHandler（空闲检测）：
  readerIdleTime：读空闲超时（服务端检测客户端是否存活）
  writerIdleTime：写空闲超时（客户端检测服务端是否存活）
  allIdleTime：读写都空闲

实现：
  定时检测 Channel 是否有读/写事件
  → 超时触发 IdleStateEvent
  → 自定义 Handler 处理（如发心跳/断开连接）

典型配置：
  IdleStateHandler(60, 30, 0)  — 60s 读空闲发心跳，30s 写空闲发心跳
```

---

## 四、编解码器

### 4.1 常用编解码器

| 编解码器 | 协议 | 适用 |
|----------|------|------|
| StringDecoder/StringEncoder | 字符串 | 简单文本 |
| ProtobufDecoder/Encoder | Protobuf | 高性能二进制（Dubbo/gRPC） |
| MarshallingDecoder/Encoder | JBoss Marshalling | Java 序列化（兼容性好） |
| HttpRequestDecoder/Encoder | HTTP | Web 服务 |
| LengthFieldBasedFrameDecoder | 自定义 | 通用私有协议 |

### 4.2 自定义协议设计

```java
// 典型私有协议结构
+--------+--------+---------+--------+----------+
| 魔数    | 版本   | 序列化  | 消息类型 | 数据长度  |
| 4 bytes | 1 byte | 1 byte  | 1 byte  | 4 bytes  |
+--------+--------+---------+--------+----------+
| 数据体                                                    |
+----------------------------------------------------------+

解码器实现：
  1. 读魔数校验
  2. 读版本号
  3. 读序列化方式
  4. 读消息类型
  5. 读数据长度
  6. 按长度读数据体
  7. 反序列化为 Java 对象
```

---

## 五、生产调优

### 5.1 线程模型调优

| 参数 | 建议 |
|------|------|
| BossGroup 线程数 | 1（Accept 事件不多） |
| WorkerGroup 线程数 | CPU 核数 × 2（IO 密集） |
| 业务线程池 | 独立线程池（避免阻塞 Worker） |

### 5.2 ChannelOption 调优

| 参数 | 说明 | 建议 |
|------|------|------|
| SO_BACKLOG | Accept 队列大小 | 128~1024 |
| SO_KEEPALIVE | TCP 心跳 | true |
| SO_REUSEADDR | 地址复用 | true |
| TCP_NODELAY | 禁用 Nagle | true（低延迟场景） |
| SO_SNDBUF / SO_RCVBUF | 发送/接收缓冲区 | 按业务调整（默认 128KB） |
| WRITE_BUFFER_WATER_MARK | 写缓冲水位 | 高低水位控制背压 |

### 5.3 内存调优

| 参数 | 说明 |
|------|------|
| -Dio.netty.allocator.numDirectArenas | 直接内存 Arena 数 |
| -Dio.netty.allocator.pageSize | 页大小（默认 8192） |
| -Dio.netty.allocator.maxOrder | 最大阶（默认 11，即 2^11 × 8KB = 16MB chunk） |
| -Dio.netty.leakDetection.level | 内存泄漏检测（SIMPLE/ADVANCED/DISABLED） |

### 5.4 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 内存泄漏 | ByteBuf 未 release | 开启 leakDetection + try-finally 释放 |
| 连接数暴增 | 未设置读空闲检测 | IdleStateHandler + 超时断开 |
| 写缓冲堆积 | 下游消费慢 | 设置 WRITE_BUFFER_WATER_MARK 背压 |
| GC 停顿 | 大量小对象分配 | 用 PooledByteBufAllocator（默认） |
| 线程饿死 | 业务逻辑阻塞 Worker | 业务逻辑提交到独立线程池 |

---

## 六、Netty 在中间件中的应用

| 中间件 | Netty 用途 |
|--------|-----------|
| Dubbo | RPC 通信层（NettyClient/NettyServer） |
| gRPC-Java | HTTP/2 传输层 |
| RocketMQ | Broker/Producer/Consumer 通信 |
| Kafka | 新版客户端（Netty 替代 Java NIO） |
| Elasticsearch | Transport 通信 |
| Redis（Lettuce） | Redis 客户端 |
| ZooKeeper | NIO→Netty（3.5+） |
| Sentinel | 数据传输 |

---

## 七、与其他板块的关系

- 网络基础见「[网络](../基础知识/网络.md)」；
- Reactor 模式见「[并发编程](../基础知识/并发编程.md)」；
- Dubbo RPC 见「[Dubbo](./中间件/ApacheDubboRPC框架.md)」；
- gRPC 见「[gRPC](./中间件/gRPC.md)」；
- Kafka 源码见「[源码系列/Kafka 源码](../源码系列/Kafka源码.md)」；
- 零拷贝见「[操作系统](../基础知识/操作系统.md)」。

> 一句话：**Netty = 主从 Reactor + ByteBuf（零拷贝+内存池）+ Pipeline（链式处理）+ EventLoop（单线程无锁）——生产调优核心：业务线程池隔离 + IdleStateHandler 心跳 + PooledByteBufAllocator + leakDetection**。
