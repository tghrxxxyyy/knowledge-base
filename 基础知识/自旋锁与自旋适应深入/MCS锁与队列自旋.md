# MCS锁与队列自旋

> 对应 Hennessy & Patterson《Computer Architecture》。

## 一、背景与挑战
在高度竞争的锁上，多个 CPU 自旋在同一锁变量会引发严重的缓存行无效化风暴。MCS（Mellor-Crummey & Scott）锁让每个等待者自旋在自己的本地节点上，只在被前驱释放时收到通知。

## 二、核心原理
每个想加锁的线程准备一个队列节点，原子地把节点链入锁的尾部。仅队首线程自旋在锁变量上；其余线程自旋在自己节点的 next 与 locked 字段。释放时把后继节点的 locked 清零，唤醒它。这样每次释放只无效化一个缓存行。

## 三、形式化与数学基础
队列为链表 $Q = n_1 \to n_2 \to \cdots \to n_k$。加锁把 $n$ 接在尾：

$$ Q \gets Q \oplus n $$

释放唤醒后继：

$$ n_i.\text{locked} = \text{false} \implies n_{i+1} \text{ 开始执行} $$

等待者只观察自身节点，故缓存行私有。

## 四、代码实现
MCS 锁核心：

```c
typedef struct mcs_node {
    struct mcs_node *next;
    volatile int locked;
} mcs_node_t;

void mcs_lock(mcs_node_t **lock, mcs_node_t *node) {
    node->next = NULL; node->locked = 1;
    mcs_node_t *pred = __atomic_exchange_n(lock, node, __ATOMIC_ACQ_REL);
    if (pred) {
        pred->next = node;
        while (node->locked) cpu_relax();
    }
}
void mcs_unlock(mcs_node_t **lock, mcs_node_t *node) {
    if (!node->next) {
        mcs_node_t *old = node;
        if (__atomic_compare_exchange_n(lock, &old, NULL, 1,
                __ATOMIC_ACQ_REL, __ATOMIC_RELAXED)) return;
        while (!node->next) cpu_relax();
    }
    node->next->locked = 0;
}
```

## 五、与其他技术对比
MCS 把缓存竞争降到每节点一次，优于票号锁的全局 owner 广播；代价是需要每线程节点内存与更复杂的 CAS。Linux qspinlock 借鉴 MCS 思想但以紧凑编码减少内存。

## 六、常见误区
认为 MCS 无缓存开销，入队出队仍有原子操作；认为节点可复用不必每锁独立，释放前不能释放节点内存；忽略空队列的 CAS 竞争。

## 七、与开源书/权威来源对应
Hennessy & Patterson《Computer Architecture》第 5 章给出 MCS 原始描述；Lamport 1978 讨论分布式互斥；Linux qspinlock 是其工程化实现。

## 八、面试题
MCS 为何缓存友好；节点内存生命周期；与票号锁的差别；为何需要 CAS。

## 九、演进与趋势
qspinlock 把 MCS 队列压缩进少量字，兼顾内存与性能；NUMA 感知排队锁进一步按节点分组。

## 十、小结
MCS 锁用每线程本地节点构造等待队列，使每个等待者只自旋在自己的缓存行上，从根本上削减了高竞争下的缓存行无效化，是扩展性强锁的典范。
