# Tomcat 源码精读

## 〇、本体介绍

**Tomcat** 是 Java 最主流的 Servlet 容器 / Web 服务器。源码展示了一个**经典的分层容器 + 责任链 + Reactor 式 IO** 架构，是理解「HTTP 请求怎么变成 Servlet 调用」的最佳样本。

**为什么读源码**：理解Connector（IO 线程模型）、Container（Engine/Host/Context/Wrapper 四级容器）、Pipeline-Valve（责任链）、类加载隔离——这些直接对应「请求链路、热部署、内存隔离」等面试/排障点。

**核心组件**：Server → Service → **Connector**（Endpoint+Processor）+ **Container**（Engine→Host→Context→Wrapper）。

---

## 一、整体架构（两大组件）

- **Connector**：负责**接收连接、解析协议（HTTP/AJP）、把请求适配成 Request/Response**，交给 Container。核心是 `Endpoint`（网络 IO）+ `Processor`（协议解析）。
- **Container**：**四级容器** Engine（引擎）→ Host（虚拟主机）→ Context（Web 应用）→ Wrapper（Servlet）。每层有 Pipeline-Valve 责任链，请求自顶向下流经各级 Valve 最后到 Wrapper 调 Servlet。

---

## 二、Connector 与 IO 模型

- **Endpoint**：底层 IO，支持 **BIO（旧）/NIO/NIO2（默认，基于 Java NIO）/APR**。
- **NIO 模型**：`Acceptor` 线程接连接 → 注册到 `Poller`（基于 `Selector` 多路复用）→ `SocketProcessor` 交 Worker 线程池处理。类似 Reactor 多路复用（与 Netty 思想同源）。
- **线程池**：`Executor`（Tomcat 自带 ThreadPoolExecutor 变体，无队列上限改用 `TaskQueue` 直接提交），处理请求逻辑。

---

## 三、请求处理链路（责任链）

1. `Endpoint` 收到连接，`Processor` 解析 HTTP 成 `Request`。
2. 交给 `CoyoteAdapter` 适配为 Servlet `Request/Response`。
3. 进入 Container 的 **Pipeline**：Engine Valve → Host Valve → Context Valve → Wrapper Valve → **`StandardWrapperValve` 调 `FilterChain` 再到 `Servlet.service()`**。
4. 响应沿原路返回。

> **Pipeline-Valve** 是 Tomcat 的「责任链模式」实现：每个容器一条 Pipeline，末尾是 `Basic Valve` 调下一层；自定义 Valve 可插在前面做日志/鉴权。

---

## 四、类加载器（隔离与热部署）

- 层级：`Bootstrap → System → Common → (WebApp / Shared)`。每个 **Web 应用（Context）有独立 WebAppClassLoader**，实现应用间类隔离。
- **双亲委派破坏**：WebAppClassLoader **先自己加载（不委派父）再委派**，保证应用类优先；支持热部署（context 重载时新建类加载器，旧的可被 GC）。
- 这也是「为什么不同 war 的同名类互不干扰」「热部署为什么偶尔内存泄漏（旧加载器未释放）」的根源。

---

## 五、启动流程（Lifecycle）

- 所有核心组件实现 **Lifecycle** 接口，统一 `init → start`（含 `before/start/after` 事件），通过 **监听器（LifecycleListener）** 解耦。Server 启动级联启动 Service → Connector / Engine 等。
- 这是「模板方法 + 观察者」模式的经典运用。

---

## 六、Session 与并发

- `StandardManager` 默认内存存 Session；集群用 `DeltaManager`/`BackupManager` 复制。Session ID 用 Cookie（JSESSIONID）。
- 并发：每请求绑定线程（ThreadLocal 传 Request），Servlet 默认**非线程安全**（成员变量需谨慎）。

---

## 七、与其他板块的关系

- **源码系列 / Netty**：同为 Reactor/多路复用 IO 思想，但 Tomcat 偏 Servlet 容器、Netty 偏通用网络框架。
- **基础知识 / 并发编程**：线程池、Lifecycle 事件、类加载与双亲委派。
- **中间件 / API 网关**：网关常反向代理到 Tomcat 后的应用。

---

## 八、速查表

| 组件 | 职责 |
|------|------|
| Connector | 接连接、解析协议、适配 Request |
| Endpoint | 底层 IO（NIO/APR） |
| Container | Engine/Host/Context/Wrapper 四级 |
| Pipeline-Valve | 请求责任链 |
| WebAppClassLoader | 应用隔离、热部署 |

---

## 面试高频问题（20+ 条）

1. **Tomcat 整体架构？** Server→Service→Connector+Container（Engine/Host/Context/Wrapper）。
2. **Connector 做什么？** 接连接、解析 HTTP、适配成 Servlet Request/Response。
3. **Tomcat IO 模型？** BIO(旧)/NIO/NIO2/APR；默认 NIO，基于 Selector 多路复用。
4. **NIO 下请求怎么流转？** Acceptor 接连接→Poller(Selector)→Worker 线程处理。
5. **四级容器是什么？** Engine→Host(虚拟主机)→Context(应用)→Wrapper(Servlet)。
6. **Pipeline-Valve 是什么？** 责任链：每层 Pipeline，末尾 Basic Valve 调下层；自定义 Valve 插队。
7. **请求从连接到 Servlet 的链路？** Endpoint→Processor→CoyoteAdapter→Container Pipeline→FilterChain→Servlet。
8. **为什么需要 CoyoteAdapter？** 把 Coyote 的 Request 适配为 Servlet 规范 Request/Response。
9. **Tomcat 类加载层级？** Bootstrap→System→Common→WebApp/Shared；每应用独立 WebAppClassLoader。
10. **为什么破坏双亲委派？** WebAppClassLoader 先自己加载，保证应用类优先、隔离。
11. **热部署怎么实现的？** 重建 WebAppClassLoader，旧加载器不可达后被 GC；Context reload。
12. **热部署内存泄漏原因？** 旧类加载器被 ThreadLocal/静态引用持有，未释放。
13. **Lifecycle 接口作用？** 统一 init/start/stop 事件，监听器解耦启动流程。
14. **Tomcat 线程池特点？** 自研 ThreadPoolExecutor + TaskQueue，直接提交式（满了再排队）。
15. **Servlet 线程安全吗？** 默认非线程安全，成员变量需同步或避免共享。
16. **Tomcat 与 Jetty 区别？** Tomcat 重 Servlet 容器、成熟；Jetty 轻量、易嵌入。
17. **Session 怎么存？** 默认内存 StandardManager；集群复制或外置(Redis)。
18. **JSESSIONID 作用？** 标识 Session，存 Cookie。
19. **Connector 和 Container 如何解耦？** 通过 Adapter 适配，协议与容器独立演进。
20. **Tomcat 怎么支持 HTTPS？** Connector 配 SSL/TLS 证书（JSSE/OpenSSL）。
21. **为什么 Tomcat 比手写 ServerSocket 强？** 连接管理、线程池、协议解析、安全、热部署一站式。
22. **Tomcat 在 Spring Boot 内嵌？** Boot 内嵌 Tomcat，启动时初始化 Connector+Container，无需外部部署。
