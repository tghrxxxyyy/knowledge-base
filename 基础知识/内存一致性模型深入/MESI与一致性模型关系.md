# MESI 与一致性模型关系

> 对应 Hennessy & Patterson《Computer Architecture: A Quantitative Approach》缓存与一致性章节，以及 Intel SDM 卷 3 对多核缓存行为的描述。

## 一、背景与挑战

多核共享内存需要两类保证，而它们常被混为一谈。第一类是缓存一致性（cache coherence）：同一地址的多个缓存副本必须对外表现为「单一变量的正确读写」，即单写多读（SWMR）与数据值不变量。第二类是内存一致性模型（memory consistency model）：不同地址的访问顺序在核间如何可见，例如「写 A 再写 B，其他核能不能先看到 B 再看到 A」。

MESI 属于第一类，它解决的是「同一行的副本如何维护」；内存模型属于第二类，它解决的是「跨地址的顺序如何约束」。MESI 是内存模型得以成立的物理基础——没有单地址的写串行化，任何跨地址的顺序讨论都失去意义。反过来，MESI 并不隐含任何强内存模型：即使单地址完全一致，多地址之间仍可任意重排。

## 二、核心原理

MESI 的四个状态及其含义：

- M（Modified）：本缓存持有唯一副本且已修改，内存中的值过期，需在替换时写回。
- E（Exclusive）：本缓存持有唯一副本，与内存一致，可静默升级为 M 而不发总线事务。
- S（Shared）：可能多个缓存持有，与内存一致，写前必须取得独占。
- I（Invalid）：本副本无效。

关键不变式：任一地址最多存在一个 M 或 E 副本；S 副本可多个；所有处于 M 之外的有效副本内容与内存一致（或在写回后一致）。

典型事务：读缺失（I→S 或 I→E）触发 BusRd，若其他缓存有 M 副本则先写回（或直接转发）；写缺失触发 BusRdX（读独占），要求所有共享者失效并回送确认；本地写命中 S 时先升级为 M，必须广播 Invalidate。

扩展变体：

- MESIF：引入 F（Forward）态，指定一个共享副本负责响应读请求，避免多个 S 副本争相转发导致链路拥塞（Intel 常用）。
- MOESI：引入 O（Owned）态，允许某缓存持有脏数据并对外提供读转发，同时内存中留有可读的旧值由该缓存负责更新，减少写回频率（AMD 常用）。
- 目录协议与 MESI 的关系：状态语义完全相同，差别在「失效消息发给谁」——广播 vs 按 sharers 位图定向发送。

瞬态（transient state）是真实实现的关键：状态机在等待响应期间不能简单停留在稳定态，常用 IS/IM/SM 等过渡状态记录「已发出什么请求、在等谁的响应」，以防重复请求与丢失效应。同时每个缓存需要 MSHR（miss status holding register）合并同一行的多个在途缺失。

## 三、形式化与数学基础

MESI 的核心不变式（$\#M$ 表示 M 态副本数，$\#E$ 表示 E 态副本数）：

$$\#M(a) + \#E(a) \le 1, \qquad \forall a$$

$$\#M(a) = 1 \;\Rightarrow\; \text{内存值过期，需在替换或转发时写回}$$

写代价模型（按当前状态区分）：

$$Cost_{write}(s) = \begin{cases} 0, & s = M \\ 0, & s = E \text{（静默升级）} \\ BusRdX + Inv, & s = S \\ BusRdX + Inv + Miss, & s = I \end{cases}$$

一致性保证可归纳为两条可观察性质：其一，对每个地址存在唯一的写序（写串行化）；其二，若某核读到某地址的值，它读到的是该地址写序中「不晚于该读最近一次」的写。用形式化语言：

$$\forall a:\ \exists \prec_a \text{（写全序）}, \quad \forall r \text{ on } a:\ val(r) = last_{w \prec_a r}\{w\}$$

MESI 与内存模型的正交性可用「两个层级的关系」刻画：MESI 提供每地址的 $\prec_a$；内存模型规定这些 $\prec_a$ 之间如何组合成全局可见顺序。若模型为 SC，则所有 $\prec_a$ 必须被同一个全局序兼容地排列；若模型为 TSO，则允许「后读越过前写」，即允许 $\prec_a$ 之间出现仅涉及「写后读」的交叉。

伪共享的成本也可以量化。设两个变量位于同一行、被不同核高频写，则每次写都会使对方的副本失效。设写频率为 $f$、失效往返延迟为 $L_{inv}$，则有效吞吐退化近似为：

$$Throughput_{false\,share} \approx \frac{1}{L_{inv}} \quad \text{远低于各核独立写不同行的情形}$$

## 四、代码实现

```c
/* 简化 MESI 状态机（本地事件 + 总线事件） */
typedef enum { M, E, S, I, IS, IM } mesi_t;   /* IS/IM 为瞬态 */
typedef struct { mesi_t state; uint64_t tag; int data; } line_t;

void local_read(line_t *l) {
    switch (l->state) {
    case M: case E: case S: break;            /* 命中，直接返回 */
    case I:
        l->state = IS;                        /* 瞬态：已发 BusRd，等数据 */
        bus_read(l->tag);
        break;
    default: break;                           /* IS/IM：已有在途缺失，合并到 MSHR */
    }
}

void local_write(line_t *l) {
    switch (l->state) {
    case M: break;                            /* 已独占，直接写 */
    case E: l->state = M; break;              /* 静默升级，无需总线事务 */
    case S:
        l->state = IM;                        /* 瞬态：等失效确认 */
        bus_read_exclusive(l->tag);           /* BusRdX */
        break;
    case I:
        l->state = IM;
        bus_read_exclusive(l->tag);
        break;
    default: break;
    }
    l->data = newval;
}

/* 总线事件：其他核的读/写对本副本的影响 */
void on_bus_read(line_t *l, int *fwd_data) {
    if (l->state == M) {                      /* 有脏副本：写回或直接转发 */
        *fwd_data = l->data;                  /* cache-to-cache transfer */
        l->state  = S;                        /* 必须降级为 S */
    } else if (l->state == E) {
        l->state = S;                         /* 从独占降为共享 */
    }
}

void on_bus_read_exclusive(line_t *l) {
    if (l->state == M && l->dirty) writeback(l);   /* 脏数据先写回 */
    l->state = I;                                   /* 一律失效 */
}

void on_bus_invalidate(line_t *l) {
    if (l->state != I) {
        if (l->state == M) writeback(l);       /* 写回后再失效 */
        l->state = I;
    }
}
```

实现中必须注意三类边界情况：其一，瞬态状态下收到新的总线请求，需按协议规则「顺带转发」或 NACK 重试，否则会形成死锁；其二，转发（cache-to-cache）要求 home 或总线能明确指定转发者，否则多个 S 副本会重复响应；其三，M 态被降级时若内存值未更新，任何后续读都必须能拿到更新后的值，否则数据值不变量被破坏。

## 五、与其他技术对比

| 协议 | 状态数 | 关键优化 | 典型采用者 | 主要代价 |
| --- | --- | --- | --- | --- |
| MSI | 3 | 最小状态机 | 教学/早期设计 | 读缺失总是发总线事务 |
| MESI | 4 | E 态支持静默升级 | 通用多核 | 需要共享者跟踪 |
| MESIF | 5 | F 态指定转发者 | 部分 x86 实现 | 状态与探针逻辑更复杂 |
| MOESI | 5 | O 态支持脏转发 | 部分 AMD 实现 | 内存与缓存一致性维护复杂 |
| 目录协议 | 不限 | 定向失效，可扩展 | 大规模 CC-NUMA | 目录存储与间接延迟 |

## 六、常见误区

1. 认为 MESI 就是内存一致性：MESI 只保证单地址的副本一致，不约束跨地址的访问顺序。
2. 认为 I 态意味着数据丢失：M 态被失效时数据会先写回或转发，I 只是本副本无效。
3. 认为 E 态无关紧要：E 态允许静默写升级，是减少总线事务的关键优化，缺失它会把大量写变成总线写缺失。
4. 忽略瞬态状态：真实协议实现中的死锁与数据损坏大多源于瞬态处理不完整，而非稳态设计错误。
5. 认为伪共享只是性能问题：它会让本可并行的写序列退化为串行的失效往返，严重时可导致扩展性完全丧失。
6. 认为缓存行大小与协议无关：行越大，伪共享越严重但空间局部性越好，二者需要用填充（padding）与数据布局共同权衡。

## 七、与开源书·权威来源对应

- Hennessy & Patterson《Computer Architecture: A Quantitative Approach》：MESI 状态机、目录协议与一致性开销模型。
- Intel SDM 卷 3：多核缓存一致性行为与内存排序的实际描述。
- Patterson & Hennessy《Computer Organization and Design》：缓存与存储层次的入门表述。
- Silberschatz《Operating Systems Concepts》：共享内存与同步的系统视角。
- Herlihy & Shavit《The Art of Multiprocessor Programming》：从一致性到同步原语的构造。
- Bryant & O'Hallaron《CSAPP》：缓存行、局部性与伪共享的实测讨论。

## 八、面试题

1. 问：MESI 与内存模型（如 TSO）是什么关系？答：MESI 保证单地址的写串行化与副本一致，是内存模型的物理基础；TSO 在其之上规定跨地址的顺序，允许 StoreLoad 重排。
2. 问：E 态的价值是什么？答：允许本核在不出总线事务的情况下静默升级为 M，把「独占但未改」与「多副本共享」区分开，显著减少写缺失。
3. 问：为什么需要瞬态状态？答：等待失效确认或其他核响应期间，缓存既不能声明自己独占也不应重复发请求，瞬态状态精确记录「在等谁、等什么」，避免竞态与丢失效应。
4. 问：伪共享如何缓解？答：把不同核频繁写的变量分到不同缓存行（填充对齐），或改变数据布局使写集中在一个核上，必要时用核局部累加再合并。
5. 问：MOESI 的 O 态解决了什么？答：允许持脏数据的缓存对外提供读转发，同时不必立即写回，减少写回流量与内存带宽压力，代价是内存中值可能过期需要额外维护。

## 九、演进与趋势

- 与目录/探针过滤器结合：MESIF/MOESI 的转发优化被引入多插槽目录协议，用于减少跨 socket 延迟。
- 跨芯片一致性：CCIX/CXL 把 MESI 类状态机扩展到设备与内存池，引入偏置与反向失效机制。
- 分层一致性：簇内嗅探 + 簇间目录，按层次选择广播或定向，兼顾延迟与扩展性。
- 域限定与作用域：以作用域弱化一致性要求，减少不必要的失效与栅栏。
- 形式化验证工程化：MESI 及其扩展的状态机普遍使用模型检查与 litmus 测试验证，已成为处理器设计流程的标配。

## 十、小结

MESI 是内存一致性模型的物理承载：它以状态位与失效/转发消息维护单地址的单写多读不变式，为跨地址的顺序语义提供立足点。二者必须分开理解——MESI 管「一行数据的副本与归属」，内存模型管「多行访问的可见顺序」。理解 E/F/O 态的价值、瞬态状态的必要性、以及伪共享的量化代价，就理解了现代多核缓存子系统的核心权衡。
