# ConcurrentHashMap 核心源码要点（Java 8+）

> 板块：源码系列 　|　 返回：[README](README.md)
> 关联：[ThreadLocal与并发集合源码](../源码系列/ThreadLocal与并发集合源码.md)、[源码系列/README](README.md)、[JVM/README](../../基础知识/JVM/README.md)

ConcurrentHashMap（CHM）是 Java 并发编程中使用率最高的线程安全 Map。Java 8 对其做了彻底重写：摒弃了 Java 7 的 Segment 分段锁，改用 **CAS + synchronized + 细粒度锁 + 红黑树**。本文拆解结构、核心方法与并发设计。

## 一、整体结构（Java 8+）

```
ConcurrentHashMap
   └─ Node[] table  （数组，每个元素是一个桶 bucket）
        ├─ 桶为空 → CAS 插入头节点
        ├─ 桶为 Node（链表） → synchronized 锁头节点，尾插
        ├─ 桶为 TreeNode（红黑树） → 锁树根，插入后维持平衡
        └─ 桶为 ForwardingNode（扩容中标记） → 协助迁移
```

- **取消 Segment**：Java 8 把锁粒度降到"单个桶的头节点"，并发度 = 桶数量（默认 16 → 扩容后更大）。
- **链表转红黑树**：链表长度 ≥ 8 且 table 容量 ≥ 64 时转树（查找从 O(n) 降到 O(log n)）；树节点 ≤ 6 时退化回链表。
- 类似 HashMap 的结构，但所有写操作都对桶头加锁（synchronized），读操作基本无锁（volatile + CAS）。

## 二、关键字段

| 字段 | 作用 |
|------|------|
| `table` | 主数组（volatile Node[]） |
| `nextTable` | 扩容时的新数组 |
| `sizeCtl` | 控制状态：负数表示正在初始化/扩容，正数表示阈值 |
| `transferIndex` | 扩容时分配迁移的桶区间 |

> `sizeCtl` 是多语义字段：`-1` 初始化中，`-(1+线程数)` 扩容中，正数=扩容阈值（容量×0.75）。

## 三、put 流程（核心）

```java
final V putVal(K key, V value, boolean onlyIfAbsent) {
    if (key==null || value==null) throw new NPE();
    int hash = spread(key.hashCode());
    int binCount = 0;
    for (Node<K,V>[] tab = table;;) {
        Node<K,V> f; int n, i, fh;
        if (tab==null || (n=tab.length)==0) tab = initTable();   // 懒初始化
        else if ((f=tabAt(tab,i=(n-1)&hash))==null) {            // 桶空
            if (casTabAt(tab,i,null,new Node<>(hash,key,value)))
                break;                                          // CAS 成功直接插入
        }
        else if ((fh=f.hash)==MOVED) tab = helpTransfer(tab,f);  // 正在扩容，协助迁移
        else {                                                  // 桶非空
            V oldVal=null;
            synchronized (f) {                                   // 锁桶头节点
                if (tabAt(tab,i)==f) {
                    if (fh>=0) {                                // 链表
                        binCount=1;
                        for (Node<K,V> e=f;;++binCount){
                            if (e.hash==hash && eq(key,e.key)){ oldVal=e.val; if(!onlyIfAbsent) e.val=value; break;}
                            if ((e=e.next)==null){ e.next=new Node<>(hash,key,value); break;}
                        }
                    }
                    else if (f instanceof TreeBin) {             // 红黑树
                        Node<K,V> p; binCount=2;
                        if ((p=((TreeBin<K,V>)f).putTreeVal(hash,key,value))!=null){...}
                    }
                }
            }
            if (binCount>=TREEIFY_THRESHOLD-1) treeifyBin(tab,i); // 可能转树
        }
    }
    addCount(1L, binCount);                                     // 计数 + 可能扩容
    return null;
}
```

要点：
- **桶空**：CAS 无锁插入（高并发下最常见路径，最快）。
- **桶非空**：`synchronized(f)` 只锁当前桶头，不影响其他桶 → 高并发度。
- **扩容中**：当前线程顺手帮忙迁移（`helpTransfer`）→ 多核协作扩容。

## 四、get 流程（几乎无锁）

```java
public V get(Object key) {
    Node<K,V>[] tab; Node<K,V> e,p; int n,eh; K ek;
    int h = spread(key.hashCode());
    if ((tab=table)!=null && (n=tab.length)>0 &&
        (e=tabAt(tab,(n-1)&h))!=null) {
        if ((eh=e.hash)==h && ((ek=e.key)==key||(ek!=null&&key.equals(ek))))
            return e.val;                       // 头节点命中
        else if (eh<0)                          // 树/ForwardingNode
            return (p=e.find(h,key))!=null ? p.val : null;
        while ((e=e.next)!=null)                // 链表遍历
            if (e.hash==h && ((ek=e.key)==key||...)) return e.val;
    }
    return null;
}
```

- 读不加锁：靠 `volatile` 语义与 `tabAt`（volatile 读）保证可见性。
- 正在扩容时，节点可能是 ForwardingNode，`find` 会去 `nextTable` 查 → 读不阻塞。

## 五、扩容（transfer）

- 触发：元素数超 `sizeCtl` 阈值（容量×0.75）。
- **多线程协助**：扩容时把 table 分成若干区间，`transferIndex` 分配，多个 put 线程可同时迁移不同区间。
- 迁移：把旧桶的节点**按高位 split**到新表的两个位置（低位/高位），用 `ForwardingNode` 标记旧桶已迁移。
- 读线程遇到 ForwardingNode 自动去新表读，写线程顺手迁移 → 平滑扩容不卡顿。

## 六、size 计数（高并发）

- Java 8 用 **CounterCell 数组 + baseCount** 分段计数（类似 LongAdder），避免单一 AtomicLong 的竞争。
- `sumCount()` = baseCount + Σ CounterCell.value。
- 是高并发下 `size()` 的近似（但很接近真实值）。

## 七、与 Java 7 Segment 对比

| 维度 | Java 7 Segment | Java 8+ |
|------|---------------|--------|
| 锁粒度 | Segment（默认 16） | 单个桶头 |
| 结构 | Segment[] → HashEntry[] | Node[]（链表/树） |
| 并发度 | ≤ 16 | = 桶数（可扩容） |
| 读 | volatile 读 | volatile 读（更优） |

> Java 8 的改动使并发度大幅提升，且实现更简洁。

## 八、常见误区

1. **CHM 完全无锁** → 写仍有 synchronized（锁桶头），只是粒度极细。
2. **size() 精确** → 高并发下是近似（分段计数），需精确用 `mappingCount()` 也近似。
3. **迭代器强一致** → CHM 迭代器是**弱一致**（反映迭代开始到结束间的状态，可能不反映最新），不抛 ConcurrentModificationException。
4. **key/value 可为 null** → 不允许（会 NPE），区别于 HashMap。
5. **当作全局锁用** → 复合操作（如 `if(!contains) put`）非原子，需 `computeIfAbsent` 等原子方法。
6. **computeIfAbsent 嵌套死锁风险** → 不要在一个 computeIfAbsent 里再对该 map 做计算（可能递归锁）。

## 九、最佳实践

- 高并发 KV 缓存/计数首选 CHM。
- 需要原子复合操作 → 用 `compute` / `computeIfAbsent` / `putIfAbsent` 而非手动判断。
- 不要存 null 值；需要"可空"用 Optional 或特殊标记。
- 大数据量注意扩容成本（虽有多线程协助，但初始容量设合理可减少扩容次数）。

## 十、延伸阅读

- [ThreadLocal与并发集合源码](../源码系列/ThreadLocal与并发集合源码.md)
- [源码系列/README](README.md)
- [并发与JUC面试精讲](../../面试备战/并发与JUC面试精讲.md)
- [基础知识/JVM/README](../../基础知识/JVM/README.md)
