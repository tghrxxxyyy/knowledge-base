# redo日志与崩溃恢复

> 对应 Mohan et al. 1992（ARIES redo 阶段），以及 Garcia-Molina《Database Systems: The Complete Book》第 17 章。

## 一、背景与挑战
崩溃时内存脏页可能未落盘，已提交事务的修改丢失。redo 日志保存“后像”，用于把已提交事务的修改重做到数据页，保证持久性（Durability）。

## 二、核心原理
redo 日志记录修改前可重放的“新值”及 LSN。恢复时从最后一个检查点起，按 LSN 顺序重放所有日志记录（无论提交与否），把页恢复到崩溃前状态；因幂等（按 PageLSN 判断已应用则跳过），重复重放安全。

## 三、形式化与数学基础
redo 应用条件：
$$ \text{apply if } PageLSN < RecLSN $$
重放顺序保证：
$$ \forall \text{已提交 } T,\ \text{其所有修改最终在页上} $$
由于 LSN 全序，重复重放幂等：
$$ \text{redo}^n = \text{redo} $$

## 四、代码实现
```python
# 简化 redo 重放（仅示意）
def redo_replay(logs, pages):
    for rec in sorted(logs, key=lambda r: r.lsn):   # 按 LSN 升序
        p = pages[rec.page_id]
        if p.page_lsn < rec.lsn:                    # 尚未应用
            p.data[rec.offset] = rec.after_image
            p.page_lsn = rec.lsn
```

## 五、与其他技术对比
redo 保证已提交不丢；undo 撤销未完成；二者配合实现 ACID。仅 undo 无 redo 会丢提交，仅 redo 无 undo 会残留未提交。

## 六、常见误区
1) 认为 redo 只重放已提交——实际重放全部，靠 undo 回退未提交。
2) 担心重放两次出错——PageLSN 保证幂等。
3) 误以为 checkpoint 之后无需 redo——仍需重放其后日志。

## 七、与开源书/权威来源对应
- Mohan et al. 1992（ARIES）。
- Garcia-Molina《Database Systems: The Complete Book》第 17 章。
- cmu-db/15445-course（recovery）。

## 八、面试题
1) 为什么 redo 重放所有记录而非仅已提交？
2) PageLSN 如何保证幂等？
3) checkpoint 对 redo 起什么作用？

## 九、演进与趋势
并行 redo、增量 checkpoint、SSD 上批量重放、redo 与复制日志合一。

## 十、小结
redo 用“后像 + LSN 全序 + 幂等重放”把已提交事务完整恢复，是崩溃后数据不丢的关键。
