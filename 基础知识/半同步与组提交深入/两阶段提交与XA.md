# 两阶段提交与XA

> 对应 Gray 等分布式事务经典 2PC 与 MySQL XA 支持，参考 Garcia-Molina 第19章。

## 一、背景与挑战
当单个事务需跨多个存储资源（如两个数据库、数据库+消息队列）保持原子，单机 ACID 不够，需要跨资源的协调协议——两阶段提交（2PC）。

## 二、核心原理
2PC 分准备（prepare）与提交（commit）两阶段：协调者询问所有参与者能否提交，全部 YES 才发 commit，否则发 rollback。XA 是 X/Open 定义的分布式事务标准接口，MySQL 以 `XA START/BEGIN/COMMIT` 暴露。隐患在于协调者单点与第二阶段阻塞（参与者等待协调者恢复）。

## 三、形式化与数学基础
安全性要求：
$$ \forall participants\; agree \Rightarrow commit,\; else\; rollback $$
2PC 阻塞窗口发生在协调者崩溃且参与者处于「已 prepare 未决」状态，需等待协调者恢复才能继续，牺牲可用性换一致性。

## 四、代码实现
```sql
XA START 'x1';
INSERT INTO a VALUES (1);
XA END 'x1';
XA PREPARE 'x1';     -- 阶段一
XA COMMIT 'x1';      -- 阶段二（两阶段间崩溃则阻塞待恢复）
```

## 五、与其他技术对比
现代系统倾向用更可用的协调（如 Raft + 确定性状态机）或最终一致 + 补偿（Saga）替代 2PC，以避免阻塞与单点。XA 仍用于强一致金融场景但部署谨慎。

## 六、常见误区
认为 XA 一定强一致无风险——协调者崩溃可致长时间阻塞。认为 2PC 不会丢数据——协调者日志丢失可能决议不明。

## 七、与开源书/权威来源对应
Garcia-Molina 19.2「Two-Phase Commit」；MySQL 官方「XA Transactions」文档。

## 八、面试题
问：2PC 缺点？答：协调者单点、第二阶段阻塞、性能差。问：XA 与内部 2PC 区别？答：XA 跨独立资源管理器，内部 2PC 协调 binlog/redo 同进程内。

## 九、演进与趋势
TCC、Saga、确定性数据库（如 Calvin 类）以不同权衡替代传统 2PC，云原生下更流行。

## 十、小结
2PC/XA 提供跨资源原子性，但代价是阻塞与单点，需在强一致需求下审慎使用。
