# WAL归档与PITR原理

> 对应 Mohan et al. 1992（WAL 持久性），以及 Vonng/ddia（WAL 归档与时间点恢复运维）。

## 一、背景与挑战
仅定期全量备份无法恢复到“故障前任意时刻”。PITR（Point-In-Time Recovery）借助持续归档的 WAL，把数据库前滚到指定时间点，实现细粒度恢复。

## 二、核心原理
流程：先做基础备份（base backup），之后持续把产生的 WAL 段归档到可靠存储（archive_command）。恢复时：还原基础备份 → 重放 WAL 直到目标时间点（recovery_target_time）→ 停止重放并打开。WAL 顺序重放保证一致性。

## 三、形式化与数学基础
恢复目标时间 $t^*$，重放条件：
$$ \forall WAL\ record\ r:\ LSN(r).time \le t^* \implies apply(r) $$
RPO 可趋近于 WAL 归档延迟：
$$ RPO \approx latency_{archive} $$
重放顺序不变式：
$$ apply\ in\ strictly\ increasing\ LSN $$

## 四、代码实现
```bash
# 仅示意：归档命令与恢复目标（非 Python 逻辑）
# 归档单段 WAL 到对象存储
archive_command = "cp %p /archive/%f"
# 恢复配置目标时间点
recovery_target_time = "2026-09-07 14:30:00"
```

## 五、与其他技术对比
PITR 比纯全量更细、比逻辑 dump 更连贯；相比流复制（提供高可用）PITR 用于“回放历史”，二者常配合。

## 六、常见误区
1) 认为有全量即可 PITR——缺 WAL 归档不行。
2) 归档失败未告警——恢复链断裂。
3) 误把 recovery_target 设错导致数据少恢复。

## 七、与开源书/权威来源对应
- Mohan et al. 1992（WAL）。
- Vonng/ddia（WAL 归档/PITR）。
- Kleppmann《Designing Data-Intensive Applications》第 5 章。

## 八、面试题
1) PITR 为什么依赖 WAL 归档？
2) 基础备份 + WAL 如何恢复？
3) RPO 受什么限制？

## 九、演进与趋势
连续 WAL 到云、增量永久备份、跨云归档容灾。

## 十、小结
PITR = 基础备份 + 持续 WAL 归档 + 顺序重放；其恢复精度由归档完整性决定。
