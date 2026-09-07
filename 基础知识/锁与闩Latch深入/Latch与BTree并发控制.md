# Latch与BTree并发控制

> 对应 cmu-db/15445-course（B+ Tree latching / concurrency lecture），以及 Garcia-Molina《Database Systems: The Complete Book》第 15 章。

## 一、背景与挑战
Latch（闩锁）是线程级短期互斥原语（不同于事务级 Lock）。B+ 树在并发插入/查找时，若不加 latch 会导致节点分裂/合并时结构不一致或读到半更新节点。

## 二、核心原理
采用锁存协议（如 crabbing/latch coupling）：从根向下查找时，先获得子节点 latch 再释放父节点（下行耦合）；修改时依需升级为写 latch。分裂时短暂持有父子写 latch，保证他人不进入不一致子树。读不加事务锁、用 latch 保证物理一致。

## 三、形式化与数学基础
Latch 与 Lock 区别：
$$ Latch: \text{线程级, 短期, 保护内存结构};\quad Lock: \text{事务级, 长期, 保护逻辑数据} $$
Latch coupling 下行：
$$ acquire(child);\ release(parent) $$
保证同一时刻不被看到“正在分裂”的中间态。

## 四、代码实现
```c
// B+树下行 latch coupling（仅示意）
void* search(Node* n, Key k) {
    latch(n, READ);
    while (!n->is_leaf) {
        Node* c = n->child_for(k);
        latch(c, READ);
        unlatch(n);          // 获得子后再放父（耦合）
        n = c;
    }
    return n;
}
```

## 五、与其他技术对比
Latch 极短持有、不写日志、崩溃不需恢复；Lock 跨事务、需日志与恢复。Bw-tree 等用无锁 CAS 取代 latch 提升并发。

## 六、常见误区
1) 混淆 latch 与 lock——层级与生命周期完全不同。
2) 持有 latch 做 IO——会导致严重阻塞。
3) 下行未耦合导致读到分裂中间态。

## 七、与开源书/权威来源对应
- cmu-db/15445-course（B+ Tree latching）。
- Garcia-Molina《Database Systems: The Complete Book》第 15 章。
- Vonng/ddia 第 3 章。

## 八、面试题
1) Latch 与 Lock 区别？
2) 什么是 latch coupling？
3) 为什么不能在 latch 保护下做 IO？

## 九、演进与趋势
无锁 Bw-tree、乐观 latch、NUMA 感知 latch 设计。

## 十、小结
Latch 保护内存结构的短期互斥，B+ 树靠 latch coupling 在并发下保持物理一致，是存储引擎并发的底层基石。
