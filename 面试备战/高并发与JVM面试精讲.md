# 高并发与 JVM 面试精讲

> 板块：面试备战 　|　 返回：[README](README.md)
> 覆盖：JVM 内存/GC/类加载、并发编程、线程池、锁、JMM、高频考点与追问。

## 一、JVM 内存结构

JVM 运行时数据区分线程私有与共享：

- **线程私有**：程序计数器（行号指示）、Java 虚拟机栈（栈帧/局部变量/操作数栈）、本地方法栈。
- **线程共享**：堆（对象实例，GC 主战场）、方法区/元空间（类信息、常量、静态变量）。

> 栈溢出（StackOverflowError）来自无限递归或过深调用；堆溢出（OutOfMemoryError: Java heap space）来自对象无法回收或堆设太小。

## 二、堆的分代与 GC

- **分代假设**：绝大多数对象朝生夕死，故分代收集。
- **新生代**：Eden + 2 个 Survivor（S0/S1）。新对象在 Eden 分配，Minor GC 后存活对象进 Survivor，年龄到阈值（默认 15）晋升老年代。
- **老年代**：存放长期存活对象，Major/Full GC 慢。
- **元空间**：存类元数据，使用本地内存，默认无上限（需设 `-XX:MaxMetaspaceSize` 防耗尽）。

## 三、常见垃圾收集器

| 收集器 | 区域 | 算法 | 特点 |
|--------|------|------|------|
| Serial | 新生代 | 复制 | 单线程，简单，Client 模式 |
| ParNew | 新生代 | 复制 | Serial 多线程版，配合 CMS |
| Parallel Scavenge | 新生代 | 复制 | 吞吐优先 |
| CMS | 老年代 | 标记-清除 | 低延迟，但碎片、Concurrent Mode Failure |
| G1 | 整堆 | 分 Region | 可预测停顿，平衡吞吐与延迟 |
| ZGC / Shenandoah | 整堆 | 并发 | 亚毫秒级暂停，大堆友好 |

- **G1**：把堆切成多个 Region，优先回收价值高（垃圾多）的 Region；可设 `-XX:MaxGCPauseMillis` 目标。
- **ZGC**：染色指针 + 读屏障，几乎全并发，暂停不随堆增大而增长。

## 四、GC  Roots 与可达性分析

- 从 GC Roots（栈引用、静态变量、常量、JNI 引用）出发，可达的对象存活，不可达的回收。
- **引用类型**：强（不回收）、软（内存不足才回收，适合缓存）、弱（下次 GC 必回收）、虚（仅跟踪回收）。

## 五、类加载机制

- **双亲委派**：类加载器收到请求先委派父加载器，父无法加载才自己加载。好处：核心类不被篡改、避免重复加载。
- **破坏双亲委派**：SPI（JDBC）、热部署、OSGi 等场景需要。
- **三个步骤**：加载（读字节码）→ 链接（验证/准备/解析）→ 初始化（执行 `<clinit>`）。

## 六、Java 内存模型（JMM）

- 目标：定义多线程下变量的可见性与有序性。
- **可见性**：一个线程改了共享变量，其他线程能否立刻看到 → `volatile` 保证可见性与禁止指令重排。
- **有序性**：编译器和 CPU 会重排指令（不影响单线程结果 as-if-serial），多线程下需 `volatile`/`synchronized`/锁保证。
- **原子性**：`synchronized`、CAS（`Atomic` 类）保证。

## 七、volatile 与 synchronized

- **volatile**：可见性 + 禁止重排，但不保证复合操作原子性（如 `i++` 非原子）。
- **synchronized**：互斥 + 可见性，底层是 monitor 锁，升级路径：无锁 → 偏向锁 → 轻量级锁（CAS）→ 重量级锁（OS 互斥）。
- **锁优化**：锁消除（逃逸分析无竞争则去锁）、锁粗化（合并相邻锁）、自旋（避免立刻挂起）。

## 八、线程池

- **核心参数**：`corePoolSize`（核心线程）、`maximumPoolSize`、`keepAliveTime`（非核心线程空闲回收）、`workQueue`（任务队列）、`threadFactory`、`RejectedExecutionHandler`（拒绝策略）。
- **执行流程**：任务来 → 核心线程满 → 进队列 → 队列满 → 开非核心线程 → 达最大 → 触发拒绝策略。
- **拒绝策略**：Abort（抛异常）、CallerRuns（调用者线程执行）、Discard（丢弃）、DiscardOldest（丢最旧）。
- **坑**：用 `Executors.newFixedThreadPool` 默认无界队列 → 任务堆积 OOM；`newCachedThreadPool` 最大线程无界 → 线程爆炸。生产用 `ThreadPoolExecutor` 显式设队列与拒绝策略。

```java
ExecutorService pool = new ThreadPoolExecutor(
    8, 64, 60L, TimeUnit.SECONDS,
    new LinkedBlockingQueue<>(1000),
    new ThreadPoolExecutor.CallerRunsPolicy());
```

## 九、并发工具类

- **AQS**：抽象队列同步器，ReentrantLock、Semaphore、CountDownLatch、CyclicBarrier 的底座。
- **ReentrantLock**：可中断、可定时、公平/非公平、Condition 多条件。
- **ConcurrentHashMap**：JDK 8 用 CAS + synchronized 细化到桶，读无锁。
- **原子类**：`AtomicInteger` 等基于 CAS 自旋。
- **ThreadLocal**：线程隔离变量，注意用后 `remove()` 防线程池复用导致泄漏。

## 十、CAS 与 ABA

- **CAS**：比较并交换，无锁乐观并发；缺点是循环开销、只能保证一个变量、ABA 问题。
- **ABA**：值从 A→B→A，CAS 误以为没变。解决：加版本号（`AtomicStampedReference`）。

## 十一、死锁与活锁

- **死锁四条件**：互斥、持有等待、不可剥夺、循环等待。破坏任一即可（如按顺序加锁、超时）。
- **活锁**：线程互相谦让，都在跑但无进展。
- **诊断**：`jstack` 看线程栈与死锁检测。

## 十二、高频面试题

1. 对象创建过程？类加载检查 → 分配内存（指针碰撞/空闲列表）→ 初始化零值 → 设对象头 → `<init>`。
2. 对象头有什么？Mark Word（哈希/GC 年龄/锁状态）+ 类型指针 + 数组长度（数组）。
3. 内存分配策略？优先 Eden；大对象直接进老年代；长期存活晋升；动态年龄判定。
4. 为什么要有 Survivor？减少对象直接进老年代，降低 Full GC 频率。
5. G1 怎么做到可预测停顿？Region 化 + 优先回收垃圾多的 Region + 停顿目标。
6. `i++` 为什么非线程安全？读-改-写三步，线程切换导致丢失更新。
7. volatile 能替代锁吗？不能，只保可见与有序，不保复合原子。
8. synchronized 和 ReentrantLock 区别？后者更灵活（可中断/公平/多条件/尝试锁）。
9. 线程池为什么不用无界队列？任务无限堆积 → OOM。
10. ThreadLocal 原理与坑？线程私有 Map，key 弱引用，不 remove 在线程池下泄漏。
11. 类加载双亲委派及破坏场景？
12. CMS 四个阶段与缺点？初始标记/并发标记/重新标记/并发清除；碎片 + 并发失败。
13. 强引用与软引用在缓存的应用？软引用做内存敏感缓存，不足时回收。
14. 什么是伪共享（false sharing）？多变量同缓存行被不同核修改，互相失效；用 `@Contended` 填充。
15. 单例的双重检查锁定为什么还要 volatile？防止指令重排导致拿到半初始化对象。

## 十三、调优实战

- 工具：`jps`（进程）、`jstat`（GC 统计）、`jmap`（堆转储）、`jstack`（线程）、`jinfo`、`arthas`（在线诊断）。
- 思路：先定目标（吞吐 or 低延迟）→ 看 GC 日志（`-Xlog:gc*`）→ 调堆大小/收集器/代比例 → 压测验证。
- 常见：Full GC 频繁 → 查内存泄漏（堆转储看大对象）、调大堆或换 G1/ZGC；Young GC 慢 → 调 Eden/Survivor 比例。

## 十四、常见误区

- 误以为 `volatile` 能保原子 → 复合操作仍需锁/CAS。
- 误用 `Executors` 快捷方法 → 无界队列 OOM。
- 以为 GC 越频繁越好或越慢越好 → 看业务目标平衡。
- 线程池不命名线程 → 出问题时难定位。
- ThreadLocal 用完不 remove → 线程池复用泄漏/串数据。

## 十五、延伸阅读

- [架构/CAP定理与一致性模型](../架构/CAP定理与一致性模型.md)
- [场景设计/秒杀系统设计与高并发扣减](../场景设计/秒杀系统设计与高并发扣减.md)
- [源码系列/缓存与存储源码要点](../源码系列/缓存与存储源码要点.md)
- 书：《深入理解 Java 虚拟机》《Java 并发编程实战》
