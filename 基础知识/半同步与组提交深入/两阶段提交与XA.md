# 两阶段提交与XA

> 对应 Gray & Reuter《Transaction Processing: Concepts and Techniques》与 MySQL 官方 XA Transactions 文档。

## 一、背景与挑战

单机数据库靠 ACID 保证事务原子性，但当一次操作需要跨多个独立资源（两个数据库、数据库与消息队列、多个分片）时，单机的原子性不够用：一个资源提交成功、另一个失败，系统就处于不一致状态。

两阶段提交（2PC, Two-Phase Commit）是最经典的跨资源原子提交协议。它通过一个协调者（coordinator）统一指挥所有参与者（participant），力求「要么全提交、要么全回滚」。XA 是 X/Open 组织定义的分布式事务接口标准，把 2PC 的语义固化为一组编程接口，MySQL 以 `XA START/END/PREPARE/COMMIT` 暴露。

2PC 的代价是可用性与性能：协调者成为单点，第二阶段参与者可能长时间阻塞等待决议。

## 二、核心原理

2PC 分两个阶段：

- **阶段一（准备/投票）**：协调者向所有参与者发送 prepare，参与者执行事务但暂不提交，写入日志并锁定资源，回复 YES 或 NO；
- **阶段二（提交/回滚）**：若全部回复 YES，协调者写 commit 决议并通知所有参与者提交；只要有一个 NO 或超时，则通知全部回滚。

关键特性是「决议点」在协调者写下 commit 日志的那一刻：在此之前可回滚，之后必须提交。参与者在 prepare 后处于「不确定（in-doubt）」状态，若此时协调者崩溃，参与者只能阻塞等待协调者恢复——这正是 2PC 的阻塞窗口。

XA 把角色明确为：应用程序（AP）、资源管理器（RM，如数据库）、事务管理器（TM，协调者）。RM 提供 XA 接口，TM 负责协调。

## 三、形式化与数学基础

设参与者集合 $P$，每个参与者的投票为 $v_i \in \{\text{YES}, \text{NO}\}$。2PC 的安全性要求：

$$
\forall i \in P:\ v_i = \text{YES} \Rightarrow \text{commit},\qquad
\exists i \in P:\ v_i = \text{NO} \Rightarrow \text{rollback}
$$

即「全同意才提交，否则回滚」。原子性可写为所有参与者最终状态一致：

$$
\forall i, j \in P:\ \text{state}_i = \text{state}_j \in \{\text{committed}, \text{aborted}\}
$$

阻塞条件：参与者 $i$ 处于 prepared 且尚未收到决议，而协调者不可达：

$$
\text{prepared}(i) \land \lnot \text{reachable}(C) \Rightarrow \text{blocked}(i)
$$

此时 $i$ 既不能提交（不知决议）也不能回滚（可能其他人已提交），只能等待。这体现了经典权衡：

$$
\text{2PC 以可用性（Availability）换取一致性（Consistency）}
$$

## 四、代码实现

```sql
-- MySQL XA 事务：阶段一 prepare，阶段二 commit
XA START 'x1';
INSERT INTO account VALUES (1, 100);
UPDATE account SET balance = balance - 100 WHERE id = 2;
XA END 'x1';

XA PREPARE 'x1';     -- 阶段一：写入并锁定，进入 prepared 状态

-- 若此时协调者崩溃，事务处于 in-doubt，需人工或 TM 裁决
XA COMMIT 'x1';      -- 阶段二：提交

-- 查看未决的 XA 事务
-- XA RECOVER;

-- 异常路径：任一参与者 prepare 失败则整体回滚
-- XA ROLLBACK 'x1';
```

应用侧通常由事务管理器（TM）驱动这些语句，而非手工执行；关键是保证 `PREPARE` 之后与 `COMMIT` 之前的崩溃可被 `XA RECOVER` 发现并正确裁决。

## 五、与其他技术对比

| 方案 | 一致性模型 | 可用性 | 性能 | 典型场景 |
| --- | --- | --- | --- | --- |
| 2PC / XA | 强一致（原子提交） | 低（协调者单点、阻塞） | 差（两轮同步 + 锁） | 跨库强一致、金融 |
| Saga | 最终一致（补偿） | 高 | 较好 | 长流程、微服务 |
| TCC（Try-Confirm-Cancel） | 最终一致 | 高 | 中 | 业务级分布式事务 |
| Raft/Paxos 多数派 | 强一致 | 中高（需多数派） | 中 | 复制状态机、配置中心 |
| 本地消息表/事务消息 | 最终一致 | 高 | 好 | 数据库 + MQ |

## 六、常见误区

- **认为 XA 一定强一致无风险**：协调者崩溃可致长时间阻塞，可用性显著下降。
- **认为 2PC 不会丢数据**：协调者日志丢失可能使决议不明，需谨慎配置持久化。
- **忽略 in-doubt 处理**：未实现 `XA RECOVER` 与裁决流程，故障后事务永久悬挂。
- **把 prepare 当提交**：prepare 阶段事务尚未对外可见，仍需 commit 才生效。
- **在长事务中使用 XA**：持锁时间长，放大阻塞窗口，应尽量缩短事务。
- **以为 XA 能解决所有跨系统问题**：它只保证参与 RM 的原子提交，补偿逻辑仍需业务实现。

## 七、与开源书·权威来源对应

Gray & Reuter《Transaction Processing: Concepts and Techniques》系统论述 2PC 与原子提交协议；Garcia-Molina & Salem 1987 提出 Saga 作为长事务的补偿替代；MySQL 官方 XA Transactions 文档给出 `XA START/PREPARE/COMMIT/RECOVER` 的语法与限制；X/Open DTP 规范定义了 XA 接口的角色划分。具体语法与限制以 MySQL 官方最新文档为准。

## 八、面试题

- **问：2PC 的主要缺点？** 答：协调者单点、第二阶段阻塞、性能开销大。
- **问：XA 与数据库内部 2PC 的区别？** 答：XA 跨独立资源管理器，由外部 TM 协调；内部 2PC 在同一进程内协调 redo/binlog。
- **问：什么是 in-doubt 事务？** 答：参与者已 prepare 但未收到决议的事务，需等待协调者恢复后裁决。
- **问：什么时候不该用 2PC？** 答：高并发、长流程、对可用性敏感且可接受最终一致的场景，应改用 Saga 或 TCC。

## 九、演进与趋势

现代分布式系统更倾向「避开 2PC」：用 Raft/Paxos 做多数派复制，用 Saga/TCC 做业务补偿，用确定性数据库（如 Calvin 类）把一致性问题转化为预先确定的事务顺序。XA 仍用于必须强一致且参与者有限（如两个数据库）的场景，但部署时通常配合超时、重试与人工裁决流程。

## 十、小结

2PC/XA 提供跨资源原子性，代价是阻塞与单点，本质是「以可用性换一致性」。理解其决议点、in-doubt 状态与阻塞窗口，才能正确评估是否采用；在多数场景下，Saga、TCC 或共识复制往往是更可用的替代方案。
