# ACID语义

> 对应 Silberschatz《Database System Concepts》第 15 章 Transaction，以及 Kleppmann《Designing Data-Intensive Applications》第 7 章。

## 一、背景与挑战
并发执行多事务时，如何既提高吞吐又保证数据正确？ACID（原子性、一致性、隔离性、持久性）提供正确性契约，但各属性的实现机制差异巨大。

## 二、核心原理
原子性（A）由 undo 日志保证可回滚；一致性（C）由应用语义 + 约束保证；隔离性（I）由并发控制（锁/MVCC）保证；持久性（D）由 redo 日志与 fsync 保证。

## 三、形式化 / 数学基础
事务是状态转移函数 $T: S \to S$。ACID 要求：原子性 $\forall T, \text{committed}(T) \lor \text{aborted}(T)$；隔离性要求并发调度等价于某串行调度（冲突可串行化）。

## 四、代码实现
```sql
BEGIN;
UPDATE accounts SET bal = bal - 100 WHERE id = 1;
UPDATE accounts SET bal = bal + 100 WHERE id = 2;
COMMIT;   -- 全成功或全回滚
```

## 五、与其他技术对比
| 属性 | 机制 | 失败后果 |
|------|------|----------|
| A | undo 日志 | 部分写 |
| I | 锁/MVCC | 脏读/幻读 |
| D | redo + fsync | 丢失已提交 |

## 六、常见误区
1. 一致性由数据库自动保证——错，依赖约束与应用。
2. 隔离级别越高越安全——但吞吐下降。
3. 单机 ACID 等于分布式 ACID——需额外协议。

## 七、与开源书 / 权威来源对应
- Kleppmann《DDIA》第 7 章: https://github.com/Vonng/ddia
- Silberschatz《Database System Concepts》Chapter 15.
- CS-Notes 事务: https://github.com/CyC2018/CS-Notes

## 八、面试题
1. 四个字母分别由什么机制保证？
2. 一致性是谁的责任？
3. 为什么隔离性难做？

## 九、演进与趋势
从严格 ACID 到 BASE（最终一致）的谱系，NewSQL（Spanner、TiDB）在分布式下重新追求强一致。

## 十、小结
ACID 是正确性契约：A/D 靠日志，I 靠并发控制，C 靠约束与应用的共同维护。
