# undo日志与事务回滚

> 对应 Mohan et al. 1992（ARIES undo/rollback），以及 Silberschatz《Database System Concepts》第 17 章。

## 一、背景与挑战
事务执行中可能因显式 ROLLBACK 或崩溃而中止，必须把其已做的部分修改撤销，使数据库回到事务开始前的一致状态（原子性）。

## 二、核心原理
undo 日志记录“前像（旧值）”与事务 ID。回滚时按 LSN 逆序（从最新到最旧）读取该事务的日志记录，用前像把页还原，并写一条补偿记录（CLR）防止重做阶段再次重放被撤销的操作。

## 三、形式化与数学基础
回滚逆序：
$$ \text{undo } T: \text{ for } LSN = LSN_{last}(T) \ \text{downto} \ LSN_{first}(T) $$
原子性保证：
$$ \text{either all of } T \text{ visible, or none} $$
CLR（补偿日志记录）标记为已撤销，避免恢复时重复 redo。

## 四、代码实现
```c
// 事务回滚（仅示意）
void rollback(txn_t t) {
    lsn_t l = last_lsn_of(t);
    while (l != INVALID) {
        log_entry* e = read_log(l);
        page_restore(e->page_id, e->offset, e->before_image); // 用前像还原
        write_clr(t, e->lsn);                                  // 补偿记录
        l = e->prev_lsn;                                       // 逆序
    }
}
```

## 五、与其他技术对比
undo 实现原子性，redo 实现持久性；逻辑 undo（记录反向操作）适合跨页/索引，物理 undo（前像）简单但受结构约束。

## 六、常见误区
1) 认为回滚只需删日志——还须还原页并写 CLR。
2) 误以为 undo 在提交后发生——仅中止/崩溃时。
3) 长事务 undo 拖垮恢复却无预期。

## 七、与开源书/权威来源对应
- Mohan et al. 1992（ARIES undo/CLR）。
- Silberschatz《Database System Concepts》第 17 章。
- cmu-db/15445-course（recovery）。

## 八、面试题
1) 为什么 undo 要逆序？
2) 什么是 CLR，作用？
3) 逻辑 undo 与物理 undo 区别？

## 九、演进与趋势
多版本 undo（MVCC 配合）、undo 表空间独立管理、在线 undo 截断减少膨胀。

## 十、小结
undo 用“前像 + 逆序还原 + CLR”保证事务原子性，是回滚与崩溃后清理未提交修改的核心机制。
