# 用户态COW字符串实现

> 对应 Stroustrup《The C++ Programming Language》对 `basic_string` 实现约束的讨论、Boehm/Atkinson/Plass 1995 *Ropes: an Alternative to Strings*，以及 Go 语言规范与《The Rust Programming Language》中的字符串所有权设计。

## 一、背景与挑战

字符串是最常被复制的大对象之一：日志拼接、配置解析、模板渲染会产生大量「赋值后只读」或「切片后只读」的中间串。若每次赋值都深拷贝底层字节，$O(n)$ 的复制会淹没业务逻辑；若允许共享底层缓冲，又必须保证「一方修改不影响另一方」。

用户态 COW 与内核 COW 目标一致（延迟复制），手段完全不同——内核靠页表只读位与缺页异常，用户态只能靠**引用计数**或**不可变语义**。两条主流路线：

- **可变 COW 字符串**：带引用计数，写前检查计数，>1 则先复制（早期 `std::string` 实现）。
- **不可变字符串**：类型层面禁止原地修改，赋值与切片只复制指针（Go `string`、Java 字符串、Rust `&str`）。

## 二、核心原理

**引用计数式 COW** 的生命周期是：构造时分配缓冲与引用计数块（计数置 1）；赋值/拷贝只递增计数、不复制字节；读操作（`const` 访问、比较）直接读共享缓冲、零成本；写操作检查计数——>1 则分配新缓冲、复制内容并挂到新缓冲（计数 1）同时把原缓冲计数减 1，==1 说明独占可直接原地修改；析构时计数减 1，减到 0 才释放缓冲。

**不可变字符串**把第 4 步从「运行时检查」变成「编译期禁止」：任何看似修改的操作都返回新对象，因此不存在共享可变状态，无需计数，天然线程安全、切片 $O(1)$。代价差别明显：COW 读路径便宜、写路径昂贵且需同步计数；不可变的写路径要分配新串，但用 builder/rope 可摊销大量修改。

## 三、形式化与数学基础

设原串长度 $n$、共享者数 $k$。两种策略的赋值成本为 $C_{copy} = O(n)$ 与 $C_{COW} = O(1)$；首次写入成本取决于是否独占：

$$C_{write} = \begin{cases} O(1) & \text{独占（} ref = 1\text{）} \\ O(n) & \text{共享（} ref > 1\text{）} \end{cases}$$

若共有 $m$ 个写者，COW 总复制量为 $O(m\cdot n)$，eager 为 $O(k\cdot n)$，当 $m \ll k$（读多写少）时收益显著。不可变共享的切片与原串共享底层数组：

$$slice(s,i,j):\ \text{cost} = O(1),\qquad refcount(\text{backing array}) \mathrel{+}= 1$$

**并发成本**：若 $ref$ 被多线程访问，必须用原子操作，自增成本从约一个周期上升到带 `LOCK` 前缀的 RMW（数十周期），还可能引发缓存行乒乓。这正是 C++11 之后弃用 COW `std::string` 的核心动因之一。

## 四、代码实现

```c
/* 类型：缓冲与引用计数块由所有共享者公用 */
typedef struct { char *buf; size_t len; atomic_int *refs; } CowStr;

/* 赋值：只增计数，不复制字节 */
static void cow_assign(CowStr *dst, CowStr *src) {
    if (dst->refs == src->refs) return;                 /* 自赋值 */
    atomic_fetch_add_explicit(src->refs, 1, memory_order_relaxed);
    if (atomic_fetch_sub_explicit(dst->refs, 1, memory_order_acq_rel) == 1)
        free(dst->buf), free(dst->refs);                /* 自己是最后一个引用 */
    dst->buf = src->buf; dst->len = src->len; dst->refs = src->refs;
}

/* 写：唯一需要检查计数的地方 */
static void cow_write(CowStr *s, size_t i, char c) {
    if (atomic_load_explicit(s->refs, memory_order_acquire) > 1) {
        char *nb = malloc(s->len + 1);            /* 复制到新缓冲 */
        memcpy(nb, s->buf, s->len + 1);
        atomic_fetch_sub_explicit(s->refs, 1, memory_order_acq_rel);
        s->buf = nb;
        s->refs = malloc(sizeof(atomic_int));
        atomic_store_explicit(s->refs, 1, memory_order_relaxed);
    }
    s->buf[i] = c;                                /* 独占，可安全原地写 */
}
```

注意 `refs` 与 `buf` 的生命周期必须绑定，且「读计数」与「据此决定独占」必须原子完成，否则两个线程可能同时误判独占。真实实现常用 `compare_exchange` 把「减计数并判定是否最后一个引用」做成单步原子操作。

## 五、与其他技术对比

| 维度 | 可变 COW 字符串 | 不可变字符串 | SSO | string_view / 切片 |
| --- | --- | --- | --- | --- |
| 赋值成本 | $O(1)$ | $O(1)$ | 小串 $O(n)$ | $O(1)$ |
| 写成本 | 共享时 $O(n)$ | 总是新建 | 可能栈内复制 | 不可写 |
| 并发安全 | 需原子计数 | 天然安全 | 视实现 | 只读安全 |
| 内存开销 | 缓冲 + 计数块 | 缓冲 + 头部 | 小串无额外分配 | 指针 + 长度 |
| 主要风险 | 计数竞争、迭代器失效 | 频繁分配 | 阈值调优 | 生命周期悬垂 |
| 典型语言 | 早期 libstdc++ | Go、Java、Rust | libstdc++/libc++ | C++17、Go、Rust |

## 六、常见误区

- **「COW 字符串总是更快」**：单线程下原子计数开销可观，多线程下可能成为缓存行争用点；读多写少才划算。
- **「切片一定要复制」**：只读视图（`string_view`、Go 切片、Rust `&str`）共享底层缓冲，只改视图。
- **「不可变就是 COW」**：不可变靠类型系统禁止写入，无需计数与写时检测；COW 仍允许写入，只是延迟复制。
- **「`const` 方法一定不会复制」**：COW 实现中返回内部引用的重载可能被迫提前 unshare，这也是它被弃用的原因之一。
- **「有引用计数就不用管生命周期」**：计数块与缓冲必须同生共死，漏减会让内存永不释放。

## 七、与开源书·权威来源对应

- **Stroustrup《The C++ Programming Language》**：`basic_string` 接口与实现约束，说明标准库为何放弃 COW 表示。
- **C++ 标准关于 `basic_string` 的要求**：迭代器/引用失效规则与「const 成员函数不得引入数据竞争」使 COW 实现不再合规，具体条款以官方最新标准文本为准。
- **Go 语言规范与官方博客**：字符串不可变、切片共享底层数组的语义。
- **《The Rust Programming Language》（Klabnik & Nichols）**：`String`、`&str`、`Arc<str>` 的所有权与共享模型。
- **Boehm, Atkinson & Plass 1995**：rope 结构把大文本插入/拼接从 $O(n)$ 降到 $O(\log n)$。
- **Sutter《Exceptional C++》系列**：讨论 COW 与引用计数在异常安全与并发下的陷阱。

## 八、面试题

**Q1：为什么 C++11 之后不允许 COW 版 `std::string`？**
要点：原子引用计数带来性能与竞争问题；`operator[]` 等返回内部引用的接口无法区分读引用与写引用，被迫提前复制；且与「const 成员函数可并发调用、不得引发数据竞争」的要求冲突。

**Q2：Go 的字符串为什么赋值很快？**
要点：字符串是不可变值类型（指针 + 长度），赋值只复制头部；切片共享底层数组，也不复制字节。

**Q3：COW 与 SSO 如何取舍？**
要点：SSO 让短串完全免分配，对配置键、标识符收益最大；COW 适合「大串、读多写少」。现代实现多选 SSO + 移动语义。

**Q4：`std::string_view` 的风险是什么？**
要点：它不持有所有权，源串被修改或释放后视图悬垂，必须严格保证源对象存活。

**Q5：为什么写时检测必须原子完成？**
要点：若「读计数」与「增减计数」不是同一步，两个线程可能同时判定为独占并原地写同一缓冲，形成数据竞争。

## 九、演进与趋势

- **SSO 成为默认**：主流 C++ 实现对短串栈内联，避免堆分配与计数开销。
- **只读视图普及**：`std::string_view`、Go 切片、Rust `&str` 让零拷贝传参成为常规做法，把复制决策交给调用者。
- **安全共享所有权**：Rust 的 `Arc<str>` 把引用计数与生命周期检查交给编译器。
- **大文本结构**：rope/piece table 在编辑器与协同文档中取代大串拼接，支持 $O(\log n)$ 插入与廉价快照。
- **不可变性优先**：语言设计趋势是用不可变 + 结构化共享替代运行时 COW，把复杂度从运行期转移到类型系统。

## 十、小结

用户态 COW 用引用计数把字符串复制推迟到首次写入，读多写少时收益明显；但原子计数、别名与迭代器失效让它逐渐被 SSO、移动语义与只读视图取代。理解这一演变的关键是分清三类机制：COW 是「延迟复制」，不可变是「禁止修改」，视图是「不拥有数据的引用」。
