# 2PC 与 Saga 对比

> 对应 Kleppmann《DDIA》第 9 章与 Garcia-Molina《Sagas》(1987)。

## 一、背景与挑战
2PC 与 Saga 都是“跨多步骤达成一致”的协议，但哲学相反：2PC 追求即时原子性(锁)，Saga 追求最终一致(补偿)。理解对比有助于选型。

## 二、核心原理
| 维度 | 2PC | Saga |
| 一致性 | 强(提交即一致) | 最终一致 |
| 隔离性 | 有(锁) | 无(需额外手段) |
| 阻塞 | 会(协调者故障) | 不阻塞(异步推进) |
| 适用 | 短事务、同技术栈 | 长事务、跨服务/微服务 |
| 回滚 | 自动 abort | 补偿事务(正向逆操作) |
| 资源占用 | 持锁至提交 | 锁很快释放，但中间态可见 |

## 三、形式化 / 数学基础
2PC 不变量：全局原子(commit/abort 一致)。
Saga 不变量：存在补偿序列使系统回到业务一致状态(最终一致)，但不保证中间无脏读。
隔离增强：Saga 可用“交换式更新(commutative updates)”“版本化”“语义锁”降低异常。

## 四、代码实现
```python
# 2PC 风格：一损俱损(锁)
coordinator_prepare(parts, tx)  # 锁资源直到 commit/abort
# Saga 风格：补偿
steps = [Step(A.reserve, A.cancel), Step(B.ship, B.unship)]
saga(steps)
```

## 五、与其他技术对比
- 2PC 简单语义但扩展性差；Saga 复杂编排但可扩展、非阻塞。
- 二者可组合：Saga 内部单步可用 2PC 保证该步原子。

## 六、常见误区
- 误区：Saga 比 2PC 弱所以不好。长事务里 Saga 的可用性与扩展性更优。
- 误区：2PC 能处理跨微服务。锁与协调者使其不适合长跨服务调用。

## 七、与开源书 / 权威来源对应
- Garcia-Molina & Salem《Sagas》(1987)。
- Kleppmann《DDIA》第 9 章。
- DDIA 中文: https://github.com/Vonng/ddia

## 八、面试题
1. 2PC 与 Saga 在隔离性上差异？
2. 什么场景选 2PC、什么选 Saga？
3. Saga 如何增强隔离性？

## 九、演进与趋势
混合架构：核心账务用 2PC/强一致，跨域业务流程用 Saga，辅以 CDC 保证可见性。

## 十、小结
2PC 与 Saga 代表“强一致锁 vs 最终一致补偿”两种范式；按事务时长、跨服务程度与一致性要求取舍，是现代分布式事务设计的核心决策。
