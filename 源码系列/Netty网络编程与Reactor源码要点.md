# Netty 网络编程与 Reactor 源码要点

> 本文从源码与工程视角讲清 Netty 的高性能网络编程模型：BIO/NIO/AIO 演进、Reactor 线程模型、核心组件（Channel/EventLoop/ByteBuf/Pipeline）、粘包拆包、编解码、零拷贝与内存管理。内容基于公开实现原理，具体 API 以版本为准。

## 1. 为什么需要 Netty

- 原生 Java NIO 编程复杂：Selector、Channel、Buffer 样板代码多。
- 易踩坑：空轮询 bug、半包读写、线程模型混乱。
- Netty 封装 NIO，提供优雅的 Channel/Pipeline/Handler 抽象。
- 性能高：Reactor 多路复用、零拷贝、池化内存。

## 2. BIO / NIO / AIO 演进

- BIO：每连接一线程，阻塞读写，连接多则线程爆炸。
- NIO：单线程管多连接，Selector 多路复用，非阻塞。
- AIO：异步回调（Linux 上底层仍是 epoll 模拟，Netty 不用 AIO）。
- Netty 基于 NIO（多路复用），而非 AIO。

## 3. Reactor 模型

- 单 Reactor 单线程：所有事件一个线程处理（如 Redis 单线程思路）。
- 单 Reactor 多线程：Acceptor 接连接，Worker 线程池处理业务。
- 主从 Reactor 多进程/线程：MainReactor 管连接，SubReactor 管 IO。
- Netty 用主从 Reactor：BossGroup 接连接，WorkerGroup 管读写。

## 4. 核心组件：EventLoop

- EventLoop 绑定一个线程，循环处理注册其上的 Channel 事件。
- 一个 EventLoop 可管多个 Channel（多路复用）。
- 任务队列：普通任务、定时任务、尾部队列。
- 线程序化：同一 Channel 的事件始终同一线程，避免并发。

## 5. 核心组件：Channel

- 代表一个网络连接（或本地通道）。
- 提供读写、连接、绑定等异步操作（返回 ChannelFuture）。
- 不同传输有不同实现（NioSocketChannel 等）。

## 6. 核心组件：ChannelPipeline

- 一条 Pipeline 串起多个 ChannelHandler。
- 入站（Inbound）：连接、读、异常，从头到尾。
- 出站（Outbound）：写、刷新、关闭，从尾到头。
- 双向链表结构，可动态增删 Handler。

## 7. 核心组件：ChannelHandler

- 业务逻辑的落点：编码、解码、鉴权、业务处理。
- ChannelInboundHandler：处理入站事件。
- ChannelOutboundHandler：处理出站事件。
- SimpleChannelInboundHandler：自动释放消息引用。

## 8. 核心组件：ByteBuf

- 相比 NIO ByteBuffer：读写双指针，无需 flip。
- 支持池化（PooledByteBuf）降低 GC 压力。
- 支持堆内/堆外（Direct）内存。
- 引用计数管理，需释放避免泄漏（tail handler 自动）。

## 9. 粘包与拆包

- TCP 是字节流，无消息边界，可能粘包/半包。
- 解决：定长、分隔符、长度字段（LengthFieldBasedFrameDecoder 最常用）。
- 例：头部 4 字节表示 body 长度，解码器按长度切分。

```java
pipeline.addLast(new LengthFieldBasedFrameDecoder(1024, 0, 4, 0, 4));
pipeline.addLast(new LengthFieldPrepender(4));
pipeline.addLast(new StringDecoder(), new StringEncoder());
```

## 10. 编解码（Codec）

- 编码器：Java 对象 → 字节（Encoder）。
- 解码器：字节 → 对象（Decoder）。
- 常用：Protobuf、JSON、自定义二进制协议。
- 注意：解码要考虑半包（不能一次读全就缓存）。

## 11. 零拷贝（Zero-Copy）

- Netty 零拷贝指减少用户态/内核态拷贝与不必要的复制。
- 手段：DirectBuffer、CompositeByteBuf（逻辑合并不复制）、FileRegion（sendfile 思路）。
- 不是 OS 零拷贝全部，而是应用层减少多余 copy。

## 12. 内存管理

- PooledByteBufAllocator：类似 jemalloc 的池，减少分配开销。
- 小块/大块分级（Tiny/Small/Normal/Huge）。
- 池化降低 GC，但需正确释放（否则泄漏）。
- 高并发下池化收益明显。

## 13. 写与刷新的区别

- write：写入缓冲区，不立即发。
- flush：真正写出到 Channel。
- writeAndFlush：两者合并，但高频调用有开销，可批量。

## 14. 异步与 Future

- 所有 IO 操作异步，返回 ChannelFuture。
- 通过 addListener 回调，而非阻塞等待。
- 阻塞获取（sync）仅在启动等必要处。

## 15. 心跳与空闲检测

- IdleStateHandler：读/写空闲超时触发事件。
- 用于连接保活、清理死连接。
- 业务层可发 ping/pong。

## 16. 性能调优要点

- 线程数：Boss 一般 1-2，Worker 按核数。
- 池化 ByteBuf 开启。
- 避免 Handler 中阻塞（耗时操作丢业务线程池）。
- 合理设置接收/发送缓冲区。
- 监控 EventLoop 积压任务（任务队列过长）。

## 17. 常见踩坑

1. **Handler 阻塞**：在 EventLoop 线程做 DB/HTTP 调用，拖垮所有连接；应丢业务线程池。
2. **ByteBuf 泄漏**：未释放（非 tail 自动释放路径）；用 ResourceLeakDetector 排查。
3. **错误的线程假设**：跨 Channel 操作不在同线程，需注意共享状态。
4. **粘包未处理**：直接读导致解析错乱；必须用帧解码器。
5. **频繁 writeAndFlush**：每次 flush 系统调用多；合并批量。
6. **IdleHandler 配置错**：心跳误杀正常长连接；阈值设合理。
7. **池化关了**：默认开，但误配导致 GC 压力。

## 18. 与 Reactor 对应

- Boss NioEventLoopGroup：主 Reactor，接连接。
- Worker NioEventLoopGroup：从 Reactor，管 IO 与 Handler。
- 每个 EventLoop 一个 Selector，多 Channel 注册其上。

## 19. 实战最小服务端骨架

```java
EventLoopGroup boss = new NioEventLoopGroup(1);
EventLoopGroup worker = new NioEventLoopGroup();
try {
  ServerBootstrap b = new ServerBootstrap();
  b.group(boss, worker)
   .channel(NioServerSocketChannel.class)
   .childHandler(new ChannelInitializer<SocketChannel>() {
     protected void initChannel(SocketChannel ch) {
       ch.pipeline().addLast(new LengthFieldBasedFrameDecoder(...));
       ch.pipeline().addLast(new BizHandler());
     }
   });
  b.bind(8080).sync().channel().closeFuture().sync();
} finally { boss.shutdownGracefully(); worker.shutdownGracefully(); }
```

## 20. 小结

Netty 的高性能源于 Reactor 多路复用 + 池化内存 + 零拷贝 + 精细线程模型。掌握 EventLoop/Channel/Pipeline/ByteBuf 四大件、帧解码解决粘包、Handler 不阻塞原则、池化与释放，即可构建稳定高并发网络服务。铁律：**Handler 内绝不阻塞、ByteBuf 必释放、粘包必用帧解码、耗时业务丢独立线程池**。
