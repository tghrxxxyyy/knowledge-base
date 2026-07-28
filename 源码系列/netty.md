# Netty 源码解析

> ⚠️ 本页内容待补充。

---

## 一、Reactor 线程模型

Netty 整体基于 **Reactor 主从多线程模型**：

- **BossGroup（ParentGroup）**：只负责 `ServerSocketChannel` 的 `OP_ACCEPT`，把新连接注册到 Worker。
- **WorkerGroup（ChildGroup）**：负责已建立连接的 `SocketChannel` 的读写（`OP_READ/OP_WRITE`）。
- 每个 `EventLoop` 绑定一个线程，串行处理绑定到它的多个 Channel 的 I/O 事件，因此**业务 Handler 内无需加锁**。

```mermaid
flowchart LR
    C[Client] --> S[ServerSocketChannel]
    S --> Boss[Boss EventLoopGroup<br/>Acceptor]
    Boss -->|register 新连接| W1[Worker EventLoop-1]
    Boss -->|register 新连接| W2[Worker EventLoop-2]
    Boss -->|register 新连接| WN[Worker EventLoop-N]
    W1 --> P1[ChannelPipeline]
    W2 --> P2[ChannelPipeline]
    WN --> PN[ChannelPipeline]
```

> 单线程 Reactor（一个 EventLoop 既 accept 又 read）、多线程 Reactor（一个 accept + 多个 read）、主从多线程（Netty 默认）三者区别只在 Group 的拆分粒度。

## 二、核心启动类：Bootstrap / ServerBootstrap

`Bootstrap` 用于客户端，`ServerBootstrap` 用于服务端，二者都继承自 `AbstractBootstrap`。

```java
// 服务端启动骨架
ServerBootstrap b = new ServerBootstrap();
b.group(bossGroup, workerGroup)           // 设置两个线程组
 .channel(NioServerSocketChannel.class)   // 反射创建 Channel 工厂
 .option(ChannelOption.SO_BACKLOG, 1024)
 .childOption(ChannelOption.SO_KEEPALIVE, true)
 .childHandler(new ChannelInitializer<SocketChannel>() {
     @Override
     protected void initChannel(SocketChannel ch) {
         ch.pipeline().addLast(new DecoderHandler());
         ch.pipeline().addLast(new BizHandler());
     }
 });
ChannelFuture f = b.bind(8080).sync();    // 异步绑定
f.channel().closeFuture().sync();
```

关键方法链路：

- `bind()` → `AbstractBootstrap.doBind()` → `initAndRegister()` → `channelFactory.newChannel()` 创建 `NioServerSocketChannel` → `config().group().register(channel)` 把 Channel 注册到 Boss 的 EventLoop。
- `group()` 区分 `parentGroup`（accept）与 `childGroup`（client IO）。
- `childHandler()` 里的 `ChannelInitializer` 在 Channel 注册成功后回调 `initChannel()`，把自定义 Handler 装入 `ChannelPipeline`。

## 三、Channel / ChannelPipeline / ChannelHandler

### 三者关系

```mermaid
classDiagram
    class Channel {
        +pipeline() ChannelPipeline
        +eventLoop() EventLoop
        +write(Object)
    }
    class ChannelPipeline {
        +addLast(ChannelHandler...)
        +addFirst(ChannelHandler...)
        -head ChannelHandlerContext
        -tail ChannelHandlerContext
    }
    class ChannelHandler {
        <<interface>>
    }
    class ChannelInboundHandler {
        +channelRead()
        +channelActive()
    }
    class ChannelOutboundHandler {
        +write()
        +flush()
    }
    class ChannelHandlerContext {
        +fireChannelRead()
        +write()
    }
    Channel "1" *-- "1" ChannelPipeline
    ChannelPipeline "1" *-- "many" ChannelHandlerContext
    ChannelHandlerContext --> ChannelHandler
    ChannelHandler <|-- ChannelInboundHandler
    ChannelHandler <|-- ChannelOutboundHandler
```

- **ChannelPipeline**：双向链表，头 `head`（outbound 起点 / inbound 终点），尾 `tail`。每个节点是 `ChannelHandlerContext`（包装了 Handler + 前后指针）。
- **Inbound（入站）**：数据从 `head` 向 `tail` 流动，事件如 `channelRead`、`channelActive`。调用 `ctx.fireChannelRead()` 向下传递。
- **Outbound（出站）**：数据从 `tail` 向 `head` 流动，事件如 `write`、`connect`、`close`。
- 典型 `ByteToMessageDecoder`（入站解码）、`MessageToByteEncoder`（出站编码）、`SimpleChannelInboundHandler`（业务）。

> 设计要点：Pipeline 把「协议解析 / 业务处理 / 编解码」拆成独立 Handler，符合**责任链 + 装饰器**模式；通过 `ChannelHandlerContext` 实现事件在链上的精准传播，避免每次都从头遍历。

## 四、EventLoop 线程模型

`EventLoop` = 一个线程 + 一个 `Selector` + 一个 `MpscQueue`（多生产者单消费者任务队列）。

```java
// NioEventLoop.run() 核心循环：select → 处理 IO → 处理任务
protected void run() {
    for (;;) {
        try {
            if (hasTasks()) {
                selectNow();           // 有任务立即 select，不阻塞
            } else {
                select(curDeadlineNanos); // 带超时 select
            }
            processSelectedKeys();     // 处理就绪的 IO 事件
            runAllTasks(ioTime * (100 - ioRatio) / 100); // 处理队列任务，控制 IO/任务时间比
        } catch (Throwable t) { ... }
    }
}
```

要点：

1. **串行无锁**：同一个 Channel 的所有 Handler 永远跑在绑定它的那一个 EventLoop 线程上，所以 Handler 内部状态不需要同步。
2. **任务提交**：`ctx.executor().execute(runnable)`、`channel.eventLoop().execute()` 会把任务放进该 EventLoop 的 `MpscQueue`，由同一线程消费——这是 Netty 实现「线程局部串行」的关键。
3. **ioRatio**：默认 50，表示 IO 处理与任务处理各占一半时间，避免任务饿死 IO 或反之。

## 五、ByteBuf：更强大的字节容器

对比 JDK `ByteBuffer`，Netty `ByteBuf` 做了改进：

| 维度 | ByteBuffer | ByteBuf |
|------|-----------|---------|
| 读写指针 | 共用 `position`，切换需 `flip()` | 分离 `readerIndex` / `writerIndex` |
| 容量扩容 | 固定，需手动 `allocate` | 写满自动扩容 |
| 池化 | 无 | 支持 `PooledByteBufAllocator`（基于 jemalloc 思想） |
| 零拷贝视图 | 无 | `slice()` / `duplicate()` 共享底层内存 |
| 引用计数 | 无 | `ReferenceCounted`，`retain()` / `release()` 显式释放 |

```java
ByteBuf buf = Unpooled.buffer(1024);
buf.writeInt(1);          // writerIndex += 4
buf.writeBytes("hello".getBytes(StandardCharsets.UTF_8));
int i = buf.readInt();    // readerIndex += 4，不破坏后续读
```

内存类型：

- **堆内 `HeapByteBuf`**：分配快，GC 管理，但 IO 时需要一次内核拷贝。
- **堆外 `DirectByteBuf`**：零拷贝基础，避免 GC 压力，但创建/销毁成本高 → 必须配合**池化**。

## 六、拆包与粘包（TCP 半包/粘包）

TCP 是字节流，应用层需自己界定消息边界。Netty 提供 `ByteToMessageDecoder` 子类解决：

| 解码器 | 策略 | 适用 |
|--------|------|------|
| `LineBasedFrameDecoder` | 以换行符 `\n`/`\r\n` 分隔 | 文本协议 |
| `DelimiterBasedFrameDecoder` | 自定义分隔符 | 文本协议 |
| `FixedLengthFrameDecoder` | 固定长度 | 定长报文 |
| `LengthFieldBasedFrameDecoder` | 消息头携带长度字段 | 主流二进制协议 |

`LengthFieldBasedFrameDecoder` 工作原理（`decode` 抽象）：先读 `lengthFieldLength` 指定长度的长度字段，得到 body 长度，累积到足够字节再切出一个完整 `ByteBuf` 向下传递；不足则 `cumulator` 累积，标记 `needDiscard` 等状态。

```
入站字节流: [len=5][hello][len=3][abc][len=...]
           ↓ LengthFieldBasedFrameDecoder
出站 Packet: "hello"  "abc"  ...
```

自定义示例（基于长度字段）：

```java
pipeline.addLast(new LengthFieldBasedFrameDecoder(
        1024 * 1024,  // maxFrameLength
        0,            // lengthFieldOffset（长度字段在开头）
        4,            // lengthFieldLength（4 字节 int）
        0,            // lengthAdjustment
        4));          // initialBytesToStrip（跳过长度字段本身）
```

## 七、心跳与断线重连

### 心跳（IdleStateHandler）

```java
pipeline.addLast(new IdleStateHandler(
        0,           // readerIdleTime：读空闲
        5,           // writerIdleTime：5s 写空闲
        0));         // allIdleTime
// 自定义 Handler 覆写 userEventTriggered 发 Ping
@Override
public void userEventTriggered(ChannelHandlerContext ctx, Object evt) {
    if (evt instanceof IdleStateEvent) {
        ctx.writeAndFlush(new PingMessage());  // 超时发心跳
    }
}
```

`IdleStateHandler` 借助 `EventLoop` 的 `schedule` 定时检测 `reader/writer/allIdle` 时间，触发 `IdleStateEvent` 事件向下传播。

### 断线重连（客户端）

```java
bootstrap.connect(host, port).addListener((ChannelFutureListener) future -> {
    if (!future.isSuccess()) {
        // 失败则定时重连
        future.channel().eventLoop().schedule(
            () -> connect(), 3, TimeUnit.SECONDS);
    }
});
// 连接断开事件
@Override
public void channelInactive(ChannelHandlerContext ctx) {
    ctx.channel().eventLoop().schedule(() -> connect(), 3, TimeUnit.SECONDS);
}
```

## 八、零拷贝（Zero-Copy）

Netty 在多处使用零拷贝减少内存拷贝：

1. **`FileRegion` + `transferTo`**：文件传输直接 `fileChannel.transferTo(socketChannel)`，数据从内核文件缓冲区直达网卡，不经过用户态。

   ```java
   FileRegion region = new DefaultFileRegion(fileChannel, 0, fileLength);
   ctx.writeAndFlush(region); // 底层走 FileChannel.transferTo
   ```

2. **`CompositeByteBuf`**：逻辑上合并多个 `ByteBuf` 而不拷贝底层数据（避免 header+body 拼接时复制）。
3. **`slice()` / `duplicate()`**：生成共享同一底层内存的视图（独立 read/writeIndex），避免整段复制。
4. **堆外 DirectBuffer**：直接在内核可访问内存读写，省去用户态↔内核态一次拷贝。

```mermaid
flowchart TB
    A[应用 ByteBuf] -->|write| B[DirectBuffer 堆外]
    B -->|socket.write| C[Socket 发送缓冲区 内核态]
    D[文件] -->|FileRegion.transferTo| C
    C --> E[网卡]
```

## 九、最小可运行示例（服务端 Echo）

```java
public class EchoServer {
    public static void main(String[] args) throws Exception {
        EventLoopGroup boss = new NioEventLoopGroup(1);
        EventLoopGroup worker = new NioEventLoopGroup();
        try {
            ServerBootstrap b = new ServerBootstrap();
            b.group(boss, worker)
             .channel(NioServerSocketChannel.class)
             .childHandler(new ChannelInitializer<SocketChannel>() {
                 @Override
                 protected void initChannel(SocketChannel ch) {
                     ch.pipeline().addLast(
                         new LengthFieldBasedFrameDecoder(1024,0,4,0,4),
                         new SimpleChannelInboundHandler<ByteBuf>() {
                             @Override
                             protected void channelRead0(ChannelHandlerContext ctx, ByteBuf msg) {
                                 ctx.writeAndFlush(msg.retain()); // Echo 回写
                             }
                         });
                 }
             });
            b.bind(8080).sync().channel().closeFuture().sync();
        } finally {
            boss.shutdownGracefully();
            worker.shutdownGracefully();
        }
    }
}
```

> **读源码建议**：从 `ServerBootstrap.bind()` → `AbstractBootstrap.doBind()` → `initAndRegister()` 入手，再顺 `NioEventLoop.run()` 看事件循环，最后看 `ChannelPipeline` 如何驱动 Handler。这三段是理解 Netty 的骨架。
