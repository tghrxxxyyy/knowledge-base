# Sagas模式

> 对应 Garcia-Molina & Salem 1987 Sagas 论文，以及 DDIA 中文第 9 章 Workflow + 补偿。

## 一、背景与挑战
长事务（跨多个服务、耗时久）用 2PC 会长期持锁、可用性差。Saga 把大事务拆成一系列本地事务，用补偿操作在失败时回滚已完成步骤。

## 二、核心原理
Saga = 有序本地事务 $T_1, T_2, \dots, T_n$，每步有对应补偿 $C_i$（语义反向，如扣款补偿为退款）。任一 $T_k$ 失败则反向执行 $C_{k-1}, \dots, C_1$。无隔离保证，可能出现脏读（需额外对策）。

## 三、形式化 / 数学基础
执行序列成功：$T_1 T_2 \dots T_n$。失败于 $k$：$T_1\dots T_k C_{k-1}\dots C_1$。补偿不保证严格可交换，需业务设计幂等。$T_i$ 与 $C_i$ 各自是本地 ACID 事务。

## 四、代码实现
```python
steps = [("扣库存", undo_stock), ("扣款", refund), ("发单", cancel_order)]
done = []
for name, comp in steps:
    run_local(name)
    done.append(comp)
# 失败回滚
for comp in reversed(done):
    comp()
```

## 五、与其他技术对比
| 方案 | 隔离 | 锁 | 适用 |
|------|------|----|------|
| 2PC | 强 | 长 | 短事务 |
| Saga | 弱 | 无 | 长流程 |

## 六、常见误区
1. Saga 有隔离——默认没有，需对策（如语义锁）。
2. 补偿=反向 SQL——应是业务语义（退款非简单 UPDATE）。
3. Saga 可替代 2PC——语义不同，不保证读隔离。

## 七、与开源书 / 权威来源对应
- Garcia-Molina & Salem 1987 Sagas.
- DDIA 中文第 9 章: https://github.com/Vonng/ddia
- CS-Notes 分布式: https://github.com/CyC2018/CS-Notes

## 八、面试题
1. Saga 与 2PC 区别？
2. 补偿操作设计要点？
3. Saga 的隔离问题怎么缓解？

## 九、演进与趋势
编排（Orchestration，如 Temporal、Cadence）与协同（Choreography，事件驱动）成为 Saga 主流实现框架。

## 十、小结
Saga 用本地事务 + 补偿应对长流程，牺牲隔离换取可用性与无长锁，是微服务事务常用模式。
