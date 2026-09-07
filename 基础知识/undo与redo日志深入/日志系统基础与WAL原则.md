# 日志系统基础与WAL原则

> 对应 Mohan et al. 1992, *ARIES: A Transaction Recovery Method*（WAL 原则），以及 Gray 1978, *Notes on Data Base Operating Systems*（2PC/恢复基础）。

## 一、背景与挑战
数据库必须在崩溃后保证 ACID：已提交事务不丢、未提交事务不可见。纯“脏页定时刷盘”无法避免部分写与丢失提交，需要日志作为“事实来源”。

## 二、核心原理
WAL（Write-Ahead Logging）：任何对页的修改必须先以日志记录形式顺序写入稳定存储，且提交前日志须落盘（force-log-at-commit）。日志记录含 LSN、事务 ID、页 ID、前像（undo）、后像（redo）。恢复分分析、redo、undo 三阶段。

## 三、形式化与数学基础
WAL 不变式：
$$ \text{Dirty page } P \text{ 刷盘前，其全部 } LSN \le \text{PageLSN} \text{ 的日志已落盘} $$
LSN 全序：
$$ LSN_a < LSN_b \implies \text{操作 } a \text{ 先发生} $$
提交持久性条件：
$$ \text{Commit 返回 } \implies \text{commit 记录已 fsync} $$

## 四、代码实现
```c
// 修改页前写日志（仅示意）
void page_modify(Page* p, txn_t t, int offset, val_t old, val_t new) {
    lsn_t lsn = log_insert(t, p->id, offset, old, new);  // 先写日志
    p->data[offset] = new;                              // 再改内存
    p->page_lsn = lsn;                                  // 更新页 LSN
    p->dirty = 1;
}
```

## 五、与其他技术对比
WAL 与 shadow paging：后者复制整页/页表避免原地改，恢复无需 redo/undo 但写放大大。WAL 只追加增量，更适合高并发写。

## 六、常见误区
1) 认为日志可不同步——commit 不 fsync 即不持久。
2) 误以为刷脏页前不需日志——会丢已提交事务。
3) 把 undo 日志与 redo 日志混为一谈。

## 七、与开源书/权威来源对应
- Mohan et al. 1992（ARIES）。
- Gray 1978（操作系统/恢复笔记）。
- cmu-db/15445-course（logging）。

## 八、面试题
1) 为什么 WAL 要先写日志？
2) PageLSN 的作用？
3) 崩溃后为何需 redo 又需 undo？

## 九、演进与趋势
逻辑日志、并行 redo（MTTR 优化）、日志即数据（WAL 直接用于复制）、io_uring 异步提交。

## 十、小结
WAL 把“随机改页”的稳定性问题转化为“顺序写日志”的可恢复问题，是事务引擎的基石。
