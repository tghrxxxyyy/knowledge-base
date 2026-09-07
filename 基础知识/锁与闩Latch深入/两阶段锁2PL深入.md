# 两阶段锁2PL深入

> 对应 Gray 1978, *Notes on Data Base Operating Systems*（2PL 起源），以及 Silberschatz《Database System Concepts》第 16 章。

## 一、背景与挑战
并发事务若不加控制会产生丢失更新、脏读、不可重复读等异常。两阶段锁（2PL）通过“加锁阶段 + 解锁阶段”保证调度可串行化。

## 二、核心原理
事务分为两阶段：增长阶段只申请锁不放；收缩阶段只释放锁不申请。2PL 保证冲突可串行化（conflict serializable）。严格 2PL（Strict 2PL）要求写锁直到提交才释放，避免级联回滚；强 2PL 读写锁都到提交释放。

## 三、形式化与数学基础
串行化图（SG）无环 ⇔ 可串行化。2PL 确保所有合法调度对应的 SG 为前序（无环）。锁相容矩阵 $C$ 约束：
$$ C(S,S)=1,\ C(S,X)=0,\ C(X,X)=0 $$
严格 2PL 额外要求：
$$ \text{release}(X\_lock) \text{ 仅在 commit 后} $$

## 四、代码实现
```c
// 两阶段锁示意：增长/收缩阶段（仅示意）
void txn_2pl(Txn* t, LockMgr* lm) {
    // 增长阶段
    lm->acquire(t, rowA, X); lm->acquire(t, rowB, S);
    // ... 操作 ...
    commit(t);                 // 提交（严格2PL：此刻统一释放）
    lm->release_all(t);        // 收缩阶段
}
```

## 五、与其他技术对比
2PL 保证可串行但易冲突/死锁；MVCC 读写不阻塞但非严格串行（除非 SSI）；OCC 低冲突时优。2PL 是传统关系库基础。

## 六、常见误区
1) 认为 2PL 一定能避免死锁——它避免级联回滚而非死锁。
2) 误以为加锁即串行化——需两阶段。
3) 混淆严格与强 2PL。

## 七、与开源书/权威来源对应
- Gray 1978（2PL 起源）。
- Silberschatz《Database System Concepts》第 16 章。
- cmu-db/15445-course（locking）。

## 八、面试题
1) 2PL 两阶段指什么？
2) 严格 2PL 为何避免级联回滚？
3) 2PL 能避免死锁吗？

## 九、演进与趋势
多粒度 2PL、与 MVCC 混合、乐观 2PL、锁升级优化。

## 十、小结
2PL 以“先加后放”保证冲突可串行化，是锁并发的理论基础；严格 2PL 进一步避免级联回滚。
