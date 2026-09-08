# 顺序锁seqlock设计

> 对应 Linux 内核 Documentation 与 Tanenbaum《Modern Operating Systems》。

## 一、背景与挑战
当写极罕见而读极频繁，且读者不愿被写阻塞时，需要一种写优先且读者无锁的机制。seqlock 让写者独占但读者仅检查序列号决定是否重试。

## 二、核心原理
维护一个序列号，写者进入时加一（变奇数），退出时再加一（变偶数）。读者读前取序列号，读后再次取，若两次相等且为偶数则数据一致；否则重试。读者永远不等写者，写者也不必等读者（读者自行重试）。

## 三、形式化与数学基础
设序列 $S$。写者：

$$ S \gets S+1;\; \text{critical};\; S \gets S+1 $$

读者：

$$ s_1 = S;\; \text{read};\; s_2 = S;\; \text{valid} \iff (s_1 = s_2 \land (s_1 \bmod 2 = 0)) $$

不一致时重读，直到 valid。

## 四、代码实现
seqlock 读侧：

```c
unsigned seq;
do {
    seq = READ_ONCE(sl->seq);
    if (seq & 1) continue;            // 正在写
    barrier();
    copy = shared_data;               // 读受保护数据
    barrier();
} while (seq != READ_ONCE(sl->seq));
```

写侧：

```c
sl->seq++;
shared_data = new_value;
sl->seq++;
```

## 五、与其他技术对比
rwlock 读者间并发但写者可能被读阻塞；seqlock 写者从不被读阻塞、读者无锁但可能重试且只能保护「小且不指针失效」的数据；RCU 读侧更平滑但更新更复杂。

## 六、常见误区
认为 seqlock 保护任意结构，实际数据在重试间必须保持指针稳定；认为读者零成本，重试会重复读；忽略内存屏障保证顺序。

## 七、与开源书/权威来源对应
Linux 内核 seqlock.h 与 Documentation/；Tanenbaum《Modern Operating Systems》讨论读者写者变种；OSTEP 给出无锁直觉。

## 八、面试题
seqlock 如何判断数据一致；写者会被读阻塞吗；适用条件；为何要求数据小。

## 九、演进与趋势
seqcount 用于单写者场景去除写锁开销；与 RCU 组合覆盖更多读写模式。

## 十、小结
seqlock 用序列号让写者永不等待读者、读者仅通过校验重试获得一致视图，适合极不对称的读写负载。
