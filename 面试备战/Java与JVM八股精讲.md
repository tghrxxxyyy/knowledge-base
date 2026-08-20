# Java 与 JVM 八股精讲

> 本篇把 Java 基础 + JVM 的高频面试考点，按"原理→对比→踩坑→升华"四步组织。
> 深读请回到 [基础知识/java体系.md](../基础知识/java体系.md) 与 [基础知识/Java虚拟机.md](../基础知识/Java虚拟机.md)。

---

## 目录

1. [String 与常量池](#1-string-与常量池)
2. [集合：HashMap 底层与 ConcurrentHashMap](#2-集合hashmap-底层与-concurrenthashmap)
3. [反射、泛型与异常](#3-反射泛型与异常)
4. [JMM 与 happens-before](#4-jmm-与-happens-before)
5. [类加载机制](#5-类加载机制)
6. [GC：算法、分代与 G1/ZGC 对比](#6-gc算法分代与-g1zgc-对比)
7. [内存结构与 OOM](#7-内存结构与-oom)
8. [口诀汇总](#8-口诀汇总)

---

## 1. String 与常量池

**Q：String 为什么不可变？**
- 底层 `private final char[] value`（JDK9 起改为 `byte[]` + `coder` 编码标志，节省空间）；`final` 保证引用不变，`private` 且无 setter 保证内容不变。
- 不可变带来三件事：① 可安全放进**字符串常量池**复用；② 可做 `HashMap` key（hash 不变）；③ 线程安全。

**Q：`==` 与 `equals` 区别？`intern()` 做什么？**
- `==` 比引用地址；`equals` 默认比地址，String 重写为比内容。
- `intern()`：若常量池已有该字符串则返回池中引用，否则放入池中并返回。JDK7 起常量池移到**堆**中，不再限制在永久代。

```java
String a = new String("abc");   // 创建 2 个对象：常量池"abc" + 堆中 new
String b = "abc";               // 直接指向常量池
System.out.println(a == b);     // false（堆 vs 池）
System.out.println(a.intern() == b); // true（都指向池）
```

> **踩坑**：`new String("abc")` 在**类加载阶段**就可能把 "abc" 放进常量池，运行期 `new` 只额外在堆建对象。大量字符串拼接别用 `+`，用 `StringBuilder`（循环内尤其致命，会生成 N 个中间对象）。

> **升华**：不可变 → 线程安全 → 可池化；这是 JVM 层"用不可变换性能与安全"的经典权衡。

---

## 2. 集合：HashMap 底层与 ConcurrentHashMap

### 2.1 HashMap（JDK8）

| 维度 | 要点 |
|------|------|
| 数据结构 | 数组 + 链表 + 红黑树（JDK8） |
| 默认容量 | 16，负载因子 0.75 → 阈值 12 |
| 哈希扰动 | `hash = h ^ (h >>> 16)`，高位参与降冲突 |
| 树化条件 | 链表长度 ≥8 **且** 数组容量 ≥64；否则优先扩容 |
| 树退化为链 | 长度 ≤6 |
| 扩容 | 2 倍，rehash 时元素要么原索引、要么原索引+旧容量（省计算） |

**Q：为什么链表转红黑树阈值是 8？**
- 泊松分布下，哈希冲突到 8 的概率极低（约 0.00000006），是"几乎不会发生但兜底"的选择；红黑树节点是链表节点的 2 倍空间，只在真冲突严重时才划算。

**Q：为什么容量必须是 2 的幂？**
- 取模用 `& (n-1)` 替代 `% n`，位运算更快；且扩容时 rehash 只需看多出的那一位（0 原地 / 1 偏移旧容量）。

### 2.2 ConcurrentHashMap（JDK8）

| 对比点 | HashMap | Hashtable | ConcurrentHashMap(JDK8) |
|--------|---------|-----------|--------------------------|
| 线程安全 | ❌ | ✅ 全表 synchronized | ✅ CAS + synchronized(桶头) |
| 锁粒度 | 无 | 整个表 | 单个桶（链表头/树根） |
| 读 | 无锁 | 同步 | **无锁**（volatile + 原子语义） |
| 并发度 | — | 1 | ≈ 桶数量 |

> **踩坑**：`ConcurrentHashMap` **不能**用 `null` 作 key/value（HashMap 可以）；`computeIfAbsent` 内部有锁，避免在其中做耗时操作导致其他线程阻塞。

> **口诀：HashMap 数组链表红黑树，扰动求模定桶位；容量 2 的幂扩两倍，冲突八转六退链；并发用 CHM，CAS 加锁只锁桶。**

---

## 3. 反射、泛型与异常

**Q：泛型为什么擦除？**
- 为兼容 Java5 之前字节码（伪泛型）：编译期做类型检查，运行时 `ArrayList<String>` 与 `ArrayList<Integer>` 都是 `ArrayList`。代价：不能 `new T()`、不能 `instanceof T`、数组泛型受限。

**Q：异常体系？**
```
Throwable
 ├─ Error（OOM/StackOverflow，不应捕获）
 └─ Exception
     ├─ RuntimeException（unchecked，空指针/下标越界）
     └─ 其他（checked，必须 try 或 throws，如 IOException）
```
> **踩坑**：`finally` 中的 `return` 会**覆盖** try 的返回值；`catch (Exception e)` 别吞异常不打日志。

---

## 4. JMM 与 happens-before

**Q：JMM 是什么？**
- Java 内存模型定义了**线程工作内存与主内存的交互规则**，屏蔽硬件差异，保证可见性、原子性、有序性。

**Q：happens-before 规则（高频）**
1. 程序次序：单线程内前面的操作 HB 后面的；
2. **volatile 写 HB 后续对该变量的读**；
3. **synchronized 解锁 HB 后续加锁**；
4. 线程 `start()` HB 该线程任何操作；
5. 线程结束 HB `join()` 返回后；
6. 传递性：A HB B，B HB C ⇒ A HB C。

> **口诀：happens-before 八条里，volatile 写读、锁解加、start/join 最常被问；它能解释'为什么加了 volatile 别的线程就看到了'。**

---

## 5. 类加载机制

**Q：双亲委派模型？**
```
BootStrapClassLoader (C++, 加载 rt.jar)
   ↑ 父
ExtensionClassLoader   (jre/lib/ext)
   ↑ 父
ApplicationClassLoader (classpath)
```
- 加载请求先**委派父加载器**，父加载不了才自己加载。目的：① 防止核心类被篡改（如自定义 `java.lang.String` 不会被加载）；② 避免重复加载。

**Q：如何打破双亲委派？（3 种场景）**
1. **SPI**（JDBC）：核心接口在 rt.jar，实现在应用 classpath，用**线程上下文类加载器**反向委派；
2. **Tomcat**：WebAppClassLoader 先自己加载，再委派父，实现应用隔离；
3. **热部署/OSGi**：自定义 ClassLoader 重写 `loadClass`。

> **踩坑**：自定义 ClassLoader 重写了 `loadClass` 却没调 `super`，容易破坏委派导致 `ClassNotFoundException` 或重复加载。

---

## 6. GC：算法、分代与 G1/ZGC 对比

### 6.1 分代与算法

| 区域 | 算法 | 说明 |
|------|------|------|
| 新生代（Eden+S0+S1） | 复制算法 | 对象朝生夕死，复制存活对象，效率高 |
| 老年代 | 标记-整理 / 标记-清除 | 存活率高，整理避免碎片 |
| 方法区（元空间） | 元数据回收 | 类卸载条件苛刻 |

**可达性分析**：以 GC Roots（栈帧局部变量、静态变量、JNI 引用）为起点，不可达即回收。`finalize()` 只执行一次，不建议用。

### 6.2 收集器对比（面试必背表）

| 收集器 | 分代 | 线程 | 算法 | 停顿 | 适用 |
|--------|------|------|------|------|------|
| Serial | 新+老 | 单 | 复制/标记整理 | 长 | 客户端小应用 |
| Parallel | 新+老 | 多 | 同上 | 中 | 吞吐优先 |
| CMS | 老年代 | 并发 | 标记-清除 | 短(但碎片化) | 低延迟旧选 |
| **G1** | 分 Region | 并发 | 标记-整理 | 可预测(≤200ms) | JDK9+ 默认 |
| **ZGC** | 不分代 | 并发 | 染色指针+读屏障 | **<10ms** | JDK15+ 大堆低延迟 |
| Shenandoah | 不分代 | 并发 |  Brooks 转发指针 | <10ms | 类 ZGC 备选 |

**G1 关键**：把堆切成一个个 Region，优先回收"垃圾最多"的 Region（Garbage First），可设 `MaxGCPauseMillis` 目标（**软目标，不保证**）。

**ZGC 关键**：染色指针（Pointer Metadata）把标记信息放指针高位，配合读屏障，几乎全程并发，停顿与堆大小无关。

> **踩坑**：CMS 会产生**内存碎片**，Full GC 时停顿恐怖；G1 虽整理但 Mixed GC 不及时也会退化；ZGC 在**小堆（<数 G）**收益不明显，反而增加 CPU 负担。

> **口诀：新代复制老代整，G1 切 Region 先收垃圾最多；ZGC 染色指针并发狠，停顿不随堆长大。**

---

## 7. 内存结构与 OOM

```
运行时数据区：
├─ 线程私有：程序计数器 / 虚拟机栈 / 本地方法栈
├─ 线程共享：堆(最大, 对象实例) / 方法区(元空间, 类元信息/常量)
└─ 直接内存（NIO，不受 GC，受本机内存限制）
```

**常见 OOM 类型与排查**

| 错误 | 原因 | 排查工具 |
|------|------|----------|
| `Java heap space` | 堆溢出，对象太多/内存泄漏 | `jmap -histo` / MAT / Arthas `dashboard` |
| `GC overhead limit exceeded` | 98% 时间 GC 却回收 <2% | 同上 |
| `Metaspace` | 类加载过多（动态代理/热部署） | `-XX:MaxMetaspaceSize` |
| `Unable to create new native thread` | 线程数超 `ulimit -u` | 查线程池是否失控 |
| `Direct buffer memory` | NIO 直接内存泄漏 | `-XX:MaxDirectMemorySize` |

> **踩坑**：`OutOfMemoryError` 与 `StackOverflowError` 区别——前者多为堆/元空间，后者是栈深度超 `Xss`（无限递归）。

---

## 8. 口诀汇总

> **String 不可变，常量池里复用；== 比地址，equals 比内容，intern 入池。**
> **HashMap：数组链表红黑树，扰动求模定桶位；2 的幂扩两倍，八转六退。**
> **CHM 锁桶不锁表，读无锁写 CAS。**
> **泛型擦除保兼容，异常 Error 不捕获。**
> **JMM 管可见，happens-before 八条记心间。**
> **双亲委派防篡改，SPI/Tomcat 反向破。**
> **GC 分代：新复制老整理；G1 收最多，ZGC 不随堆长。**

---

[← 返回面试备战](../面试备战/README.md) · [MySQL 与 Redis 八股精讲](MySQL与Redis八股精讲.md)
