# 读写锁与RCU机制

> 对应 Tanenbaum《Modern Operating Systems》 / 《CSAPP》并发 / Linux RCU 文档。

## 一、背景与挑战
读多写少场景，互斥锁让并发读也串行化，浪费读并行性。读写锁允许多读单写，但写者饥饿与读临界区过长仍受限。

## 二、核心原理
读写锁(rwlock)维护读者计数，多读者可同时进入，写者需独占。RCU(Read-Copy-Update)让读者完全无锁遍历旧版本，写者复制新版本并等待宽限期(grace period)后回收，读侧零开销。

## 三、形式化与数学基础
读写锁吞吐近似与读者数 $R$ 成正比：
$$ T_{rw} \approx R \cdot t_{read} \quad (\text{无写时}) $$
RCU 读侧成本仅为一次指针解引用，与并发度无关：
$$ C_{read} = O(1) $$

## 四、代码实现
```c
// 读者无锁遍历，写者复制更新(Linux RCU 风格)
#include <atomic>
struct Node { int val; Node* next; };
std::atomic<Node*> head;
int read_sum() {
    int s=0; Node* p = head.load();   // 无锁读
    while (p) { s += p->val; p = p->next; }
    return s;
}
void update(int v) {
    Node* n = new Node{v, head.load()};  // 复制
    head.store(n);                       // 原子发布
}
```

## 五、与其他技术对比
读写锁读侧仍有原子计数开销与写者饥饿；RCU 读侧更轻但需宽限期回收与不可在临界区阻塞。seqlock 适合短小频繁读。

## 六、常见误区
RCU 写者不能就地改旧节点(读者在用)。宽限期未到回收会悬垂引用。误把 RCU 当通用锁替代。

## 七、与开源书/权威来源对应
Tanenbaum 同步；Linux Documentation RCU (paulmck)；OSTEP 并发案例。

## 八、面试题
RCU 读者为何无锁？宽限期含义？读写锁写者饥饿如何解？

## 九、演进与趋势
用户态 RCU(urcu)、QSBR 把宽限期探测交给线程 quiescent state； hazard pointer 替代回收。

## 十、小结
读多写少时，读写锁解除读串行，RCU 进一步把读成本降为常数，代价是延迟回收与复制。
