# ARIES算法

> 对应 Mohan et al. ARIES (ACM TODS 1992)，以及 Silberschatz《Database System Concepts》17.5。

## 一、背景与挑战
早期恢复算法或需全页写、或不支持模糊检查点、或不可重复执行。ARIES 用细粒度日志 + 三阶段恢复 + 重复历史（repeat history）解决这些问题。

## 二、核心原理
ARIES 三阶段：Analysis（确定活跃事务与脏页）、Redo（重复历史，重放所有修改）、Undo（回滚夭折事务）。核心思想：重复历史——先重做到崩溃前原样，再撤销未提交者。日志含 undo/redo 信息，页头存 pageLSN 防重复重做。

## 三、形式化 / 数学基础
每条记录：`<LSN, transID, prevLSN, type, pageID, old, new>`。CLR（Compensation Log Record）记录撤销动作，type=undo，含 undoNextLSN 指向下一条待撤销。恢复幂等：redo 仅当 `rec.lsn > pageLSN`。

## 四、代码实现
```python
def aries_recover(log):
    txns, dirty = analysis(log)
    redo(log, dirty)                       # 重复历史
    for t in txns if not committed(t):
        lsn = t.lastLSN
        while lsn:
            rec = log[lsn]
            apply(rec.old); log_clr(rec)   # 撤销并记 CLR
            lsn = rec.undoNextLSN
```

## 五、与其他技术对比
| 特性 | ARIES | 影子分页 |
|------|-------|----------|
| 日志粒度 | 细（物理/逻辑） | 无 |
| 模糊检查点 | 支持 | 不支持 |
| 重复执行 | 幂等 | 不需要 |

## 六、常见误区
1. ARIES 不重复历史——恰恰相反。
2. 撤销不写日志——错，用 CLR。
3. 必须全页日志——ARIES 用 pageLSN 避免。

## 七、与开源书 / 权威来源对应
- ARIES 论文 Mohan et al. 1992 (ACM TODS 17(1)).
- Silberschatz《Database System Concepts》17.5.
- CMU 15-445 ARIES: https://github.com/cmu-db/15445-course

## 八、面试题
1. ARIES 三阶段分别做什么？
2. 重复历史为何重要？
3. pageLSN 如何避免重复重做？

## 九、演进与趋势
ARIES 思想延伸到分布式（如 Spanner 的 Paxos 复制日志）、多版本（MV-ARIES）与 NVM 优化。

## 十、小结
ARIES 以细粒度日志、三阶段与幂等撤销成为工业级恢复标准，是现代数据库崩溃恢复的基石。
