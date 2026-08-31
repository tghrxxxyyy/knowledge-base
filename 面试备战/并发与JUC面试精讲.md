# 并发与 JUC 面试精讲

> 本文面向 Java 后端面试，系统梳理并发基础：线程模型、JMM 与 volatile、synchronized、Lock、JUC 工具类、线程池、并发容器、原子类与 AQS。重原理与常见追问，而非死记。

## 1. 进程与线程

- 进程：资源分配基本单位，独立内存空间。
- 线程：CPU 调度基本单位，共享进程内存。
- 上下文切换成本：线程 < 进程；但过多线程切换反而拖慢。

## 2. 创建线程的方式

- 继承 Thread / 实现 Runnable（无返回值）。
- 实现 Callable + Future（有返回值、可抛异常）。
- 线程池（推荐，避免频繁创建销毁）。

## 3. 线程状态（Java）

- NEW、RUNNABLE、BLOCKED、WAITING、TIMED_WAITING、TERMINATED。
- BLOCKED：等 synchronized 锁。
- WAITING：wait()/join()/park() 无超时。
- TIMED_WAITING：sleep()/wait(timeout)。

## 4. 竞态与可见性

### 4.1 原子性

- 多个操作要么全做要么全不做。
- i++ 非原子（读-改-写），需同步或原子类。

### 4.2 可见性

- 线程修改变量，其他线程未必立即可见（CPU 缓存）。
- volatile 保证可见性 + 禁止指令重排，但不保证复合操作原子。

### 4.3 有序性

- 编译/CPU 可能重排指令优化。
- volatile / 锁 / happens-before 约束重排。

## 5. JMM 与 happens-before

- JMM 定义线程间如何通信（共享内存）。
- happens-before 规则：若 A hb B，则 A 结果对 B 可见。
- 规则举例：
  - 程序顺序：单线程内前面 hb 后面。
  - volatile 写 hb 后续读。
  - 锁释放 hb 后续获取。
  - 线程 start() hb 其内代码。
  - 传递性：A hb B, B hb C ⇒ A hb C。

## 6. synchronized

### 6.1 特性

- 原子性、可见性、有序性（管程）。
- 可重入：同一线程可重复获取。
- 锁升级（思路）：偏向锁 → 轻量级（CAS 自旋）→ 重量级（操作系统互斥）。
- 锁对象：普通方法锁 this，静态方法锁类，代码块锁指定对象。

### 6.2 使用

```java
synchronized void foo() { /* 临界区 */ }
synchronized(obj) { /* 临界区 */ }
```

## 7. volatile

- 适用：状态标志、双重检查锁的引用可见。
- 不适用：i++ 这类复合操作（非原子）。
- 典型：单例双重检查中 `private static volatile Instance instance;`

## 8. Lock 接口（ReentrantLock）

- 相较 synchronized：可中断、超时获取、公平/非公平、多条件。
- 必须 finally 中 unlock，否则死锁。
- Condition 替代 wait/notify，支持多等待队列。

```java
lock.lock();
try { /* 临界区 */ } finally { lock.unlock(); }
```

## 9. AQS（AbstractQueuedSynchronizer）

- JUC 锁与同步器的基石（ReentrantLock、Semaphore、CountDownLatch 等）。
- 核心：state（同步状态）+ CLH 队列（等待线程）。
- 独占模式：tryAcquire/tryRelease。
- 共享模式：tryAcquireShared/tryReleaseShared。
- 获取失败线程入队、park 等待。

## 10. 线程池

### 10.1 核心参数

- corePoolSize：核心线程数。
- maximumPoolSize：最大线程数。
- keepAliveTime：非核心线程空闲存活。
- workQueue：任务队列。
- threadFactory：线程创建。
- handler：拒绝策略。

### 10.2 执行流程

1. 核心线程未满 → 新建核心线程执行。
2. 核心满 → 入队列。
3. 队列满 → 建非核心线程（至最大）。
4. 达最大且队列满 → 拒绝策略。

### 10.3 拒绝策略

- Abort（抛异常）。
- CallerRuns（调用者线程执行）。
- Discard（丢弃）。
- DiscardOldest（丢最旧）。

### 10.4 常见误区

- 用 Executors.newFixedThreadPool 可能队列无界致 OOM。
- 核心数设定：CPU 密集 ≈ 核数，IO 密集可更大。
- 务必自定义 ThreadFactory 命名线程便于排查。

## 11. 并发容器

- ConcurrentHashMap：分段/Node 级锁，高并发安全 Map（JDK8 用 CAS + synchronized 细粒度）。
- CopyOnWriteArrayList：读多写少，写时复制。
- BlockingQueue：生产者消费者（ArrayBlockingQueue/LinkedBlockingQueue）。
- ConcurrentLinkedQueue：无锁队列。

## 12. 原子类

- AtomicInteger/Long/Reference：CAS 实现无锁原子更新。
- ABA 问题：值从 A→B→A，CAS 以为没变；用 AtomicStampedReference 加版本。
- LongAdder：高并发计数分段累加，比 AtomicLong 竞争小。

## 13. 工具类

- CountDownLatch：等待 N 个任务完成（一次性）。
- CyclicBarrier：线程互相等到齐再继续（可重用）。
- Semaphore：限流/许可控制。
- Exchanger：两线程交换数据。

## 14. 死锁

- 条件：互斥、占有等待、不可抢占、循环等待。
- 预防：按固定顺序获取锁、超时、避免持有锁时等别的锁。
- 排查：jstack 看线程栈与锁持有。

## 15. 高频追问

- volatile 和 synchronized 区别？→ 前者仅可见性+有序，后者全管且可重入、阻塞。
- synchronized 和 ReentrantLock 选？→ 简单用前者，需超时/公平/多条件用后者。
- 线程池为什么不用无界队列？→ 任务堆积 OOM，应设合理队列+拒绝策略。
- HashMap 并发会怎样？→ 死循环/数据错（JDK7 头插），用 ConcurrentHashMap。
- 如何停止线程？→ 用中断标志（interrupt + 检查），不推荐 stop()。

## 16. 实战编码题思路

- 两个线程交替打印（wait/notify 或 Lock+Condition）。
- 生产者消费者（BlockingQueue）。
- 用 CountDownLatch 等待并发任务。
- 单例双重检查（volatile 防指令重排）。

## 17. 常见踩坑

1. **在循环里 new 线程**：资源耗尽；用线程池。
2. **锁对象用字符串常量/Integer**：不同地方拿到同一对象锁，意外互斥；用私有 final 对象。
3. **volatile 当原子用**：i++ 仍不安全。
4. **忘记 unlock**：异常路径未释放锁；必须 finally。
5. **线程池无界队列**：OOM。
6. **死锁无超时**：永远卡住；用 tryLock(timeout)。

## 18. 小结

Java 并发面试围绕"三性（原子/可见/有序）+ 工具（锁/池/容器/原子/AQS）+ 原理（JMM/happens-before/锁升级）"。掌握 synchronized 与 volatile 的边界、线程池参数与流程、AQS 思想、并发容器选型，足以应对绝大多数考察。编码题重"正确加锁 + 避免死锁 + 用对工具类"。
