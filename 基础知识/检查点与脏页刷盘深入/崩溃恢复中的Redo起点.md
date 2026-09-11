# 崩溃恢复中的Redo起点

> 对应 Mohan 1992 ARIES 的 Redo 阶段与「重复历史」原则，参考 Silberschatz 第17章。

## 一、背景与挑战

崩溃后数据库可能处于「已提交事务的修改尚未刷盘、未提交事务的部分修改已落盘」的混合状态。必须找到一个安全的 Redo 起点：从此处开始重放日志，既不多做（浪费）也不少做（丢已提交数据），保证「已提交不丢、未提交可回滚」。起点选错——过早会重放已刷盘页（无害但慢），过晚会漏掉未刷盘的已提交修改（数据丢失）。

挑战在于：崩溃瞬间缓冲池状态未知，哪些脏页已刷盘、哪些没有无从直接得知，只能靠日志与检查点中的元数据推断。这正是 ARIES「重复历史（repeat history）」原则要解决的。

## 二、核心原理

ARIES 采用「重复历史」：从最后一个检查点开始重放所有日志记录（无论事务是否已提交），把数据库精确恢复到崩溃前瞬间，再对未提交事务做 Undo。Redo 起点不是「最后一个已提交事务」，而是检查点记录中最早脏页的 LSN，记为 `redo_lsn`——因为此 LSN 之前的修改必然已随检查点前面的刷盘而持久，无需重放。

恢复分三阶段：Analysis（确定 redo_lsn 与活跃事务集合）、Redo（从 redo_lsn 重放所有记录，幂等）、Undo（对未提交事务逆序回滚）。Redo 是幂等的——用「页 LSN」比对，若页已含该修改则跳过，故「多放」无害。

之所以「多放无害」，是因为每条日志记录都带页 LSN，重放前比对目标页当前 LSN：若页已应用过该修改（或更新版本）则跳过。这样即使 redo_lsn 选得过早，也只是多做无效工作而不破坏正确性。Undo 则相反必须精确——只对 Analysis 阶段确定的未提交事务、按 LSN 逆序回滚，已提交事务绝不回滚。

## 三、形式化与数学基础

设检查点时刻脏页集 $D_c$，每张脏页 $p$ 首次变脏的 LSN 为 $\mathrm{LSN}(p)$，则：

$$ LSN_{\mathrm{redo}} = \min\{ \mathrm{LSN}(p) \mid p \in D_c \} $$

重放区间为 $[LSN_{\mathrm{redo}}, LSN_{\mathrm{end}}]$。对每条日志记录 $r$，若目标页当前 LSN $\ge r.\mathrm{LSN}$ 则跳过（已应用），否则重放。Undo 区间针对 Analysis 确定的活跃（未提交）事务，按 LSN 逆序回滚。整体保证 ACID：已提交修改必在 $[LSN_{\mathrm{redo}}, LSN_{\mathrm{end}}]$ 内被重放。

## 四、代码实现

```c
/* 伪代码：ARIES 恢复三阶段（以官方最新文档为准） */
void recovery() {
    analysis();   // 扫描日志，确定 redo_lsn 与活跃事务表
    redo();       // 从 redo_lsn 重放所有日志记录（幂等）
    undo();       // 对未提交事务逆序回滚
}

void redo() {
    for (r = log_at(redo_lsn); r != NULL; r = r.next) {
        page = buffer_fetch(r.page_id);
        if (page.lsn >= r.lsn) continue;   // 已应用则跳过（幂等）
        apply_record(page, r);             // 重放修改
        page.lsn = r.lsn;
    }
}

void undo() {
    foreach (txn in active_txns)           // 未提交事务
        for (r = last_record(txn); r != NULL; r = r.prev)
            apply_undo(page, r);           // 逆序回滚
}
```

## 五、与其他技术对比

| 系统 | 恢复思路 | 复杂度 |
|------|----------|--------|
| ARIES（原地更新） | 分析+Redo（重复历史）+Undo | 高但精细 |
| LSM-tree | 加载最新 manifest 指向的 SSTable | 低（不可变文件） |
| 物理日志为主 | 直接覆盖页 | 中 |

非 ARIES 系统（如 LSM）依赖 SSTable 不可变与 manifest，恢复即加载最新 manifest 指向的文件，逻辑更简单。ARIES 的精细 Redo/Undo 适合原地更新（B-tree）引擎，能精确处理「未提交已落盘」。

## 六、常见误区

误区一：Redo 只重做已提交事务——ARIES 先全重放（含未提交）再 Undo 未提交，逻辑等价于「重复历史」。误区二：检查点后日志可全删——需保留 `redo_lsn` 之后的所有日志。误区三：Redo 起点越靠前越安全——过早只增加工作量，不影响正确性（幂等）。误区四：未提交修改不会落盘——会，故必须 Undo。

## 七、与开源书·权威来源对应

- Mohan et al., *ARIES* (ACM TODS 1992) 全文，尤其 Analysis / Redo / Undo 三阶段。
- Silberschatz et al., *Database System Concepts* 第 17.6 节「ARIES」。
- 与 WAL 协同见「预写日志与检查点协同」；与脏页刷盘见「脏页链表与刷盘调度」。

## 八、面试题

1. 为什么 ARIES 要先 Redo 全部再 Undo？先把库恢复到崩溃前状态（含未提交修改），再统一回滚未提交事务，逻辑清晰且幂等、易实现。
2. Redo 起点怎么定？取检查点时刻最早脏页的 LSN（redo_lsn），此前修改已持久无需重放。
3. 为什么 Redo 幂等很重要？崩溃前可能部分修改已刷盘，重放时需用页 LSN 比对跳过已应用记录，避免重复。
4. 如何保证已提交不丢？已提交事务的日志在提交前已 fsync（WAL），其修改必在 redo_lsn 之后被重放。

并行 Redo 把日志按页分区多线程重放，大库恢复从分钟级降到秒级。物理 Redo（按页覆盖）与逻辑 Redo（按操作）混合，兼顾速度与跨版本兼容。云存储下推后，本地 Redo 区间缩短，恢复更多依赖共享存储的快照而非本地 WAL 全量重放。

## 九、演进与趋势

并行 Redo（多线程重放日志、按页分区）加速大库恢复；物理 Redo 与逻辑 Redo 混合进一步提速；增量检查点持续前推 `redo_lsn`，使重放区间更短（见「全量检查点与增量检查点」）。分布式共识日志把 Redo 起点概念推广到复制组。

Redo 起点取检查点最早脏页 LSN（redo_lsn），此前修改已持久。
Redo 幂等（页 LSN 比对跳过），早选无害只多做功。
Undo 只针对 Analysis 确定的未提交事务，逆序回滚。
并行 Redo 按页分区多线程，大库恢复降到秒级。
云存储下推后恢复更依赖共享快照而非本地全量重放。
ARIES 先全重放再 Undo，逻辑清晰且幂等。
分析阶段确定 redo_lsn 与活跃事务，是恢复前提。
物理 Redo 与逻辑 Redo 混合兼顾速度与兼容。
页 LSN 比对保证已应用记录不被重复应用。
检查点后日志不可全删，需保留 redo_lsn 之后。
未提交修改可能已落盘，必须 Undo 而非忽略。
已提交修改必在重放区间，保证不丢。
多副本下 Redo 起点需多数派一致。
恢复演练应定期做，验证 redo_lsn 与检查点正确。

## 十、小结

Redo 起点由检查点脏页的最小 LSN 决定，配合「重复历史」原则实现精确崩溃恢复：先幂等 Redo 重建崩溃前状态，再 Undo 未提交事务。理解 `redo_lsn` 与三阶段协议，是掌握 ARIES 恢复的核心。
