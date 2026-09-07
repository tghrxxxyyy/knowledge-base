# ARIES算法深入

> 对应 Mohan et al. 1992, *ARIES: A Transaction Recovery Method Supporting Fine-Granularity Locking and Partial Rollbacks*。

## 一、背景与挑战
早期恢复算法在细粒度锁、部分回滚、增量检查点上能力不足。ARIES 通过 LSN 链、CLR、模糊检查点，提供可正确、可部分回滚、可并行的高性能恢复。

## 二、核心原理
ARIES 三阶段：Analysis（确定哪些事务活跃、哪些页脏）、Redo（按 LSN 重放，恢复到崩溃前）、Undo（逆序回滚未提交事务，并写 CLR）。脏页表（DPT）与事务表（TT）由检查点持久化，重启从检查点开始而非日志头。

## 三、形式化与数学基础
LSN 链：
$$ \text{PageLSN} \to \text{PrevLSN (同一事务上一条)} $$
恢复正确性基于：
$$ \text{Redo 使状态 } \ge \text{崩溃点；Undo 删除未提交} $$
模糊检查点允许写进行时打点：
$$ \text{checkpoint 不阻塞前台更新} $$

## 四、代码实现
```python
# ARIES 三阶段骨架（仅示意）
def aries_recover(log):
    tt, dpt = analysis(log)            # 分析：活跃事务与脏页
    redo_phase(log, dpt)              # 重放至崩溃前
    for t in tt.active:               # 逆序 undo 未提交
        undo_txn(t, log)
```

## 五、与其他技术对比
早期算法常需全量 redo 或单级回滚；ARIES 的模糊检查点 + CLR 支持部分回滚与增量恢复，被 DB2、MySQL/InnoDB、PostgreSQL 等广泛借鉴。

## 六、常见误区
1) 认为 ARIES 必须从重头重放——从检查点起。
2) 忽略 CLR 导致被撤销操作再次重做。
3) 误以为 undo 不写日志——ARIES 写 CLR。

## 七、与开源书/权威来源对应
- Mohan et al. 1992（ARIES 原论文）。
- Garcia-Molina《Database Systems: The Complete Book》第 17 章。
- cmu-db/15445-course（ARIES lecture）。

## 八、面试题
1) ARIES 三阶段各自目的？
2) 模糊检查点为什么“模糊”？
3) CLR 如何支持部分回滚？

## 九、演进与趋势
并行 redo、ARIES 在分布式/NewSQL 的变体、日志结构存储与 ARIES 融合。

## 十、小结
ARIES 以 LSN 全序、CLR、模糊检查点，系统化解决“崩溃后一致性”，是现代恢复算法的理论内核。
